import test from "node:test";
import assert from "node:assert/strict";
import { connectRoom } from "../src/ws.js";

// A server-facing transport double: the client receives the same JSON frames as
// production. No React internals or acknowledgement implementation is replaced.
function harness(t) {
  const originals = new Map();
  function replace(key, value) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    });
  }
  let time = 0;
  let timerId = 0;
  const timers = new Map();
  replace("setTimeout", (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, at: time + delay });
    return id;
  });
  replace("clearTimeout", (id) => timers.delete(id));
  replace("location", { protocol: "http:", host: "localhost:5173" });
  class Socket {
    static OPEN = 1;
    static instances = [];
    readyState = 1;
    sent = [];
    constructor(url) {
      this.url = url;
      Socket.instances.push(this);
    }
    send(frame) {
      this.sent.push(JSON.parse(frame));
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.onclose?.();
    }
    receive(frame) {
      this.onmessage?.({ data: JSON.stringify(frame) });
    }
    state(value) {
      this.receive({ type: "state", ...value });
    }
  }
  replace("WebSocket", Socket);
  const statuses = [],
    errors = [],
    pending = [],
    states = [];
  const connection = connectRoom({
    code: "123456",
    role: "player",
    name: "测试玩家",
    onStatus: (s) => statuses.push(s),
    onError: (e) => errors.push(e),
    onPending: (p) => pending.push(p),
    onState: (s) => states.push(s),
  });
  t.after(() => {
    connection.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    connection,
    statuses,
    errors,
    pending,
    states,
    sockets: Socket.instances,
    advance(ms) {
      const until = time + ms;
      for (;;) {
        const due = [...timers]
          .filter(([, timer]) => timer.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        time = timer.at;
        timers.delete(id);
        timer.callback();
      }
      time = until;
    },
  };
}

const snapshot = (phase = "lobby", you = {}) => ({
  phase,
  you: { contribute: [], guesses: [], submitted: false, ...you },
});

async function expectPending(promise) {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await Promise.resolve();
  assert.equal(
    settled,
    false,
    "An unrelated room broadcast must not acknowledge this action",
  );
}

test("connection becomes usable only after the first authoritative state", async (t) => {
  const h = harness(t);
  assert.equal(h.statuses.at(-1), "connecting");
  await assert.rejects(h.connection.send({ type: "submit" }), /连接/);
  assert.deepEqual(h.sockets[0].sent, []);
  h.sockets[0].state(snapshot());
  assert.equal(h.statuses.at(-1), "connected");
});

test("all game commands require their own authoritative outcome, not another player broadcast", async (t) => {
  const h = harness(t),
    socket = h.sockets[0];
  const first = { id: "own-1", name: "天坛", lng: 116.4, lat: 39.8 };
  const second = { ...first, id: "own-2" };
  socket.state(snapshot("lobby", { contribute: [first] }));
  const cases = [
    [
      { type: "contribute", name: "天坛", lng: 116.4, lat: 39.8 },
      snapshot("lobby", { contribute: [first] }),
      snapshot("lobby", { contribute: [first, second] }),
    ],
    [
      { type: "remove_contribute", id: "own-1" },
      snapshot("lobby", { contribute: [first, second] }),
      snapshot("lobby", { contribute: [second] }),
    ],
    [{ type: "start" }, snapshot(), snapshot("playing")],
    [
      { type: "guess", targetId: "target-1", lng: 116.3, lat: 39.9 },
      snapshot("playing", {
        guesses: [{ targetId: "target-1", lng: 116.2, lat: 39.9 }],
      }),
      snapshot("playing", {
        guesses: [{ targetId: "target-1", lng: 116.3, lat: 39.9 }],
      }),
    ],
    [
      { type: "unguess", targetId: "target-1" },
      snapshot("playing", {
        guesses: [{ targetId: "target-1", lng: 116.3, lat: 39.9 }],
      }),
      snapshot("playing"),
    ],
    [
      { type: "submit" },
      snapshot("playing"),
      snapshot("reveal", { submitted: true }),
    ],
    [{ type: "reveal" }, snapshot("playing"), snapshot("reveal")],
  ];
  for (const [command, unrelated, confirmed] of cases) {
    socket.state(unrelated);
    const request = h.connection.send(command);
    socket.state({
      ...unrelated,
      players: [{ name: "另一个玩家", connected: true }],
    });
    await expectPending(request);
    socket.state(confirmed);
    assert.equal((await request).phase, confirmed.phase);
    assert.equal(h.pending.at(-1), false);
  }
  assert.equal(socket.sent.length, cases.length);
});

test("only one action can be pending and server rejection permits the next attempt", async (t) => {
  const h = harness(t),
    socket = h.sockets[0];
  socket.state(snapshot("playing"));
  const command = { type: "guess", targetId: "target-1", lng: 116, lat: 39 };
  const first = h.connection.send(command);
  await assert.rejects(h.connection.send(command), /上一项/);
  assert.equal(socket.sent.length, 1);
  socket.receive({ type: "error", message: "现在不能钉点" });
  await assert.rejects(first, /现在不能钉点/);
  assert.equal(h.pending.at(-1), false);
  const next = h.connection.send(command);
  socket.state(snapshot("playing", { guesses: [{ ...command }] }));
  await next;
  assert.equal(socket.sent.length, 2);
});

test("disconnect rejects pending actions; reconnect reads state without replay", async (t) => {
  const h = harness(t),
    socket = h.sockets[0];
  socket.state(snapshot("playing"));
  const action = h.connection.send({
    type: "guess",
    targetId: "t",
    lng: 116,
    lat: 39,
  });
  socket.close();
  await assert.rejects(action, /连接已断开/);
  assert.equal(h.statuses.at(-1), "reconnecting");
  await assert.rejects(h.connection.send({ type: "submit" }), /连接/);
  h.advance(1000);
  const restored = h.sockets[1];
  assert.ok(restored);
  assert.equal(h.statuses.at(-1), "reconnecting");
  restored.state(
    snapshot("playing", { guesses: [{ targetId: "t", lng: 116, lat: 39 }] }),
  );
  assert.equal(h.statuses.at(-1), "connected");
  assert.equal(h.states.at(-1).you.guesses.length, 1);
  assert.deepEqual(restored.sent, []);
});

test("confirmation timeout rejects and reconnects without retrying an uncertain write", async (t) => {
  const h = harness(t);
  h.sockets[0].state(snapshot());
  const action = h.connection.send({
    type: "contribute",
    name: "天坛",
    lng: 116,
    lat: 39,
  });
  h.advance(8000);
  await assert.rejects(action, /确认超时/);
  assert.equal(h.statuses.at(-1), "reconnecting");
  h.advance(1000);
  h.sockets[1].state(
    snapshot("lobby", {
      contribute: [{ id: "server-created", name: "天坛", lng: 116, lat: 39 }],
    }),
  );
  assert.deepEqual(h.sockets[1].sent, []);
  assert.equal(h.states.at(-1).you.contribute.length, 1);
});

test("terminal room error stops retries and cannot send more commands", async (t) => {
  const h = harness(t);
  h.sockets[0].receive({ type: "error", message: "房间不存在" });
  assert.equal(h.statuses.at(-1), "error");
  assert.match(h.errors.at(-1), /房间不存在或已失效/);
  await assert.rejects(h.connection.send({ type: "start" }), /连接/);
  h.advance(60_000);
  assert.equal(h.sockets.length, 1);
});

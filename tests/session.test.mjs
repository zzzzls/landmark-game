import test from "node:test";
import assert from "node:assert/strict";
import { connectSession } from "../src/session.js";

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
  const connection = connectSession({

    role: "admin",

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


test("global session waits for server state and matches request acknowledgements", async t => {
  const h = harness(t), ws = h.sockets[0];
  await assert.rejects(h.connection.send({ type: "create" }), /连接/);
  ws.receive({ type: "session", room: null });
  const task = h.connection.send({ type: "create" });
  await assert.rejects(h.connection.send({ type: "create" }), /上一项/);
  let resolved = false;
  task.then(() => { resolved = true; });
  ws.receive({ type: "session", room: "NEW1" });
  ws.receive({ type: "ack", requestId: "unrelated", room: "NEW1" });
  await Promise.resolve();
  assert.equal(resolved, false);
  ws.receive({ type: "ack", requestId: ws.sent[0].requestId, room: "NEW1" });
  assert.equal((await task).room, "NEW1");
});

test("missed restart and server reset are recovered from fresh session state without replay", async t => {
  const h = harness(t), ws = h.sockets[0];
  ws.receive({ type: "session", room: "OLD1" });
  const task = h.connection.send({ type: "restart", code: "OLD1" });
  ws.close();
  await assert.rejects(task, /连接已断开/);
  h.advance(1000);
  const next = h.sockets[1];
  next.receive({ type: "session", room: "NEW1" });
  assert.equal(h.states.at(-1).room, "NEW1");
  assert.deepEqual(next.sent, []);
  next.close(); h.advance(1000);
  h.sockets[2].receive({ type: "session", room: null });
  assert.equal(h.states.at(-1).room, null);
  assert.equal(h.statuses.at(-1), "connected");
});

test("heartbeat detects half-open transport and reconnects", async t => {
  const h = harness(t), ws = h.sockets[0];
  ws.receive({ type: "session", room: "OLD1" });
  h.advance(15000);
  assert.deepEqual(ws.sent, [{ type: "sync" }]);
  h.advance(10000);
  assert.equal(h.statuses.at(-1), "reconnecting");
  h.advance(1000);
  h.sockets[1].receive({ type: "session", room: "NEW1" });
  assert.equal(h.states.at(-1).room, "NEW1");
});

test("rejected restart and uncertain timeout do not create false success or replay", async t => {
  const h = harness(t), ws = h.sockets[0];
  ws.receive({ type: "session", room: "OLD1" });
  const task = h.connection.send({ type: "restart", code: "OLD1" });
  ws.receive({ type: "error", requestId: ws.sent[0].requestId, message: "请先揭晓" });
  await assert.rejects(task, /请先揭晓/);
  const uncertain = h.connection.send({ type: "restart", code: "OLD1" });
  h.advance(10000);
  await assert.rejects(uncertain, /确认超时/);
  h.advance(1000);
  h.sockets[1].receive({ type: "session", room: "NEW1" });
  assert.deepEqual(h.sockets[1].sent, []);
});

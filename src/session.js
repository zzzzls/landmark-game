import { useCallback, useEffect, useRef, useState } from "react";

export function connectSession({ role, onState, onStatus, onError, onPending }) {
  let socket, timer, heartbeat, handshake, stopped = false, ready = false, retry = 0, pending;
  function settle(error, value) {
    if (!pending) return;
    clearTimeout(pending.timer);
    const task = pending;
    pending = null;
    onPending?.(false);
    error ? task.reject(new Error(error)) : task.resolve(value);
  }
  function open() {
    if (stopped) return;
    ready = false;
    onStatus(retry ? "reconnecting" : "connecting");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws/session/${role}`);
    socket = ws;
    handshake = setTimeout(() => ws.close(), 10000);
    ws.onmessage = ({ data }) => {
      if (socket !== ws || stopped) return;
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg.type === "session") {
        clearTimeout(handshake);
        ready = true;
        retry = 0;
        onStatus("connected");
        onState(msg);
        clearTimeout(heartbeat);
        heartbeat = setTimeout(sync, 15000);
      } else if (msg.type === "ack" && msg.requestId === pending?.id) {
        settle(null, msg);
      } else if (msg.type === "error") {
        onError(msg.message);
        if (msg.requestId === pending?.id) settle(msg.message);
      }
    };
    ws.onclose = () => {
      if (socket !== ws || stopped) return;
      ready = false;
      clearTimeout(handshake);
      clearTimeout(heartbeat);
      settle("连接已断开，请等待同步后重试");
      onStatus("reconnecting");
      timer = setTimeout(open, Math.min(800 * ++retry, 4000));
    };
    ws.onerror = () => ws.close();
  }
  function sync() {
    if (stopped || !ready || socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "sync" }));
    clearTimeout(handshake);
    handshake = setTimeout(() => socket.close(), 10000);
  }
  open();
  return {
    sync,
    send(command) {
      if (!ready || stopped || socket?.readyState !== WebSocket.OPEN)
        return Promise.reject(new Error("正在连接，请稍后重试"));
      if (pending) return Promise.reject(new Error("上一项操作正在确认"));
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
        pending = { id, resolve, reject, timer: setTimeout(() => {
          settle("操作确认超时，正在重新同步；请核对房间后再试");
          socket.close();
        }, 10000) };
        onPending?.(true);
        try { socket.send(JSON.stringify({ ...command, requestId: id })); }
        catch { settle("操作未发送，请重试"); socket.close(); }
      });
    },
    close() {
      stopped = true;
      clearTimeout(timer); clearTimeout(heartbeat); clearTimeout(handshake);
      settle("连接已关闭"); socket?.close();
    },
  };
}

export function useSession(role) {
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    let active = true;
    setState(null);
    const conn = connectSession({ role,
      onState: next => { if (active) { setState(next); setError(""); } },
      onStatus: next => active && setStatus(next),
      onError: next => active && setError(next),
      onPending: next => active && setPending(next),
    });
    ref.current = conn;
    const sync = () => { if (!document.hidden) conn.sync(); };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", sync);
    return () => {
      active = false; conn.close(); ref.current = null;
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", sync);
    };
  }, [role]);
  const send = useCallback(command => ref.current?.send(command) || Promise.reject(new Error("正在连接")), []);
  return { state, status, error, pending, send };
}

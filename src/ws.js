import { useCallback, useEffect, useRef, useState } from "react";

export function roomSocketUrl(code, role, name) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const q = name ? `?name=${encodeURIComponent(name)}` : "";
  return `${proto}//${location.host}/ws/${encodeURIComponent(code)}/${encodeURIComponent(role)}${q}`;
}

export function connectRoom({ code, role, name, onState, onError, onRetry }) {
  const url = roomSocketUrl(code, role, name);
  let ws = null;
  let closed = false;
  let retry = 0;
  let timer = null;

  function open() {
    if (closed) return;
    ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "state") {
        retry = 0;
        onRetry?.(0);
        onState?.(msg);
      } else if (msg.type === "error") {
        const raw = msg.message || "出错了";
        const shown = raw === "房间不存在" ? "房间不存在或已失效" : raw;
        onError?.(shown);
        if (raw === "房间不存在" || raw === "这个昵称已经在房间里") {
          closed = true;
          try {
            ws?.close();
          } catch {
            /* ignore */
          }
        }
      }
    };
    ws.onclose = () => {
      if (closed) return;
      retry += 1;
      onRetry?.(retry);
      timer = setTimeout(open, Math.min(800 * retry, 4000));
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  open();

  return {
    send(obj) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
      }
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    },
  };
}

export function useRoom(code, role, name) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    setState(null);
    setError("");
    setRetry(0);
    const conn = connectRoom({
      code,
      role,
      name,
      onState: (msg) => {
        setError("");
        setRetry(0);
        setState(msg);
      },
      onError: setError,
      onRetry: setRetry,
    });
    ref.current = conn;
    return () => {
      conn.close();
      ref.current = null;
    };
  }, [code, role, name]);

  const send = useCallback((msg) => {
    ref.current?.send(msg);
  }, []);

  return { state, error, setError, send, retry };
}

export function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function formatDistance(m) {
  if (m == null || Number.isNaN(m)) return "—";
  if (m < 1000) return `${Math.round(m)} 米`;
  return `${(m / 1000).toFixed(2)} 公里`;
}

export function phaseLabel(phase) {
  if (phase === "lobby") return "大厅";
  if (phase === "playing") return "作答中";
  if (phase === "reveal") return "揭晓";
  return phase || "";
}

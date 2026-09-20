import { useCallback, useEffect, useRef, useState } from "react";

export function roomSocketUrl(code, role, name) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const q = name ? `?name=${encodeURIComponent(name)}` : "";
  return `${proto}//${location.host}/ws/${encodeURIComponent(code)}/${encodeURIComponent(role)}${q}`;
}

const samePoint = (a, b) =>
  a && Number(a.lng) === Number(b.lng) && Number(a.lat) === Number(b.lat);

function confirms(command, previous, next) {
  const you = next.you || {};
  switch (command.type) {
    case "contribute": {
      const previousIds = new Set(
        (previous?.you?.contribute || []).map((p) => p.id),
      );
      return (you.contribute || []).some(
        (p) =>
          !previousIds.has(p.id) &&
          p.name === (command.name?.trim() || "未命名地点") &&
          samePoint(p, command),
      );
    }
    case "remove_contribute":
      return !(you.contribute || []).some((p) => p.id === command.id);
    case "guess":
      return (you.guesses || []).some(
        (p) => p.targetId === command.targetId && samePoint(p, command),
      );
    case "unguess":
      return !(you.guesses || []).some((p) => p.targetId === command.targetId);
    case "submit":
      return you.submitted === true;
    case "start":
      return next.phase === "playing" || next.phase === "reveal";
    case "reveal":
      return next.phase === "reveal";
    default:
      return false;
  }
}

export function connectRoom({
  code,
  role,
  name,
  onState,
  onError,
  onRetry,
  onStatus,
  onPending,
}) {
  const url = roomSocketUrl(code, role, name);
  let ws = null;
  let closed = false;
  let ready = false;
  let retry = 0;
  let timer = null;
  let handshake = null;
  let latest = null;
  let pending = null;

  function settle(error, state) {
    if (!pending) return;
    const request = pending;
    pending = null;
    clearTimeout(request.timer);
    onPending?.(false);
    if (error) request.reject(new Error(error));
    else request.resolve(state);
  }

  function open() {
    if (closed) return;
    ready = false;
    onStatus?.(retry ? "reconnecting" : "connecting");
    const socket = new WebSocket(url);
    ws = socket;
    handshake = setTimeout(() => {
      if (socket === ws && !ready) socket.close();
    }, 10000);
    socket.onmessage = (ev) => {
      if (socket !== ws || closed) return;
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "state") {
        clearTimeout(handshake);
        ready = true;
        retry = 0;
        onRetry?.(0);
        onStatus?.("connected");
        latest = msg;
        onState?.(msg);
        if (pending && confirms(pending.command, pending.previous, msg))
          settle(null, msg);
      } else if (msg.type === "error") {
        const raw = msg.message || "操作失败，请重试";
        const shown =
          raw === "房间不存在" ? "房间不存在或已失效，请返回首页重新加入" : raw;
        settle(shown);
        onError?.(shown);
        if (["房间不存在", "这个昵称已经在房间里", "未知角色"].includes(raw)) {
          closed = true;
          ready = false;
          clearTimeout(handshake);
          onStatus?.("error");
          socket.close();
        }
      }
    };
    socket.onclose = (event) => {
      if (socket !== ws) return;
      if (event?.code === 4409) {
        closed = true;
        onStatus?.("error");
        onError?.("这个昵称已在其他页面登录，请关闭重复页面或更换昵称。");
      }
      clearTimeout(handshake);
      ready = false;
      settle("连接已断开，正在恢复房间状态；请确认结果后再操作");
      if (closed) return;
      retry += 1;
      onRetry?.(retry);
      onStatus?.("reconnecting");
      timer = setTimeout(open, Math.min(800 * retry, 4000));
    };
    socket.onerror = () => {
      /* WebSocket errors are followed by close. */
    };
  }

  open();
  return {
    send(command) {
      if (closed || !ready || ws?.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("连接尚未恢复，请稍后再试"));
      }
      if (pending)
        return Promise.reject(new Error("上一项操作正在确认，请稍候"));
      return new Promise((resolve, reject) => {
        pending = {
          command,
          previous: latest,
          resolve,
          reject,
          timer: setTimeout(() => {
            const message = "操作确认超时，正在重新同步；请核对结果后再试";
            settle(message);
            onError?.(message);
            ready = false;
            onStatus?.("reconnecting");
            ws?.close();
          }, 8000),
        };
        onPending?.(true);
        try {
          ws.send(JSON.stringify(command));
        } catch {
          settle("操作未发送，请等待连接恢复");
          ws.close();
        }
      });
    },
    close() {
      closed = true;
      ready = false;
      clearTimeout(timer);
      clearTimeout(handshake);
      settle("已离开房间");
      ws?.close();
    },
  };
}

export function useRoom(code, role, name) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState("connecting");
  const [pending, setPending] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    setState(null);
    setError("");
    setRetry(0);
    setStatus("connecting");
    setPending(false);
    let active = true;
    const conn = connectRoom({
      code,
      role,
      name,
      onState: (msg) => {
        if (active) {
          setError("");
          setState(msg);
        }
      },
      onError: (value) => {
        if (active) setError(value);
      },
      onRetry: (value) => {
        if (active) setRetry(value);
      },
      onStatus: (value) => {
        if (active) setStatus(value);
      },
      onPending: (value) => {
        if (active) setPending(value);
      },
    });
    ref.current = conn;
    return () => {
      active = false;
      conn.close();
      ref.current = null;
    };
  }, [code, role, name]);

  const send = useCallback((msg) => {
    if (!ref.current) return Promise.reject(new Error("连接尚未建立"));
    return ref.current.send(msg);
  }, []);
  return { state, error, setError, send, retry, status, pending };
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

import { useState } from "react";
import { navigate } from "./ws.js";

export default function Home() {
  const [name, setName] = useState(() => sessionStorage.getItem("lg-name") || "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);

  function saveName(n) {
    const v = n.trim();
    sessionStorage.setItem("lg-name", v);
    return v;
  }

  async function createRoom(e) {
    e.preventDefault();
    const n = saveName(name);
    if (!n) {
      setError("请先填写昵称");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      const data = await res.json();
      if (!data.code) throw new Error("create_failed");
      navigate(`/r/${data.code}/admin?name=${encodeURIComponent(n)}`);
    } catch {
      setError("创建房间失败，请确认服务已启动");
    } finally {
      setBusy(false);
    }
  }

  async function join(e, asScreen) {
    e.preventDefault();
    const room = code.trim().toUpperCase();
    if (!room) {
      setError("请填写房间号");
      return;
    }
    if (!asScreen) {
      const n = saveName(name);
      if (!n) {
        setError("请先填写昵称");
        return;
      }
    }
    setJoining(true);
    setError("");
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(room)}`);
      if (!res.ok) {
        setError("房间不存在");
        return;
      }
    } catch {
      setError("无法连接服务器");
      return;
    } finally {
      setJoining(false);
    }
    if (asScreen) {
      navigate(`/r/${room}/screen`);
      return;
    }
    const n = saveName(name);
    navigate(`/r/${room}?name=${encodeURIComponent(n)}`);
  }

  return (
    <div className="home">
      <div className="home-stack">
        <header className="home-hero">
          <h1>北京地标盲猜</h1>
          <p>搜地点，钉在地图上</p>
        </header>

        <div className="card">
          <label>
            昵称
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：小明"
              maxLength={16}
              autoComplete="nickname"
            />
          </label>
        </div>

        <form className="card" onSubmit={createRoom}>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "创建中…" : "创建房间"}
          </button>
          <p className="hint host-note">你是房主，可开始和揭晓</p>
        </form>

        <form className="card" onSubmit={(e) => join(e, false)}>
          <label>
            房间号
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="四位房间号"
              maxLength={4}
              autoCapitalize="characters"
              autoCorrect="off"
            />
          </label>
          <button type="submit" className="primary" disabled={joining}>
            {joining ? "加入中…" : "加入"}
          </button>
        </form>

        <button type="button" className="text-btn screen-link" onClick={(e) => join(e, true)}>
          大屏
        </button>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}

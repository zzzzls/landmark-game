import { useState } from "react";
import { navigate } from "./ws.js";
import { Brand, Guide, Icon } from "./UI.jsx";

export default function Home({ roomCode = "", suffix = "" }) {
  const [name, setName] = useState(
    () => sessionStorage.getItem("lg-name") || "",
  );
  const [code, setCode] = useState(roomCode);
  const [mode, setMode] = useState("join");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(false);
  async function enter(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    const n = name.trim(),
      c = code.trim().toUpperCase();
    if (mode !== "screen" && !n) {
      setError("先取一个昵称，让朋友认出你。");
      return;
    }
    if (mode !== "create" && !/^[A-Z0-9]{4}$/.test(c)) {
      setError("请输入四位房间号，可向房主获取。");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        mode === "create"
          ? "/api/rooms"
          : `/api/rooms/${encodeURIComponent(c)}`,
        {
          method: mode === "create" ? "POST" : "GET",
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!res.ok)
        throw new Error(
          res.status === 404
            ? "房间不存在或已失效，请核对房间号。"
            : "暂时无法进入房间，请重试。",
        );
      const data = await res.json();
      if (!data.code) throw new Error("房间信息不完整，请重试。");
      if (mode !== "screen") sessionStorage.setItem("lg-name", n);
      navigate(
        `/r/${data.code}${mode === "create" ? "/admin" : mode === "screen" ? "/screen" : suffix}${mode === "screen" ? "" : `?name=${encodeURIComponent(n)}`}`,
      );
    } catch (err) {
      setError(
        err.name === "TimeoutError"
          ? "连接超时，请重试。"
          : err.message === "Failed to fetch"
            ? "无法连接服务器，请检查网络。"
            : err.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="home">
      <nav className="home-nav">
        <Brand />
        <button className="text-btn" onClick={() => setGuide(true)}>
          <Icon name="help" />
          怎么玩
        </button>
      </nav>
      <div className="home-layout">
        <section className="home-story">
          <h1>
            凭记忆，
            <br />找<span>北京。</span>
          </h1>
          <p className="home-intro">
            熟悉的城市，换个方式相遇。
            <br />
            藏起地名，看看谁的方向感更准。
          </p>
          <ol className="home-rules">
            <li>
              <b>02</b>
              <span>
                贡献地点<small>给朋友出两道题</small>
              </span>
            </li>
            <li>
              <b>03</b>
              <span>
                地图盲猜<small>凭记忆标记位置</small>
              </span>
            </li>
            <li>
              <Icon name="trophy" size={28} />
              <span>
                揭晓排名<small>总误差越小越好</small>
              </span>
            </li>
          </ol>
          <p className="home-footnote">同一片北京，各自的城市记忆。</p>
        </section>
        <section className="entry-panel">
          <div className="entry-heading">
            <Icon
              name={
                mode === "create"
                  ? "pin"
                  : mode === "screen"
                    ? "screen"
                    : "users"
              }
              size={28}
            />
            <h2>
              {roomCode
                ? `加入房间 ${roomCode}`
                : mode === "create"
                  ? "做这局的房主"
                  : mode === "screen"
                    ? "打开现场大屏"
                    : "朋友们，集合了"}
            </h2>
            <p>
              {mode === "create"
                ? "邀请朋友来一场北京记忆挑战。"
                : mode === "screen"
                  ? "输入房间号，实时观看大家的挑战。"
                  : "输入房间号，加入这一场城市探索。"}
            </p>
          </div>
          {!roomCode && (
            <div className="entry-tabs" role="group" aria-label="进入方式">
              <button
                aria-pressed={mode === "join"}
                onClick={() => {
                  setMode("join");
                  setError("");
                }}
              >
                加入游戏
              </button>
              <button
                aria-pressed={mode === "create"}
                onClick={() => {
                  setMode("create");
                  setError("");
                }}
              >
                创建房间
              </button>
            </div>
          )}
          <form onSubmit={enter}>
            {mode !== "screen" && (
              <label htmlFor="nickname">
                你的昵称
                <input
                  id="nickname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="朋友们怎么称呼你？"
                  maxLength={16}
                  autoComplete="nickname"
                  required
                />
              </label>
            )}
            {mode !== "create" && (
              <label htmlFor="room-code">
                房间号
                <input
                  id="room-code"
                  className="code-input"
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                    )
                  }
                  placeholder="例如 ABCD"
                  maxLength={4}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary entry-submit" disabled={busy}>
              {busy
                ? "正在连接…"
                : mode === "create"
                  ? "创建房间"
                  : mode === "screen"
                    ? "进入大屏"
                    : "加入游戏"}
              <Icon name="arrow" />
            </button>
          </form>
          <p className="entry-note">
            {mode === "create"
              ? "你可以主持，也可以一起答题。"
              : "无需注册，取个昵称就能开始。"}
          </p>
          {!roomCode && (
            <button
              className="text-btn screen-entry"
              onClick={() => {
                setMode(mode === "screen" ? "join" : "screen");
                setError("");
              }}
            >
              <Icon name={mode === "screen" ? "back" : "screen"} />
              {mode === "screen" ? "返回玩家入口" : "我是来开大屏的"}
            </button>
          )}
        </section>
      </div>
      <Guide open={guide} onClose={() => setGuide(false)} />
    </main>
  );
}

import { useState } from "react";
import { Brand, Guide, Icon } from "./UI.jsx";
import { PixelSkyline, PixelFace } from "./PixelArt.jsx";

export default function Home({ role, name, onName, session }) {
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState("");
  const [guide, setGuide] = useState(false);
  const admin = role === "admin";
  const connected = session.status === "connected";
  function enter(event) {
    event.preventDefault();
    if (!draft.trim()) { setError("取一个昵称，让朋友认出你。"); return; }
    onName(draft.trim()); setError("");
  }
  async function create() {
    setError("");
    try { await session.send({ type: "create" }); }
    catch (err) { setError(err.message); }
  }
  return <main className={`home session-home ${role === "screen" ? "waiting-screen" : ""}`}>
    <nav className="home-nav"><Brand /><button className="text-btn" onClick={() => setGuide(true)}><Icon name="help" />怎么玩</button></nav>
    <div className="home-layout">
      <section className="session-hero">
        <h1>北京地图<br /><span>闯关开始！</span></h1>
        <p className="home-intro">收起地名，打开方向感。<br />和朋友一起，找到记忆里的北京。</p>
        <PixelSkyline />
        <ol className="home-rules"><li><b>02</b><span>贡献地点<small>给朋友出题</small></span></li><li><b>03</b><span>盲猜钉点<small>提交即看成绩</small></span></li><li><Icon name="trophy" size={28} /><span>争夺排名<small>误差越小越好</small></span></li></ol>
      </section>
      <section className="entry-panel session-entry">
        <PixelFace />
        <h2>{admin ? "管理员控制台" : role === "screen" ? "现场大屏" : "准备好挑战了吗？"}</h2>
        {!name && role !== "screen" ? <form onSubmit={enter}>
          <label htmlFor="nickname">你的昵称</label>
          <input id="nickname" value={draft} onChange={e => setDraft(e.target.value)} maxLength={32} placeholder="例如：胡同探险家" autoComplete="nickname" />
          <button className="primary" type="submit">{admin ? "进入控制台" : "加入游戏"}<Icon name="arrow" /></button>
          <p className="muted small">无需房间号，自动加入管理员的当前游戏。</p>
        </form> : <div className="session-waiting" role="status">
          <h3>{!connected ? session.status === "reconnecting" ? "正在重连…" : "正在连接游戏…" : admin ? "开启一场北京冒险" : "等待管理员创建房间"}</h3>
          <p>{!connected ? "连接恢复后会自动同步，请稍候。" : admin ? "建房后，等待中的玩家和大屏会自动进入。" : `${name ? `${name}，` : ""}房间准备好后自动进入，无需刷新。`}</p>
          {admin && <button className="primary" disabled={!connected || session.pending} onClick={create}>{session.pending ? "正在创建…" : "创建房间"}<Icon name="flag" /></button>}
          {admin && <a className="secondary" href="/screen" target="_blank" rel="noreferrer"><Icon name="screen" />打开大屏</a>}
        </div>}
        {(error || session.error) && <p className="error" role="alert">{error || session.error}</p>}
      </section>
    </div>
    <Guide open={guide} onClose={() => setGuide(false)} />
  </main>;
}

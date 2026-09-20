import { useState } from "react";
import { Brand, Guide, Icon } from "./UI.jsx";
import { PixelCity, PixelGuide } from "./PixelArt.jsx";

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
  return <main className={`home session-home arcade-home ${role === "screen" ? "waiting-screen" : ""}`}>
    <nav className="home-nav"><Brand /><button className="text-btn" onClick={() => setGuide(true)}><Icon name="help" />怎么玩</button></nav>
    <div className="home-layout">
      <section className="session-hero">
        <div className="hero-sign"><Icon name="flag" size={16} /> 北京地标 · 记忆挑战</div>
        <h1><small>没了地名，</small>你还认得<br /><span>北京吗？</span></h1>
        <p className="home-intro">把熟悉的城市，凭记忆找一遍。</p>
        <div className="hero-city"><PixelCity /><span className="city-caption">胡同里见，地图上比。</span></div>
      </section>
      <section className="entry-panel session-entry admission-ticket">
        <div className="ticket-topline"><span>{admin ? "主持席" : role === "screen" ? "观赛席" : "玩家入场券"}</span><Icon name="pin" size={17} /></div>
        <div className="ticket-welcome"><div><p className="ticket-eyebrow">北京地标盲猜</p><h2>{admin ? "今天，你来开场" : role === "screen" ? "一起见证好方向" : "这局，算你一个"}</h2></div><PixelGuide /></div>
        {!name && role !== "screen" ? <form onSubmit={enter}>
          <label htmlFor="nickname">你的昵称</label>
          <input id="nickname" value={draft} onChange={e => setDraft(e.target.value)} maxLength={32} placeholder="例如：胡同探险家" autoComplete="nickname" />
          <button className="primary" type="submit">{admin ? "进入控制台" : "加入游戏"}<Icon name="arrow" /></button>
          <p className="muted small">无需房间号，自动加入当前游戏。</p>
        </form> : <div className="session-waiting" role="status">
          <h3>{!connected ? session.status === "reconnecting" ? "正在重连…" : "正在连接游戏…" : admin ? "开启一场北京冒险" : "等待管理员创建房间"}</h3>
          <p>{!connected ? "连接恢复后会自动同步，请稍候。" : admin ? "建房后，等待中的玩家和大屏会自动进入。" : `${name ? `${name}，` : ""}房间准备好后自动进入，无需刷新。`}</p>
          {admin && <button className="primary" disabled={!connected || session.pending} onClick={create}>{session.pending ? "正在创建…" : "创建房间"}<Icon name="flag" /></button>}
          {admin && <a className="secondary" href="/screen" target="_blank" rel="noreferrer"><Icon name="screen" />打开大屏</a>}
        </div>}
        {(error || session.error) && <p className="error" role="alert">{error || session.error}</p>}
        <ol className="home-rules ticket-rules"><li><b>02</b><span>出题<small>给朋友的挑战</small></span></li><li><b>03</b><span>盲猜<small>凭记忆落针</small></span></li><li><Icon name="trophy" size={26} /><span>揭晓<small>误差越小越好</small></span></li></ol>
      </section>
    </div>
    <div className="home-bottom"><span>一座北京 · 三次落针</span><span>和朋友一起，比比方向感</span></div>
    <Guide open={guide} onClose={() => setGuide(false)} />
  </main>;
}

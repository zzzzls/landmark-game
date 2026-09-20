import { useEffect, useRef, useState } from "react";
import { useRoom, phaseLabel, formatDistance } from "./ws.js";
import MapView from "./MapView.jsx";
import { screenMapOverlays } from "./mapOverlays.js";
import { Roster } from "./Panels.jsx";
import { WinnerSpotlight } from "./Results.jsx";
import { Brand, Icon, Toast, useToast } from "./UI.jsx";
import { Invite } from "./Invite.jsx";
import { PixelCity } from "./PixelArt.jsx";
export default function Screen({ code }) {
  const { state, error, status } = useRoom(code, "screen", "");
  const [padding, setPadding] = useState([110, 450, 50, 40]);
  const rail = useRef(null);
  const phase = state?.phase;
  const players = state?.players || [];
  const ready = players.filter((p) => p.contributed >= 2);
  const done = ready.filter((p) => p.submitted);
  const [visibleIds, setVisibleIds] = useState(null);
  const { toast, showToast } = useToast();
  let mapState = state || {};
  if (phase === "reveal" && visibleIds) {
    const screenPins = (state.screenPins || []).filter(player => visibleIds.includes(player.playerId));
    const targetIds = new Set((state.playerResults || []).filter(player => visibleIds.includes(player.playerId)).flatMap(player => player.results.map(place => place.id)));
    mapState = { ...state, screenPins, truePins: (state.truePins || []).filter(place => targetIds.has(place.id)) };
  }
  const overlays = screenMapOverlays(mapState);
  useEffect(() => {
    const measure = () => {
      const r = rail.current?.getBoundingClientRect();
      if (!r) return;
      setPadding(
        window.innerWidth <= 860
          ? [100, 24, window.innerHeight - r.top + 20, 24]
          : [110, window.innerWidth - r.left + 28, 40, 40],
      );
    };
    const ob = new ResizeObserver(measure);
    if (rail.current) ob.observe(rail.current);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      ob.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return (
    <main className="screen-page" data-phase={phase || "connecting"} data-sparse={players.length <= 3 ? "true" : undefined}>
      <MapView
        references={state?.references || []}
        pins={overlays.pins}
        lines={overlays.lines}
        fitKey={`${phase}-${visibleIds?.join(",")}-${overlays.pins.length}-${overlays.lines.length}`}
        fitPadding={padding}
      />
      <header className="screen-header">
        <a href="/" aria-label="返回首页">
          <Brand />
        </a>
        <span className="screen-phase">
          <span className="phase-dot" />
          {phaseLabel(phase) || "连接中"} · 现场大屏
        </span>
        <span className="screen-room">
          房间 <strong>{code}</strong>
        </span>
      </header>
      <aside className="screen-rail" ref={rail}>
        <div className="screen-title">
          <Icon
            name={
              phase === "reveal"
                ? "trophy"
                : phase === "playing"
                  ? "pin"
                  : "users"
            }
            size={32}
          />
          <h1>
            {phase === "reveal"
              ? "这一局，北京有了答案"
              : phase === "playing"
                ? "大家正在寻找北京"
                : "把北京，交给你的方向感"}
          </h1>
          <p>
            {phase === "reveal"
              ? "总距离误差越小，排名越靠前。"
              : phase === "playing"
                ? "凭记忆落针，答案即将揭晓。"
                : "手机打开游戏地址，自动加入，一起挑战。"}
          </p>
        </div>
        {status !== "connected" && (
          <p className="error" role="status">
            {status === "error"
              ? "房间连接不可用"
              : status === "reconnecting"
                ? "连接中断，正在重连…"
                : "正在同步房间…"}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
            <a href="/">返回首页</a>
          </p>
        )}
        {phase === "lobby" && (
          <>
            <Invite onCopy={showToast} />
            <div className="screen-progress">
              <span><b>{players.length}</b> 人已加入</span>
              <strong><b>{ready.length}</b> 人已准备</strong>
            </div>
            <Roster players={players} phase={phase} />
            <div className="screen-howto">
              <span>出 2 道题</span>
              <Icon name="arrow" />
              <span>猜 3 个点</span>
              <Icon name="arrow" />
              <span>揭晓排名</span>
            </div>
          </>
        )}
        {phase === "playing" && (
          <>
            <div className="submission-count">
              <strong>
                {done.length}
                <span> / {ready.length}</span>
              </strong>
              <span>已提交答案</span>
            </div>
            <div className="progress-track">
              <div
                style={{
                  transform: `scaleX(${ready.length ? done.length / ready.length : 0})`,
                }}
              />
            </div>
            <Roster players={players} phase={phase} />
            <p className="muted small screen-explain">
              提交后的猜测点会出现在地图上。
              <br />
              真实位置与成绩在揭晓后公布。
            </p>
          </>
        )}
        {phase === "reveal" && (
          <>
            <WinnerSpotlight board={state.leaderboard} roomCode={code} />
            <ScreenResults rows={state.playerResults || []} onVisible={setVisibleIds} />
            <p className="map-legend">
              <span className="legend-dot guess" />
              猜测点
              <span className="legend-dot truth" />
              真实位置
            </p>
          </>
        )}
        {players.length <= 3 && <div className="screen-city-footer" aria-hidden="true"><PixelCity /></div>}
      </aside>
      <Toast message={toast} />
    </main>
  );
}

export function ScreenResults({ rows, onVisible }) {
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const count = Math.max(1, Math.ceil(rows.length / 6));
  const safePage = Math.min(page, count - 1);
  const visible = rows.slice(safePage * 6, safePage * 6 + 6);
  const visibleKey = visible.map(player => player.playerId).join(",");
  useEffect(() => { onVisible?.(visibleKey ? visibleKey.split(",") : []); }, [visibleKey, onVisible]);
  useEffect(() => {
    if (paused || hovered || count < 2) return;
    const timer = setInterval(() => setPage(value => (value + 1) % count), 10000);
    return () => clearInterval(timer);
  }, [paused, hovered, count]);
  return <section className="screen-results" aria-label="全场三题成绩" data-count={visible.length}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setHovered(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false); }}>
    <div className="screen-result-heading"><span>排名 / 玩家</span><span>三个地点 · 距离误差</span></div>
    {visible.map(player => <article className="screen-result-row" data-rank={player.rank} key={player.playerId}>
      <div className="screen-result-rank">{player.rank || "—"}</div>
      <div className="screen-result-player"><strong>{player.name}</strong><span>{player.submitted ? formatDistance(player.totalError) : player.participating ? "未提交 · 不计分" : "未参与本局"}</span></div>
      <div className="screen-result-places">{player.results.length ? player.results.map((place, i) => <div key={place.id}><span className="screen-place-name"><b>{i + 1}</b>{place.name}</span><strong>{place.distance_m == null ? "未计分" : formatDistance(place.distance_m)}</strong></div>) : <p className="muted">本局没有分配题目</p>}</div>
    </article>)}
    {count > 1 && <nav className="screen-pagination" aria-label="成绩翻页">
      <button className="secondary" aria-label="上一页" onClick={() => setPage((safePage + count - 1) % count)}>上一页</button>
      <span>{safePage + 1} / {count} 页 · {rows.length} 人</span>
      <button className="secondary" aria-label="下一页" onClick={() => setPage((safePage + 1) % count)}>下一页</button>
      <button className="text-btn" onClick={() => { setPaused(value => !value); setHovered(false); }}>{paused ? "继续轮播" : "暂停轮播"}</button>
    </nav>}
  </section>;
}

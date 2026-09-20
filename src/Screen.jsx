import { useEffect, useRef, useState } from "react";
import { useRoom, phaseLabel } from "./ws.js";
import MapView from "./MapView.jsx";
import { screenMapOverlays } from "./mapOverlays.js";
import { Leaderboard, Roster } from "./Panels.jsx";
import { Brand, Icon } from "./UI.jsx";
export default function Screen({ code }) {
  const { state, error, status } = useRoom(code, "screen", "");
  const [padding, setPadding] = useState([110, 450, 50, 40]);
  const rail = useRef(null);
  const phase = state?.phase;
  const players = state?.players || [];
  const ready = players.filter((p) => p.contributed >= 2);
  const done = ready.filter((p) => p.submitted);
  const overlays = screenMapOverlays(state || {});
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
    <main className="screen-page" data-phase={phase || "connecting"}>
      <MapView
        pins={overlays.pins}
        lines={overlays.lines}
        fitKey={`${phase}-${overlays.pins.length}-${overlays.lines.length}`}
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
              ? "北京，有你熟悉的方向"
              : phase === "playing"
                ? "大家正在寻找北京"
                : "下一位城市向导，是谁？"}
          </h1>
          <p>
            {phase === "reveal"
              ? "总距离误差越小，排名越靠前。"
              : phase === "playing"
                ? "凭记忆落针，答案即将揭晓。"
                : "拿起手机，输入房间号，一起挑战。"}
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
            <div className="big-room-code">{code}</div>
            <div className="screen-progress">
              <span>{players.length} 人已加入</span>
              <strong>{ready.length} 人已准备</strong>
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
            <Leaderboard board={state.leaderboard} />
            {ready.some((p) => !p.submitted) && (
              <div className="unsubmitted">
                <h2>本局未提交</h2>
                <p>
                  {ready
                    .filter((p) => !p.submitted)
                    .map((p) => p.name)
                    .join("、")}
                </p>
              </div>
            )}
            <p className="map-legend">
              <span className="legend-dot guess" />
              猜测点
              <span className="legend-dot truth" />
              真实位置
            </p>
          </>
        )}
      </aside>
    </main>
  );
}

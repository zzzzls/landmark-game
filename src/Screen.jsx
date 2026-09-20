import { phaseLabel, useRoom } from "./ws.js";
import MapView from "./MapView.jsx";
import {
  Brand,
  DisconnectBanner,
  Leaderboard,
  PlayerList,
  fitPadForScreen,
  screenMapOverlays,
  useIsPhone,
} from "./Panels.jsx";

export default function Screen({ code }) {
  const { state, error, retry } = useRoom(code, "screen", "");
  const isPhone = useIsPhone();
  const overlays = screenMapOverlays(state || {});
  const pins = overlays.pins;
  const lines = overlays.lines;
  const phase = state?.phase;
  const players = state?.players || [];
  const board = state?.leaderboard || [];
  const pending = players.filter((p) => !p.submitted && p.contributed >= 2);
  const roomGone = error === "房间不存在或已失效" || error === "房间不存在";

  if (roomGone && !state) {
    return (
      <div className="app screen">
        <aside className="rail">
          <Brand title="地标盲猜" subtitle="大屏" />
          <div className="error">房间不存在或已失效</div>
        </aside>
      </div>
    );
  }

  return (
    <div className="app screen">
      <MapView
        pins={pins}
        lines={lines}
        fitKey={state ? phase + String(pins.length) + String(lines.length) : ""}
        fitPadding={fitPadForScreen(isPhone)}
      />
      <aside className="rail">
        {!state ? (
          <>
            <Brand title="地标盲猜" subtitle="大屏 · 连接中…" />
            {error && <div className="error">{error}</div>}
          </>
        ) : phase === "lobby" ? (
          <>
            <Brand title="地标盲猜" subtitle={phaseLabel(phase)} />
            <div className="screen-code">{state.room}</div>
            <section className="panel">
              <h2>已加入</h2>
            </section>
            <PlayerList players={players} phase={phase} />
            {error && <div className="error">{error}</div>}
          </>
        ) : phase === "playing" ? (
          <>
            <Brand title={`房间 ${state.room}`} subtitle={phaseLabel(phase)} />
            <section className="panel">
              <h2>作答中</h2>
            </section>
            {pending.length > 0 && (
              <>
                <section className="panel">
                  <h2>未提交</h2>
                </section>
                <ul className="pending">
                  {pending.map((p) => (
                    <li key={p.id}>
                      <span className="dot" style={{ background: p.color }} />
                      {p.name}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {error && <div className="error">{error}</div>}
          </>
        ) : (
          <>
            <Brand title={`房间 ${state.room}`} subtitle={phaseLabel(phase)} />
            <section className="panel">
              <h2>排名</h2>
            </section>
            <Leaderboard board={board} showDistance />
            {error && <div className="error">{error}</div>}
          </>
        )}
      </aside>
      <DisconnectBanner retry={retry} />
    </div>
  );
}

import { useEffect, useState } from "react";
import { formatDistance } from "./ws.js";
import { Icon } from "./UI.jsx";
import MapView from "./MapView.jsx";
import { playerMapOverlays } from "./mapOverlays.js";
import { bestResult } from "./answerFlow.js";

// Celebration belongs to a completed round, not every visit to its scorecard.
function useRevealMoment(id, complete) {
  const key = `lg-result-seen:${id}`;
  const [celebrating, setCelebrating] = useState(() => {
    if (!complete) return false;
    try {
      return !sessionStorage.getItem(key);
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (!complete || !celebrating) return;
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* Storage can be disabled. */
    }
    const timer = setTimeout(() => setCelebrating(false), 1400);
    return () => clearTimeout(timer);
  }, [key, complete, celebrating]);
  return celebrating;
}

export function DistanceValue({ meters }) {
  const [value, unit] = formatDistance(meters).split(" ");
  return (
    <>
      <span className="distance-number">{value}</span>
      {unit && (
        <>
          {" "}
          <small className="distance-unit">{unit}</small>
        </>
      )}
    </>
  );
}

export function WinnerSpotlight({ board = [], roomCode }) {
  const winner = board[0];
  const celebrating = useRevealMoment(`winner:${roomCode}`, !!winner);
  if (!winner) return null;
  return (
    <div className={`winner-spotlight${celebrating ? " is-celebrating" : ""}`}>
      <div className="winner-emblem" aria-hidden="true">
        <Icon name="trophy" size={40} />
        <b>{winner.rank}</b>
      </div>
      <div className="winner-identity">
        <span className="winner-label">
          {board.length > 1 ? "本局头名 · 方向感领跑" : "单人挑战 · 顺利完赛"}
        </span>
        <h2>{winner.name}</h2>
      </div>
      <div className="winner-distance">
        <span>三题总误差</span>
        <strong>
          <DistanceValue meters={winner.totalError} />
        </strong>
      </div>
    </div>
  );
}

export function PersonalResults({
  you,
  playerName,
  final = true,
  row,
  board = [],
  roomCode,
  selectedId,
  onSelect,
}) {
  const results = you.results || [];
  const complete = !!(you.submitted && Number.isFinite(you.totalError));
  const spectator = !(you.targets || []).length;
  const celebrating = useRevealMoment(`${roomCode}:${you.id}`, complete);
  const best = bestResult(you);
  const bestOverlays = best
    ? playerMapOverlays(
        {
          ...you,
          targets: you.targets.filter((t) => t.id === best.id),
          results: [best],
        },
        "reveal",
      )
    : null;
  const nextChallenge = !complete
    ? spectator
      ? "本局旁观，下一局再一起挑战。"
      : "本局未提交完整答案，未计入排名。"
    : !final
      ? "已提交，最终排名待公布。"
      : null;
  return (
    <section
      className={`personal-results${celebrating ? " is-celebrating" : ""}`}
      aria-label="个人成绩单"
    >
      <div className="result-hero">
        <div
          className={`result-summary score-ticket${complete ? " is-complete" : " is-incomplete"}`}
        >
          {complete && (
            <span className="result-sparks" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <i key={i} style={{ "--spark": i }} />
              ))}
            </span>
          )}
          <div className="result-identity">
            <h2 className="result-headline">
              {complete ? "本局成绩" : "本局回看"}
            </h2>
            <span>{playerName}</span>
          </div>
          <div className="result-score-row">
            <div className="result-score">
              <span>
                {complete
                  ? "三题总误差"
                  : spectator
                    ? "本局旁观"
                    : "本局未提交"}
              </span>
              <strong>
                {complete ? (
                  <DistanceValue meters={you.totalError} />
                ) : (
                  "未计入排名"
                )}
              </strong>
            </div>
            {complete && final && row && (
              <div className="result-seal">
                <span>{board.length > 1 ? "本局排名" : "单人挑战"}</span>
                <span className="result-rank">
                  第 <b>{row.rank}</b> 名
                </span>
              </div>
            )}
          </div>
        </div>
        {complete && best && (
          <figure className="best-map-card" data-target-id={best.id}>
            <figcaption>
              <div>
                <span className="best-label">
                  <Icon name="pin" size={13} />
                  最准一题
                </span>
                <strong>{best.name}</strong>
              </div>
              <b>{formatDistance(best.distance_m)}</b>
            </figcaption>
            <div
              className="result-map-preview"
              onClick={(event) => {
                if (!event.target.closest("button,a")) onSelect(best.id);
              }}
            >
              <MapView
                variant="thumbnail"
                pins={bestOverlays.pins}
                lines={bestOverlays.lines}
                fitKey={`best-${roomCode}-${best.id}`}
                fitPadding={[12, 12, 16, 12]}
              />
            </div>
            <div className="thumbnail-legend">
              <span>
                <i className="legend-dot guess" />
                你的猜测
              </span>
              <span>
                <i className="legend-dot truth" />
                真实位置
              </span>
              <button
                className="thumbnail-open"
                onClick={() => onSelect(best.id)}
                aria-label={`展开最准一题地图：${best.name}`}
              >
                <Icon name="screen" size={15} />
                展开地图
              </button>
            </div>
          </figure>
        )}
      </div>
      {nextChallenge && <p className="result-challenge">{nextChallenge}</p>}
      {results.length > 0 && (
        <div className="result-detail-heading">
          <h3>三个地点，逐一回看</h3>
          <span>点选回看</span>
        </div>
      )}
      <ul className="result-list">
        {results.map((r, i) => (
          <li key={r.id}>
            <button
              className={selectedId === r.id ? "selected" : ""}
              onClick={() => onSelect(r.id)}
              aria-label={`查看${r.name}的结果`}
              aria-pressed={selectedId === r.id}
            >
              <span
                className={`slot-number${complete && r.id === best?.id ? " best-pin" : ""}`}
              >
                {i + 1}
              </span>
              <span className="person-name">
                {r.name}
                <small>
                  {r.distance_m == null
                    ? "未计分 · 看看真实位置"
                    : r.id === best?.id
                      ? "最准一题"
                      : "查看猜测与真实位置"}
                </small>
              </span>
              <strong>{formatDistance(r.distance_m)}</strong>
              <Icon name="arrow" size={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

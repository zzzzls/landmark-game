import { useEffect, useState } from "react";
import { formatDistance } from "./ws.js";
import { Icon } from "./UI.jsx";

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

function InkRoute() {
  return (
    <svg
      className="result-route"
      viewBox="0 0 320 56"
      fill="none"
      aria-hidden="true"
    >
      <path className="route-base" d="M-10 40h46l25-24h65l28 25h63l30-25h88" />
      <path
        className="route-ink"
        pathLength="1"
        d="M-10 40h46l25-24h65l28 25h63l30-25h88"
      />
      <circle cx="61" cy="16" r="4" />
      <circle cx="217" cy="41" r="4" />
    </svg>
  );
}

export function WinnerSpotlight({ board = [] }) {
  const winner = board[0];
  if (!winner) return null;
  return (
    <div className="winner-spotlight">
      <Icon name="trophy" size={32} />
      <div>
        <h2>{winner.name}</h2>
        <p>
          {board.length > 1 ? "本局头名" : "挑战完成"}
          <span>总误差 {formatDistance(winner.totalError)}</span>
        </p>
      </div>
    </div>
  );
}

export function PersonalResults({
  you,
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
  const scored = results.filter((r) => Number.isFinite(r.distance_m));
  const best = scored.reduce(
    (pick, r) => (!pick || r.distance_m < pick.distance_m ? r : pick),
    null,
  );
  const previous = row && board.find((p) => p.rank === row.rank - 1);
  const gap = previous ? row.totalError - previous.totalError : null;
  const headline = !complete
    ? spectator
      ? "下一局，换你找北京"
      : "留点悬念，下次见分晓"
    : final && board.length > 1 && row?.rank === 1
      ? "这一局，你领跑北京"
      : best?.distance_m <= 300
        ? "这一针，真的很准"
        : "挑战完成！北京，又熟悉了一点";
  const nextChallenge = !complete
    ? spectator
      ? "看过朋友们的落点，下一局也来挑战。"
      : "下一局记得提交，让你的方向感上榜。"
    : !final
      ? "已提交，最终排名待公布。先看看你的三个落点。"
      : board.length === 1
      ? "记住这三个点，下次让误差更小。"
      : row?.rank === 1
        ? "这次领跑，下局能守住吗？"
        : gap > 0
          ? `距上一名相差 ${formatDistance(gap)}，再近一点就能超越。`
          : "同分也很精彩，下局再比一次方向感。";
  return (
    <section
      className={`personal-results${celebrating ? " is-celebrating" : ""}`}
      aria-label="个人成绩单"
    >
      <div
        className={`result-summary${complete ? " is-complete" : " is-incomplete"}`}
      >
        <InkRoute />
        {complete && (
          <span className="result-sparks" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ "--spark": i }} />
            ))}
          </span>
        )}
        <h2 className="result-headline">{headline}</h2>
        <div className="result-score-row">
          <div className="result-score">
            <span>
              {complete ? "你的总误差" : spectator ? "本局旁观" : "本局未提交"}
            </span>
            <strong>
              {complete ? formatDistance(you.totalError) : "未计入排名"}
            </strong>
          </div>
          {complete && final && row && (
            <div className="result-seal">
              <span>{board.length > 1 ? "北京盲猜" : "单人挑战"}</span>
              <span className="result-rank">
                第 <b>{row.rank}</b> 名
              </span>
              <span>
                {board.length > 1 && row.rank === 1 ? "本局头名" : "挑战完成"}
              </span>
            </div>
          )}
        </div>
        {complete && best && (
          <button
            className="result-best"
            onClick={() => onSelect(best.id)}
            aria-label={`回看最准的一针：${best.name}`}
          >
            <Icon name="pin" size={17} />
            <span>
              最准一针<strong>{best.name}</strong>
            </span>
            <b>{formatDistance(best.distance_m)}</b>
            <Icon name="arrow" size={15} />
          </button>
        )}
      </div>
      <p className="result-challenge">{nextChallenge}</p>
      {results.length > 0 && (
        <div className="result-detail-heading">
          <h3>把这三个地方，再记牢一点</h3>
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
                      ? "本局最准的一针"
                      : r.distance_m < 500
                        ? "方向感不错"
                        : "下次，离这里再近一点"}
                </small>
              </span>
              <strong>{formatDistance(r.distance_m)}</strong>
              <Icon name="arrow" size={14} />
            </button>
          </li>
        ))}
      </ul>
      <p className="map-legend">
        <span className="legend-dot guess" />
        你的猜测
        <span className="legend-dot truth" />
        真实位置
        <span className="legend-line" />
        距离误差
      </p>
    </section>
  );
}

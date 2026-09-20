import { useEffect, useState } from "react";
import { formatDistance } from "./ws.js";
import { Icon } from "./UI.jsx";

export function Roster({ players = [], phase }) {
  return (
    <ul className="roster">
      {players.map((p) => {
        const ready = p.contributed >= 2;
        const label = !p.connected
          ? "已离线"
          : phase === "lobby"
            ? ready
              ? "已准备"
              : `出题 ${p.contributed}/2`
            : !ready
              ? "本局旁观"
              : p.submitted
                ? "已提交"
                : phase === "reveal"
                  ? "未提交"
                  : "作答中";
        return (
          <li key={p.id}>
            <span className="avatar" style={{ "--player-color": p.color }}>
              {p.name.slice(0, 1)}
            </span>
            <span className="person-name">
              {p.name}
              {p.admin && <small>房主</small>}
            </span>
            <span
              className={`status-text ${p.connected && (phase === "lobby" ? ready : p.submitted) ? "ready" : ""}`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
export function Leaderboard({ board = [], selfRank }) {
  if (!board.length)
    return <p className="empty-copy">本局还没有完整提交的成绩。</p>;
  return (
    <ol className="leaderboard">
      {board.map((row) => (
        <li
          key={`${row.rank}-${row.name}`}
          className={`${row.rank === 1 ? "winner" : ""} ${selfRank === row.rank ? "is-you" : ""}`}
        >
          <span className="rank">
            {row.rank === 1 ? (
              <Icon name="trophy" size={24} />
            ) : (
              String(row.rank).padStart(2, "0")
            )}
          </span>
          <span className="person-name">
            {row.name}
            {selfRank === row.rank && <small>你</small>}
          </span>
          <strong>{formatDistance(row.totalError)}</strong>
        </li>
      ))}
    </ol>
  );
}
export function Contribute({ you, preview, onPick, onRemove, disabled }) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState({ status: "idle", items: [] });
  const [nonce, setNonce] = useState(0);
  const places = you.contribute || [];
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setSearch({ status: "idle", items: [] });
      return;
    }
    const controller = new AbortController();
    let timer;
    let timeout;
    setSearch({ status: "loading", items: [] });
    timer = setTimeout(async () => {
      timeout = setTimeout(() => controller.abort("timeout"), 10000);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search_failed");
        const data = await res.json();
        if (!controller.signal.aborted)
          setSearch({ status: "done", items: Array.isArray(data) ? data : [] });
      } catch {
        if (
          !controller.signal.aborted ||
          controller.signal.reason === "timeout"
        )
          setSearch({ status: "error", items: [] });
      } finally {
        clearTimeout(timeout);
      }
    }, 280);
    return () => {
      clearTimeout(timer);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [q, nonce]);
  return (
    <section className="contribute-panel" aria-label="贡献地点">
      {places.length < 2 && (
        <>
          <label className="search-label" htmlFor="place-search">
            找一个你熟悉的北京地点
          </label>
          <div className="search-field">
            <Icon name="search" />
            <input
              id="place-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="试试天坛、北海公园…"
              autoComplete="off"
              enterKeyHint="search"
              disabled={disabled}
            />
          </div>
          {search.status === "loading" && (
            <p role="status" className="search-state">
              正在搜索北京地点…
            </p>
          )}
          {search.status === "error" && (
            <div className="error" role="alert">
              搜索失败，请检查网络。
              <button
                className="text-btn"
                onClick={() => setNonce((n) => n + 1)}
              >
                重新搜索
              </button>
            </div>
          )}
          {search.status === "done" && !search.items.length && (
            <p className="empty-copy">没有找到，试试更完整的地名。</p>
          )}
          {!!search.items.length && (
            <ul className="search-results" aria-label="搜索结果">
              {search.items.map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  <button
                    disabled={disabled}
                    onClick={() => {
                      onPick(p);
                      setQ("");
                      document.activeElement?.blur();
                    }}
                  >
                    <Icon name="pin" />
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.address || "北京"}</small>
                    </span>
                    <Icon name="arrow" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {!q && (
        <ol className="place-slots">
          {[0, 1].map((i) => (
            <li key={i} className={places[i] ? "filled" : ""}>
              <span className="slot-number">
                {places[i] ? <Icon name="check" size={17} /> : i + 1}
              </span>
              <span>
                {places[i]?.name || "等待你添加一个地点"}
                {places[i] && <small>已加入本局题库</small>}
              </span>
              {places[i] && (
                <button
                  className="icon-btn"
                  aria-label={`移除${places[i].name}`}
                  disabled={disabled}
                  onClick={() => onRemove(places[i])}
                >
                  <Icon name="close" size={18} />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {places.length === 2 && (
        <p className="success-note">
          <Icon name="check" />
          准备好了，等房主开始！
        </p>
      )}
    </section>
  );
}
export function PersonalResults({ you, row, selectedId, onSelect }) {
  const results = you.results || [];
  return (
    <section className="personal-results">
      <div className="result-summary">
        <div>
          <span>{you.submitted ? "你的总误差" : "本局未提交"}</span>
          <strong>
            {you.submitted && row
              ? formatDistance(row.totalError)
              : "未计入排名"}
          </strong>
        </div>
        {you.submitted && row && (
          <span className="result-rank">
            第 <b>{row.rank}</b> 名
          </span>
        )}
      </div>
      <ul className="result-list">
        {results.map((r, i) => (
          <li key={r.id}>
            <button
              className={selectedId === r.id ? "selected" : ""}
              onClick={() => onSelect(r.id)}
              aria-label={`查看${r.name}的结果`}
            >
              <span className="slot-number">{i + 1}</span>
              <span className="person-name">
                {r.name}
                <small>
                  {r.distance_m == null
                    ? "未计分"
                    : r.distance_m < 500
                      ? "很准，方向感不错"
                      : "看看真实位置在哪里"}
                </small>
              </span>
              <strong>{formatDistance(r.distance_m)}</strong>
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

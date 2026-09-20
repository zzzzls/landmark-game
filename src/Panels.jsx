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
export function Contribute({ references = [], you, preview, onPick, onRemove, disabled }) {
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
                    disabled={disabled || references.some(ref => isReferencePlace(p, ref))}
                    onClick={() => {
                      onPick(p);
                      setQ("");
                      document.activeElement?.blur();
                    }}
                  >
                    <Icon name="pin" />
                    <span>
                      <strong>{p.name}</strong>
                      <small>{references.some(ref => isReferencePlace(p, ref)) ? "公共参照地标，请换一个地点" : p.address || "北京"}</small>
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
export { PersonalResults } from "./Results.jsx";

export function isReferencePlace(place, reference) {
  const normalize = name => name.replace(/\s/g, "").toLowerCase();
  if (normalize(place.name) === normalize(reference.name)) return true;
  const rad = Math.PI / 180;
  const lat = (place.lat - reference.lat) * rad;
  const lng = (place.lng - reference.lng) * rad;
  const a = Math.sin(lat / 2) ** 2 + Math.cos(place.lat * rad) * Math.cos(reference.lat * rad) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) <= 50;
}

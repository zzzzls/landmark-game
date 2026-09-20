import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistance } from "./ws.js";

export function useIsPhone() {
  const [phone, setPhone] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 860px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return phone;
}

export function defaultSheetOpen() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 861px)").matches;
}

export async function copyText(text, el) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return true;
  } catch {
    /* last resort: highlight */
  }
  if (el) {
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function useCopied() {
  const [copied, setCopied] = useState(false);
  const elRef = useRef(null);
  const copy = useCallback(async (text) => {
    const ok = await copyText(text, elRef.current);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
    return ok;
  }, []);
  return { copied, copy, elRef };
}

export function useToast() {
  const [toast, setToast] = useState("");
  const timer = useRef(null);
  const showToast = useCallback((msg) => {
    if (!msg) return;
    setToast(msg);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(""), 1600);
  }, []);
  useEffect(() => () => timer.current && window.clearTimeout(timer.current), []);
  return { toast, showToast };
}

function usePlaceSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  return { q, setQ, results, searching };
}

export function Sheet({
  expanded = false,
  onToggle,
  title,
  subtitle,
  onTitleClick,
  titleNote,
  tabLabel,
  peek,
  children,
  footer,
}) {
  return (
    <aside className={`sheet ${expanded ? "expanded" : "collapsed"}`}>
      <div className="sheet-panel">
        <div className="sheet-heading">
          {onTitleClick ? (
            <button type="button" className="room-code" onClick={onTitleClick}>
              {title}
            </button>
          ) : (
            <h1>{title}</h1>
          )}
          <p>{titleNote || subtitle}</p>
        </div>
        {peek ? <p className="sheet-peek">{peek}</p> : null}
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-footer">{footer}</div> : null}
      </div>
      <button
        type="button"
        className="sheet-tab"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label="展开或收起"
      >
        <span className="grabber" />
        <span className="sheet-tab-label">{tabLabel || "菜单"}</span>
      </button>
    </aside>
  );
}

export function Brand({ title = "北京地标盲猜", subtitle }) {
  return (
    <header className="brand">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

export function DisconnectBanner({ retry }) {
  if (!retry) return null;
  return <div className="conn-banner">连接断开，正在重试…</div>;
}

export function CodeChip({ code, copied, onCopy, elRef }) {
  if (!code) return null;
  return (
    <button type="button" className="code-chip" onClick={onCopy}>
      <span ref={elRef}>{copied ? "已复制" : code}</span>
    </button>
  );
}

export function PlayHud({ name, placed, onUnguess, canUnguess }) {
  if (!name) return null;
  return (
    <div className="map-hud">
      <div className="hud-chip">
        <span className="hud-name">正在钉：{name}</span>
        <span className="hud-count">已钉 {placed}/3</span>
      </div>
      {canUnguess ? (
        <button type="button" className="undo-chip" onClick={onUnguess}>
          撤销上一钉
        </button>
      ) : null}
    </div>
  );
}

export function ConfirmChip({ onConfirm, raised }) {
  return (
    <div className={`confirm-chip${raised ? " raised" : ""}`}>
      <button type="button" className="primary" onClick={onConfirm}>
        确认钉在这里
      </button>
    </div>
  );
}

export function MapSubmit({ onSubmit }) {
  return (
    <div className="map-submit">
      <button type="button" className="primary" onClick={onSubmit}>
        提交
      </button>
    </div>
  );
}

export function Leaderboard({ board, showDistance, empty }) {
  const rows = board || [];
  return (
    <ol className="board">
      {rows.length === 0 && empty ? <li className="muted">{empty}</li> : null}
      {rows.map((row) => (
        <li key={`${row.rank}-${row.name}`}>
          <span className="rank">{row.rank}</span>
          <span className="dot" style={{ background: row.color }} />
          <span className="name">{row.name}</span>
          <span className="meta">{showDistance ? formatDistance(row.totalError) : "✓"}</span>
        </li>
      ))}
    </ol>
  );
}

function near(a, lng, lat) {
  if (!a) return false;
  const dlng = a.lng - lng;
  const dlat = a.lat - lat;
  return dlng * dlng + dlat * dlat < 0.0003 * 0.0003;
}

export function useGuessFlow({ state, selectedId, setSelectedId, send, showToast }) {
  const [preview, setPreview] = useState(null);
  const you = state?.you || {};
  const submitted = Boolean(you.submitted);
  const targets = you.targets || [];
  const guesses = you.guesses || [];

  useEffect(() => {
    if (submitted) setPreview(null);
  }, [submitted]);

  const commit = useCallback(
    (lng, lat, targetId) => {
      if (!targetId || submitted) return;
      send({ type: "guess", targetId, lng, lat });
      try {
        navigator.vibrate?.(10);
      } catch {
        /* ignore */
      }
      const guessed = new Set(guesses.map((g) => g.targetId));
      guessed.add(targetId);
      const name = targets.find((t) => t.id === targetId)?.name || "";
      const next = targets.find((t) => !guessed.has(t.id));
      if (next) {
        setSelectedId(next.id);
        showToast?.(`已钉 ${name}，下一个 ${next.name}`);
      } else {
        showToast?.(`已钉 ${name}`);
      }
      setPreview(null);
    },
    [send, submitted, guesses, targets, setSelectedId, showToast]
  );

  const onMapClick = useCallback(
    (lng, lat) => {
      if (!state || state.phase !== "playing" || submitted) return;
      const id = selectedId || targets.find((t) => !guesses.some((g) => g.targetId === t.id))?.id || targets[0]?.id;
      if (!id) return;
      if (!selectedId) setSelectedId(id);
      if (preview && near(preview, lng, lat)) {
        commit(preview.lng, preview.lat, id);
        return;
      }
      setPreview({ lng, lat, kind: "guess", zoom: false });
    },
    [state, submitted, selectedId, targets, guesses, preview, commit, setSelectedId]
  );

  const confirmPreview = useCallback(() => {
    if (!preview) return;
    const id = selectedId || targets[0]?.id;
    if (!id) return;
    commit(preview.lng, preview.lat, id);
  }, [preview, selectedId, targets, commit]);

  const pickTarget = useCallback(
    (id) => {
      if (id !== selectedId) setPreview(null);
      setSelectedId(id);
    },
    [selectedId, setSelectedId]
  );

  const unguess = useCallback(() => {
    if (submitted || !guesses.length) return;
    const hit = guesses.find((g) => g.targetId === selectedId);
    const targetId = hit ? hit.targetId : guesses[guesses.length - 1].targetId;
    if (!targetId) return;
    send({ type: "unguess", targetId });
    setPreview(null);
    setSelectedId(targetId);
  }, [submitted, guesses, selectedId, send, setSelectedId]);

  return { preview, setPreview, onMapClick, confirmPreview, pickTarget, unguess };
}

function SearchFields({ q, setQ, results, searching, preview, onPick, full }) {
  const term = q.trim();
  const empty = !searching && term && results.length === 0;
  return (
    <>
      <input
        className="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜索地点"
        disabled={full}
        enterKeyHint="search"
        autoComplete="off"
      />
      {searching && <p className="hint">搜索中…</p>}
      {empty && <p className="hint empty-results">没找到</p>}
      {results.length > 0 && (
        <ul className="results">
          {results.map((r, i) => {
            const active =
              preview && preview.lng === r.lng && preview.lat === r.lat && preview.name === r.name;
            return (
              <li key={`${r.name}-${i}`}>
                <button
                  type="button"
                  className={active ? "item active" : "item"}
                  onClick={() => onPick(r)}
                >
                  <span className="name">{r.name}</span>
                  <span className="meta muted">{r.address}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function SearchFloat({ you, send, preview, setPreview, onCollapse, onToast }) {
  const { q, setQ, results, searching } = usePlaceSearch();
  const contributed = you?.contribute || [];
  const full = contributed.length >= 2;

  function addPreview() {
    if (!preview || full) return;
    const name = preview.name;
    send({ type: "contribute", name: preview.name, lng: preview.lng, lat: preview.lat });
    setPreview(null);
    onToast?.(`已添加 ${name}`);
  }

  function pick(r) {
    setPreview(r);
    setQ("");
    onCollapse?.();
  }

  return (
    <div className="search-float">
      <SearchFields
        q={q}
        setQ={setQ}
        results={results}
        searching={searching}
        preview={preview}
        onPick={pick}
        full={full}
      />
      {preview && !full && (
        <button type="button" className="primary add-preview" onClick={addPreview}>
          添加「{preview.name}」
        </button>
      )}
    </div>
  );
}

export function ContributePanel({ you, send, error, preview, setPreview, hideSearch = false, onPick, onToast }) {
  const { q, setQ, results, searching } = usePlaceSearch();
  const contributed = you?.contribute || [];
  const full = contributed.length >= 2;

  function addPreview() {
    if (!preview || full) return;
    const name = preview.name;
    send({ type: "contribute", name: preview.name, lng: preview.lng, lat: preview.lat });
    setPreview(null);
    onToast?.(`已添加 ${name}`);
  }

  function pick(r) {
    setPreview(r);
    setQ("");
    onPick?.();
  }

  return (
    <>
      <section className="panel">
        <p className="progress">{contributed.length}/2</p>
        {!hideSearch && (
          <div className="contribute-search">
            {preview && !full && (
              <button type="button" className="primary" onClick={addPreview}>
                添加「{preview.name}」
              </button>
            )}
            <SearchFields
              q={q}
              setQ={setQ}
              results={results}
              searching={searching}
              preview={preview}
              onPick={pick}
              full={full}
            />
          </div>
        )}
      </section>
      {contributed.length > 0 && (
        <section className="list-wrap">
          <ul className="list">
            {contributed.map((c, i) => (
              <li key={c.id}>
                <div className="item static">
                  <span className="idx">{i + 1}</span>
                  <span className="name">{c.name}</span>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => send({ type: "remove_contribute", id: c.id })}
                  >
                    移除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <div className="error">{error}</div>}
    </>
  );
}

export function PlayPanel({ you, send, error, phase, selectedId, setSelectedId, hideActions = false, onUnguess }) {
  const targets = you?.targets || [];
  const guessMap = Object.fromEntries((you?.guesses || []).map((g) => [g.targetId, g]));
  const resultMap = Object.fromEntries((you?.results || []).map((r) => [r.id, r]));
  const placed = Object.keys(guessMap).length;
  const submitted = Boolean(you?.submitted);

  useEffect(() => {
    if (!targets.length) return;
    if (selectedId && targets.some((t) => t.id === selectedId)) return;
    const next = targets.find((t) => !guessMap[t.id]) || targets[0];
    setSelectedId(next.id);
  }, [targets, selectedId, setSelectedId, placed]);

  return (
    <>
      <section className="list-wrap">
        <p className="hint">3 题，含系统补位</p>
        <ul className="list">
          {targets.map((t, i) => {
            const g = guessMap[t.id];
            const r = resultMap[t.id];
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={["item", selectedId === t.id ? "active" : "", g ? "placed" : ""].join(" ")}
                  onClick={() => setSelectedId(t.id)}
                >
                  <span className="idx">{i + 1}</span>
                  <span className="name">
                    <span className="dot" style={{ background: placeColor(i) }} />
                    {t.name}
                  </span>
                  {phase === "reveal" && r?.distance_m != null ? (
                    <span className="meta">{formatDistance(r.distance_m)}</span>
                  ) : g ? (
                    <span className="meta">已钉</span>
                  ) : (
                    <span className="meta muted">未钉</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {phase === "playing" && !submitted && placed > 0 && onUnguess && (
        <p className="undo-row">
          <button type="button" className="linkish" onClick={onUnguess}>
            撤销上一钉
          </button>
        </p>
      )}
      {error && <div className="error">{error}</div>}
      {!hideActions && (
        <footer className="actions">
          {playFooter(you, phase, send)}
        </footer>
      )}
    </>
  );
}

export function playFooter(you, phase, send) {
  if (!you?.targets?.length) return null;
  const placed = new Set((you?.guesses || []).map((g) => g.targetId)).size;
  const submitted = Boolean(you?.submitted);
  if (phase === "playing" && !submitted) {
    const need = Math.max(0, 3 - placed);
    return (
      <button
        type="button"
        className="primary"
        disabled={placed < 3}
        onClick={() => send({ type: "submit" })}
      >
        {placed < 3 ? `还需钉 ${need} 个` : "提交"}
      </button>
    );
  }
  if (submitted && phase !== "reveal") {
    return <p className="current">已提交，等待揭晓</p>;
  }
  if (phase === "reveal") {
    const dists = (you?.results || [])
      .map((r) => r.distance_m)
      .filter((d) => d != null && !Number.isNaN(d));
    const total = dists.length ? dists.reduce((s, d) => s + d, 0) : null;
    return (
      <p className="current">
        总误差 <strong>{formatDistance(total)}</strong>
      </p>
    );
  }
  return null;
}

export function PlayerList({ players, phase, compact }) {
  return (
    <section className={`list-wrap${compact ? " compact" : ""}`}>
      <ul className="list">
        {(players || []).map((p) => {
          let status;
          if (phase === "playing" || phase === "reveal") {
            if (p.contributed < 2) status = "本局未作答";
            else status = p.submitted ? "已提交" : "未提交";
          } else {
            status = `${p.contributed}/2`;
          }
          const ok = phase === "lobby" ? p.contributed >= 2 : p.submitted;
          return (
            <li key={p.id}>
              <div className={`item static${p.connected === false ? " offline" : ""}`}>
                <span className="dot" style={{ background: p.color }} />
                <span className="name">{p.name}</span>
                <span className={ok ? "meta" : "meta muted"}>{status}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export const PLACE_COLORS = [
  "#C23A2B",
  "#E09F3E",
  "#2A9D8F",
  "#3D5A80",
  "#C45C86",
  "#4A7C59",
];

export function placeColor(index) {
  return PLACE_COLORS[index % PLACE_COLORS.length];
}

function truncatePinName(s) {
  const t = String(s || "");
  return t.length > 6 ? `${t.slice(0, 6)}…` : t;
}

export function contributePins(you) {
  return (you?.contribute || []).map((c) => ({
    key: c.id,
    lng: c.lng,
    lat: c.lat,
    name: truncatePinName(c.name),
    label: c.name,
    color: "#007AFF",
    title: c.name,
  }));
}

export function guessPins(you) {
  const targets = you?.targets || [];
  const names = Object.fromEntries(targets.map((t) => [t.id, t.name]));
  const colorById = Object.fromEntries(targets.map((t, i) => [t.id, placeColor(i)]));
  return (you?.guesses || []).map((g) => ({
    key: g.targetId,
    lng: g.lng,
    lat: g.lat,
    name: truncatePinName(names[g.targetId]),
    label: names[g.targetId] || "猜",
    tag: "猜",
    color: colorById[g.targetId] || placeColor(0),
    kind: "guess",
    title: names[g.targetId],
  }));
}

function guessCoord(result, guess) {
  const lng = result?.guessLng ?? result?.guess_lng ?? guess?.lng;
  const lat = result?.guessLat ?? result?.guess_lat ?? guess?.lat;
  if (lng == null || lat == null) return null;
  return [lng, lat];
}

export function playerMapOverlays(you, phase) {
  const targets = you?.targets || [];
  const guessMap = Object.fromEntries((you?.guesses || []).map((g) => [g.targetId, g]));
  const resultMap = Object.fromEntries((you?.results || []).map((r) => [r.id, r]));
  const showTruth = phase === "reveal";
  const pins = [];
  const lines = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const color = placeColor(i);
    const r = resultMap[t.id];
    const g = guessMap[t.id];
    const guess = guessCoord(r, g);
    const trueLng = r?.lng;
    const trueLat = r?.lat;
    const hasTruth = showTruth && trueLng != null && trueLat != null;
    if (guess) {
      pins.push({
        key: `guess-${t.id}`,
        lng: guess[0],
        lat: guess[1],
        name: truncatePinName(t.name),
        label: t.name,
        tag: "猜",
        color,
        kind: "guess",
        title: t.name,
      });
    }
    if (hasTruth) {
      pins.push({
        key: `true-${t.id}`,
        lng: trueLng,
        lat: trueLat,
        name: truncatePinName(t.name),
        label: t.name,
        tag: "真",
        color,
        kind: "true",
        title: t.name,
      });
    }
    if (hasTruth && guess) {
      lines.push({ from: guess, to: [trueLng, trueLat], color });
    }
  }
  return { pins, lines };
}

export function screenMapOverlays(state) {
  const truePins = state?.truePins || [];
  const screenPins = state?.screenPins || [];
  const colorById = {};
  truePins.forEach((t, i) => {
    colorById[t.id] = placeColor(i);
  });
  let extra = truePins.length;
  for (const sp of screenPins) {
    for (const p of sp.pins || []) {
      if (colorById[p.targetId] == null) {
        colorById[p.targetId] = placeColor(extra);
        extra += 1;
      }
    }
  }
  const revealing = truePins.length > 0;
  const trueById = Object.fromEntries(truePins.map((t) => [t.id, t]));
  const pins = [];
  const lines = [];
  for (const sp of screenPins) {
    for (const p of sp.pins || []) {
      const color = revealing
        ? colorById[p.targetId] || placeColor(0)
        : sp.color || placeColor(0);
      pins.push({
        key: `${sp.playerId}-${p.targetId}`,
        lng: p.lng,
        lat: p.lat,
        name: truncatePinName(sp.name),
        label: sp.name,
        tag: "猜",
        color,
        kind: "guess",
        title: sp.name,
      });
      const truth = trueById[p.targetId];
      if (revealing && truth && truth.lng != null && truth.lat != null) {
        lines.push({
          from: [p.lng, p.lat],
          to: [truth.lng, truth.lat],
          color,
        });
      }
    }
  }
  for (const t of truePins) {
    pins.push({
      key: `true-${t.id}`,
      lng: t.lng,
      lat: t.lat,
      name: truncatePinName(t.name),
      label: t.name,
      tag: "真",
      color: colorById[t.id] || placeColor(0),
      kind: "true",
      title: t.name,
    });
  }
  return { pins, lines };
}

export function fitPadForSheet(sheetOpen) {
  // AMap setFitView avoid: [top, right, bottom, left]
  return sheetOpen ? [48, 48, 80, 360] : [48, 48, 80, 52];
}

export function fitPadForScreen(isPhone) {
  return isPhone ? [48, 48, 280, 48] : [48, 360, 48, 48];
}

export function activeTarget(you, selectedId) {
  const targets = you?.targets || [];
  if (!targets.length) return null;
  const guessed = new Set((you?.guesses || []).map((g) => g.targetId));
  return targets.find((t) => t.id === selectedId) || targets.find((t) => !guessed.has(t.id)) || targets[0];
}

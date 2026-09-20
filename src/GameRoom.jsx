import { useEffect, useLayoutEffect, useRef, useState } from "react";
import MapView from "./MapView.jsx";
import { WinnerSpotlight } from "./Results.jsx";
import { useRoom, navigate, phaseLabel } from "./ws.js";
import {
  contributePins,
  playerMapOverlays,
  screenMapOverlays,
} from "./mapOverlays.js";
import { Contribute, Leaderboard, PersonalResults, Roster } from "./Panels.jsx";
import {
  Brand,
  ConfirmDialog,
  Guide,
  Icon,
  Toast,
  copyText,
  useToast,
} from "./UI.jsx";

function useMapPadding(topRef, panelRef) {
  const [padding, setPadding] = useState([90, 24, 260, 24]);
  useLayoutEffect(() => {
    function measure() {
      const top = topRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!top || !panel) return;
      const mobile = window.matchMedia("(max-width: 860px)").matches;
      const next = mobile
        ? [
            Math.ceil(top.bottom + 78),
            24,
            Math.ceil(window.innerHeight - panel.top + 16),
            24,
          ]
        : [Math.ceil(top.bottom + 64), 36, 60, Math.ceil(panel.right + 28)];
      setPadding((old) => (old.every((x, i) => x === next[i]) ? old : next));
    }
    const observer = new ResizeObserver(measure);
    if (topRef.current) observer.observe(topRef.current);
    if (panelRef.current) observer.observe(panelRef.current);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [topRef, panelRef]);
  return padding;
}
export default function GameRoom({ code, name, role, onRestart, sessionReady = true }) {
  const { state, error, send, status, pending } = useRoom(code, role, name);
  const admin = role === "admin";
  const [tab, setTab] = useState(admin ? "manage" : "play");
  const [expanded, setExpanded] = useState(true);
  const [preview, setPreview] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [mapStatus, setMapStatus] = useState("loading");
  const [guide, setGuide] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const restartRef = useRef(false);
  const [lanUrl, setLanUrl] = useState("");
  const { toast, showToast } = useToast();
  const topRef = useRef(null);
  const panelRef = useRef(null);
  const prevPhase = useRef(null);
  const padding = useMapPadding(topRef, panelRef);
  const you = state?.you || {};
  const players = state?.players || [];
  const ownResult = state?.leaderboard?.find((p) => p.playerId === you.id);
  const phase = state?.phase;
  const targets = you.targets || [];
  const guesses = you.guesses || [];
  const contributions = you.contribute || [];
  const hasTargets = targets.length > 0;
  const selected =
    targets.find((t) => t.id === selectedId) ||
    targets.find((t) => !guesses.some((g) => g.targetId === t.id)) ||
    targets[0];
  const selectedGuess = guesses.find((g) => g.targetId === selected?.id);
  const placed = guesses.length;
  const managing = admin && tab === "manage";
  const disabled = status !== "connected" || !sessionReady || pending;
  const personalRevealed = phase === "reveal" || (phase === "playing" && you.submitted);
  const ready = players.filter((p) => p.contributed >= 2);
  const submitted = ready.filter((p) => p.submitted);
  const unready = players.filter((p) => p.contributed < 2);
  const playing =
    phase === "playing" && hasTargets && !you.submitted && !managing;
  let overlays =
    phase === "lobby"
      ? { pins: contributePins(you), lines: [] }
      : phase === "reveal" && managing
        ? screenMapOverlays(state)
        : playerMapOverlays(you, phase);
  if (personalRevealed && selectedId && !managing) {
    const results = (you.results || []).filter((r) => r.id === selectedId);
    overlays = playerMapOverlays(
      { ...you, targets: targets.filter((t) => t.id === selectedId), results },
      phase,
    );
  }
  useEffect(() => {
    if (!localStorage.getItem("lg-guide-seen")) setGuide(true);
  }, []);
  useEffect(() => {
    if (!phase || prevPhase.current === phase) return;
    prevPhase.current = phase;
    setPreview(null);
    setSelectedId(null);
    setExpanded(phase !== "playing");
    if (phase === "playing" && hasTargets) setTab("play");
  }, [phase, hasTargets]);
  useEffect(() => {
    if (you.submitted) { setExpanded(true); setPreview(null); setSelectedId(null); }
  }, [you.submitted]);
  useEffect(() => {
    if (!admin) return;
    const controller = new AbortController();
    fetch("/api/lan", { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setLanUrl(d.urls?.[0] || ""))
      .catch(() => {});
    return () => controller.abort();
  }, [admin]);
  async function act(message, success) {
    try {
      const next = await send(message);
      if (success) showToast(success);
      return next;
    } catch (err) {
      showToast(err.message || "操作失败，请重试");
      return null;
    }
  }
  function closeGuide() {
    localStorage.setItem("lg-guide-seen", "1");
    setGuide(false);
  }
  async function addPlace() {
    if (!preview || disabled) return;
    const p = preview;
    const next = await act(
      { type: "contribute", name: p.name, lng: p.lng, lat: p.lat },
      `已添加「${p.name}」`,
    );
    if (next) {
      setPreview(null);
      setExpanded(true);
    }
  }
  async function confirmPin() {
    if (!preview || !selected || disabled) return;
    const id = selected.id;
    const next = await act(
      { type: "guess", targetId: id, lng: preview.lng, lat: preview.lat },
      "位置已保存",
    );
    if (next) {
      setPreview(null);
      const done = new Set(next.you.guesses.map((g) => g.targetId));
      const target = next.you.targets.find((t) => !done.has(t.id));
      if (target) setSelectedId(target.id);
    }
  }
  function pickTarget(id) {
    if (disabled) return;
    setSelectedId(id);
    setPreview(null);
    setExpanded(false);
  }
  async function undo() {
    if (!selectedGuess || disabled) return;
    const next = await act({ type: "unguess", targetId: selected.id }, "已撤销这个位置");
    if (next) setPreview(null);
  }
  function requestStart() {
    if (!ready.length) return;
    if (unready.length)
      setConfirm({
        title: "现在开始这局？",
        message: `${ready.length} 人已准备，${unready.length} 人尚未出满两题，将旁观本局。${ready.length === 1 ? "单人参赛将抽取三道系统题。" : ""}`,
        label: "开始游戏",
        messageType: "start",
      });
    else act({ type: "start" });
  }
  function requestReveal() {
    const waiting = ready.length - submitted.length;
    if (waiting)
      setConfirm({
        title: "提前揭晓答案？",
        message: `还有 ${waiting} 人未提交。揭晓后无法继续作答，未提交者不计入排名。`,
        label: "确认揭晓",
        messageType: "reveal",
      });
    else act({ type: "reveal" });
  }
  async function playAgain() {
    if (!admin || disabled || restartRef.current) return;
    restartRef.current = true;
    setRestarting(true);
    try {
      await onRestart();
    } catch (error) {
      showToast(
        error.name === "TimeoutError"
          ? "创建超时，请检查网络后重试。"
          : error.message === "Failed to fetch"
            ? "连接失败，请检查网络后重试。"
            : error.message,
      );
    } finally {
      restartRef.current = false;
      setRestarting(false);
    }
  }
  async function copy(value, label) {
    try {
      showToast((await copyText(value)) ? label : "未能复制，请长按选择链接。");
    } catch {
      showToast("未能复制，请长按选择链接。");
    }
  }
  const origin =
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? lanUrl || location.origin
      : location.origin;
  const invite = `${origin}/`;
  let title = managing
    ? "房间管理"
    : phase === "lobby"
      ? contributions.length === 2
        ? "准备好了"
        : "给朋友出两道题"
      : phase === "reveal"
        ? "这一局，揭晓了"
        : you.submitted
          ? "挑战完成！"
          : !hasTargets
            ? "本局旁观"
            : selected?.name || "等待题目";
  let subtitle = managing
    ? `${players.length} 人已加入 · ${phase === "lobby" ? `${ready.length} 人已准备` : `${submitted.length}/${ready.length} 人已提交`}`
    : phase === "lobby"
      ? `已出题 ${contributions.length}/2 · 开始前可以更换`
      : phase === "reveal"
        ? "距离越近，排名越靠前"
        : you.submitted
          ? `${submitted.length}/${ready.length} 人已提交，最终排名待公布`
          : !hasTargets
            ? "本局开始时未出满两题，可以观看大屏。"
            : `第 ${targets.findIndex((t) => t.id === selected?.id) + 1} 题，共 3 题 · 已确认 ${placed}/3`;
  return (
    <main
      className={`game-room ${managing ? "is-managing" : ""}`}
      data-phase={phase || "connecting"}
    >
      <MapView
        references={state?.references || []}
        pins={overlays.pins}
        lines={overlays.lines}
        preview={managing ? null : preview}
        clickable={playing && !disabled && mapStatus === "ready"}
        onMapClick={(lng, lat) => {
          setPreview({ lng, lat, kind: "guess", zoom: false });
          setExpanded(false);
        }}
        onPreviewClick={() => {}}
        fitKey={
          (phase === "reveal" || (personalRevealed && !managing))
            ? `reveal-${managing ? "all" : selectedId || "all"}`
            : ""
        }
        fitPadding={padding}
        onStatusChange={setMapStatus}
        focusPoint={playing ? [116.397, 39.91] : null}
        focusKey={playing ? "playing" : null}
      />
      <header className="room-top" ref={topRef}>
        <a className="room-brand" href="/" aria-label="返回首页">
          <Brand />
        </a>
        <div className="room-top-actions">
          <button
            className="room-code"
            onClick={() => copy(code, "房间号已复制")}
            aria-label={`复制房间号 ${code}`}
          >
            <span>房间</span>
            <strong>{code}</strong>
            <Icon name="copy" size={16} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setGuide(true)}
            aria-label="游戏指引"
          >
            <Icon name="help" />
          </button>
        </div>
      </header>
      <div className="map-caption">
        <span className="phase-dot" />
        {phaseLabel(phase) || "连接房间"}
        <span className="caption-separator" />
        {playing
          ? "借助地标参照，拖动地图寻找位置"
          : phase === "reveal"
            ? "猜测与真实位置，看看差了多远"
            : "北京 · 无文字地图"}
      </div>
      {status !== "connected" && (
        <div
          className={`connection-banner ${status === "error" ? "failed" : ""}`}
          role="status"
        >
          {status === "error"
            ? "房间连接不可用"
            : status === "reconnecting"
              ? "连接中断，正在重连。操作暂不可用。"
              : "正在连接房间…"}
        </div>
      )}
      <section
        className={`task-panel ${expanded ? "expanded" : "collapsed"} ${playing ? "answer-panel" : ""}`}
        ref={panelRef}
        aria-label={managing ? "房间管理" : "游戏任务"}
      >
        {admin && (
          <div className="room-tabs" role="group" aria-label="房主视图">
            <button
              aria-pressed={tab === "manage"}
              disabled={pending}
              onClick={() => {
                setTab("manage");
                setPreview(null);
                setExpanded(true);
              }}
            >
              <Icon name="users" size={17} />
              房间管理
            </button>
            <button
              aria-pressed={tab === "play"}
              disabled={pending}
              onClick={() => {
                setTab("play");
                setExpanded(phase === "lobby" || personalRevealed);
              }}
            >
              <Icon name="pin" size={17} />
              我的答题
            </button>
          </div>
        )}
        {playing ? (
          <div className="answer-heading">
            <div className="answer-progress">
              <div className="target-tabs" role="group" aria-label="选择题目">
                {targets.map((t, i) => {
                  const saved = guesses.some((g) => g.targetId === t.id);
                  return (
                    <button
                      key={t.id}
                      aria-label={`第${i + 1}题 ${t.name}`}
                      aria-pressed={selected?.id === t.id}
                      aria-describedby={`answer-state-${i}`}
                      data-confirmed={saved}
                      disabled={disabled}
                      onClick={() => pickTarget(t.id)}
                    >
                      <span>{i + 1}</span>
                      {saved ? <Icon name="check" size={16} /> : <span className="target-dash" />}
                      <span id={`answer-state-${i}`} className="sr-only">{saved ? "已确认" : "未确认"}</span>
                    </button>
                  );
                })}
              </div>
              <p className="answer-count" role="status" aria-live="polite" aria-atomic="true">已确认 {placed}/3</p>
            </div>
            <div className="task-heading">
              <div>
                <p className="task-subtitle">{subtitle}</p>
                <h1 className="answer-title" tabIndex={0}>{title}</h1>
              </div>
            </div>
          </div>
        ) : (
          <div className="task-heading">
            <div>
              <p className="task-subtitle">{subtitle}</p>
              <h1>{state ? title : "正在进入房间"}</h1>
            </div>
            <button
              className={`icon-btn panel-toggle ${expanded ? "open" : ""}`}
              aria-label={expanded ? "收起详情" : "展开详情"}
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              <Icon name="chevron" />
            </button>
          </div>
        )}
        {error && (
          <div className="error room-error" role="alert">
            {error}
            {status === "error" && <button className="text-btn" onClick={() => {
              try { sessionStorage.removeItem("lg-name"); } catch { /* name also lives in URL */ }
              navigate(admin ? "/admin" : "/");
            }}>更换昵称</button>}
          </div>
        )}
        <div
          className="task-body"
          inert={!expanded && window.innerWidth <= 860 ? "" : undefined}
        >
          {!state ? (
            <p className="empty-copy">正在同步房间信息…</p>
          ) : managing ? (
            <>
              {phase === "lobby" && (
                <div className="invite-section">
                  <h2>邀请朋友来玩</h2>
                  <div className="invite-code">
                    {code}
                    <button
                      className="icon-btn"
                      aria-label="复制邀请链接"
                      onClick={() => copy(invite, "邀请链接已复制")}
                    >
                      <Icon name="copy" />
                    </button>
                  </div>
                  <p className="invite-url">{invite}</p>
                  <div className="invite-actions">
                    <button
                      className="secondary"
                      onClick={() => copy(invite, "邀请链接已复制")}
                    >
                      复制邀请链接
                    </button>
                    <a
                      className="secondary"
                      href="/screen"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="screen" size={18} />
                      打开大屏
                    </a>
                  </div>
                  <p className="muted small">
                    朋友的手机需和本机处于可互通的网络。
                  </p>
                </div>
              )}
              {phase === "reveal" && (
                <WinnerSpotlight board={state.leaderboard} />
              )}
              <div className="section-heading">
                <h2>
                  {phase === "lobby"
                    ? "大家准备得怎么样"
                    : phase === "playing"
                      ? "大家的答题进度"
                      : "本局玩家"}
                </h2>
                <span>{players.length} 人</span>
              </div>
              <Roster players={players} phase={phase} />
              {phase === "lobby" && contributions.length < 2 && (
                <button
                  className="participate-link"
                  onClick={() => {
                    setTab("play");
                    setExpanded(true);
                  }}
                >
                  我也要参赛
                  <Icon name="arrow" size={18} />
                </button>
              )}
              {phase === "reveal" && (
                <>
                  {phase === "reveal" && <h2 className="section-title">本局排名</h2>}
                  {phase === "reveal" && <Leaderboard
                    board={state.leaderboard}
                    selfRank={ownResult?.rank}
                  />}
                </>
              )}
            </>
          ) : (
            <>
              {phase === "lobby" && (
                <Contribute
                  you={you}
                  references={state.references || []}
                  preview={preview}
                  disabled={disabled}
                  onPick={(p) => {
                    setPreview(p);
                    setExpanded(false);
                  }}
                  onRemove={(p) =>
                    act({ type: "remove_contribute", id: p.id }, "已移除地点")
                  }
                />
              )}
              {phase === "playing" && playing && (
                <p className="instruction">
                  先点地图预览，再确认位置。可以切换题目重新选择；提交后无法修改。
                </p>
              )}
              {phase === "playing" && !hasTargets && (
                <div className="waiting-content">
                  <Icon name={you.submitted ? "check" : "screen"} size={32} />
                  <p>
                    {you.submitted
                      ? "你已完成挑战，看看其他朋友的进度。"
                      : "本局已经开始，下一局再一起挑战吧。"}
                  </p>
                  <Roster players={players} phase={phase} />
                  {!hasTargets && (
                    <a className="secondary" href="/screen">
                      观看大屏
                    </a>
                  )}
                </div>
              )}
              {personalRevealed && (
                <>
                  <PersonalResults
                    you={you}
                    final={phase === "reveal"}
                    row={ownResult}
                    board={state.leaderboard}
                    roomCode={code}
                    selectedId={selectedId}
                    onSelect={(id) => {
                      setSelectedId(id);
                      setExpanded(false);
                    }}
                  />
                  {phase === "reveal" && <h2 className="section-title">本局排名</h2>}
                  {phase === "reveal" && <Leaderboard
                    board={state.leaderboard}
                    selfRank={ownResult?.rank}
                  />}
                  {!you.submitted && (
                    <p className="muted small">
                      你未提交本局完整答案，未计入排名。
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <footer className={`task-footer ${playing ? "answer-footer" : ""}`}>
          {personalRevealed && (!managing || phase === "reveal") ? (
            <>
              <div className="result-actions">
                <button
                  className="secondary"
                  onClick={() => {
                    setSelectedId(null);
                    setExpanded(!expanded);
                  }}
                >
                  {expanded ? "收起，看地图" : "查看成绩与排名"}
                </button>
                {admin && phase === "reveal" && <button
                  className="primary play-again"
                  disabled={restarting || disabled}
                  onClick={playAgain}
                >
                  <Icon name="undo" size={18} />
                  {restarting ? "正在重开…" : "重开一局"}
                </button>}
              </div>
              <p className="replay-note">{phase !== "reveal" ? "已提交，最终排名待公布" : admin ? "所有玩家将自动进入新局，重新出题" : "等待管理员开启下一局 · 无需刷新"}</p>
            </>
          ) : managing ? (
            phase === "lobby" ? (
              <button
                className="primary"
                disabled={disabled || !ready.length}
                onClick={requestStart}
              >
                {ready.length
                  ? `开始游戏 · ${ready.length} 人已准备`
                  : "等待至少一人准备好"}
                <Icon name="arrow" />
              </button>
            ) : (
              <>
                <p className="muted small">
                  全员提交后自动揭晓，也可以提前结束。
                </p>
                <button
                  className="secondary"
                  disabled={disabled}
                  onClick={requestReveal}
                >
                  提前揭晓
                </button>
              </>
            )
          ) : (
            <>
              {phase === "lobby" && preview && (
                <>
                  <p className="preview-name">
                    <Icon name="pin" size={17} />
                    {preview.name}
                  </p>
                  <div className="action-row">
                    <button
                      className="secondary"
                      onClick={() => {
                        setPreview(null);
                        setExpanded(true);
                      }}
                    >
                      重新选
                    </button>
                    <button
                      className="primary"
                      disabled={disabled || mapStatus !== "ready"}
                      onClick={addPlace}
                    >
                      {pending ? "正在添加…" : "添加这个地点"}
                    </button>
                  </div>
                </>
              )}
              {phase === "lobby" && !preview && !expanded && (
                <button className="secondary" onClick={() => setExpanded(true)}>
                  {contributions.length === 2
                    ? "查看我的出题"
                    : "搜索并添加地点"}
                  <Icon name="search" size={18} />
                </button>
              )}
              {playing && (
                <div className={`answer-actions ${placed === 3 ? "answers-complete" : ""}`} aria-busy={pending}>
                  {preview ? (
                    <div className="action-row">
                      <button
                        className="secondary"
                        disabled={disabled}
                        onClick={() => setPreview(null)}
                      >
                        取消
                      </button>
                      <button
                        className="primary"
                        disabled={disabled || mapStatus !== "ready"}
                        onClick={confirmPin}
                      >
                        {pending ? "正在确认…" : "确认位置"}
                        <Icon name="check" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="pin-hint">
                        <span>
                          {placed === 3
                            ? "三题已完成，可以提交了"
                            : selectedGuess
                              ? "位置已保存，点地图可以修改"
                              : "点地图，选择你猜的位置"}
                        </span>
                        {selectedGuess && (
                          <button
                            className="text-btn"
                            disabled={disabled}
                            onClick={undo}
                          >
                            <Icon name="undo" size={17} />
                            撤销
                          </button>
                        )}
                      </div>
                      {placed === 3 && (
                        <button
                          className="primary"
                          disabled={disabled}
                          onClick={() => act({ type: "submit" }, "答案已提交")}
                        >
                          {pending ? "正在提交…" : "提交全部答案"}
                          <Icon name="arrow" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              {phase === "playing" && !playing && !expanded && (
                <button className="secondary" onClick={() => setExpanded(true)}>
                  查看大家的进度
                  <Icon name="users" size={18} />
                </button>
              )}
            </>
          )}
        </footer>
      </section>
      <Guide open={guide} onClose={closeGuide} />
      <ConfirmDialog
        value={confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const type = confirm.messageType;
          setConfirm(null);
          act({ type });
        }}
      />
      <Toast message={toast} />
    </main>
  );
}

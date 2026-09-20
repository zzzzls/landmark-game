import { useEffect, useLayoutEffect, useRef, useState } from "react";
import MapView from "./MapView.jsx";
import { WinnerSpotlight } from "./Results.jsx";
import { Invite } from "./Invite.jsx";
import { useRoom, navigate, formatDistance } from "./ws.js";
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
import { hasAllAnswers, saveGuessAndSubmit } from "./answerFlow.js";

function useMapLayout(topRef, floatingRef, panelRef, mode) {
  const [layout, setLayout] = useState({
    height: window.visualViewport?.height || window.innerHeight,
    chrome: 66,
    padding: [100, 20, 48, 20],
  });
  useLayoutEffect(() => {
    function measure() {
      const top = topRef.current?.getBoundingClientRect();
      const floating = floatingRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      const mobile = window.matchMedia("(max-width: 860px)").matches;
      const height = window.visualViewport?.height || window.innerHeight;
      const chrome = Math.ceil(top?.bottom || 66);
      const padding = [
        Math.ceil(floating?.bottom || chrome) + 16,
        20,
        panel && mobile ? Math.ceil(height - panel.top + 16) : 48,
        panel && !mobile ? Math.ceil(panel.right + 24) : 20,
      ];
      setLayout((old) =>
        old.height === height &&
        old.chrome === chrome &&
        old.padding.every((n, i) => n === padding[i])
          ? old
          : { height, chrome, padding },
      );
    }
    const observer = new ResizeObserver(measure);
    for (const ref of [topRef, floatingRef, panelRef])
      if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [mode, topRef, floatingRef, panelRef]);
  return layout;
}

export default function GameRoom({
  code,
  name,
  role,
  onRestart,
  sessionReady = true,
}) {
  const { state, error, send, status, pending } = useRoom(code, role, name);
  const admin = role === "admin";
  const [tab, setTab] = useState(admin ? "manage" : "play");
  const [preview, setPreview] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [mapStatus, setMapStatus] = useState("loading");
  const [guide, setGuide] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [resultDetail, setResultDetail] = useState(false);
  const operationRef = useRef(false);
  const restartRef = useRef(false);
  const topRef = useRef(null);
  const floatingRef = useRef(null);
  const panelRef = useRef(null);
  const prevPhase = useRef(null);
  const { toast, showToast } = useToast();
  const you = state?.you || {};
  const players = state?.players || [];
  const phase = state?.phase;
  const targets = you.targets || [];
  const guesses = you.guesses || [];
  const contributions = you.contribute || [];
  const selected =
    targets.find((t) => t.id === selectedId) ||
    targets.find((t) => !guesses.some((g) => g.targetId === t.id)) ||
    targets[0];
  const selectedGuess = guesses.find((g) => g.targetId === selected?.id);
  const managing = admin && tab === "manage";
  const disabled = status !== "connected" || !sessionReady || pending || busy;
  const personalRevealed =
    phase === "reveal" || (phase === "playing" && you.submitted);
  const overview = personalRevealed && !managing && !resultDetail;
  const playing =
    phase === "playing" && targets.length > 0 && !you.submitted && !managing;
  const contributing = phase === "lobby" && !managing;
  const ready = players.filter((p) => p.contributed >= 2);
  const submitted = ready.filter((p) => p.submitted);
  const unready = players.filter((p) => p.contributed < 2);
  const ownResult = state?.leaderboard?.find((p) => p.playerId === you.id);
  const mode = `${phase}-${tab}-${overview}-${resultDetail}`;
  const layout = useMapLayout(topRef, floatingRef, panelRef, mode);
  let overlays =
    phase === "lobby"
      ? { pins: contributePins(you), lines: [] }
      : phase === "reveal" && managing
        ? screenMapOverlays(state)
        : playerMapOverlays(you, phase);
  if (personalRevealed && resultDetail && selectedId && !managing) {
    overlays = playerMapOverlays(
      {
        ...you,
        targets: targets.filter((t) => t.id === selectedId),
        results: (you.results || []).filter((r) => r.id === selectedId),
      },
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
    // Preserve the selected personal result when the rest of the room finishes.
    if (phase !== "reveal") {
      setSelectedId(null);
      setResultDetail(false);
    }
    if (phase === "playing" && targets.length) setTab("play");
  }, [phase, targets.length]);
  useEffect(() => {
    if (you.submitted) {
      setPreview(null);
      setSelectedId(null);
      setResultDetail(false);
    }
  }, [you.submitted]);

  async function act(message, success) {
    if (operationRef.current) return null;
    operationRef.current = true;
    setBusy(true);
    try {
      const next = await send(message);
      if (success) showToast(success);
      return next;
    } catch (err) {
      showToast(err.message || "操作失败，请重试");
      return null;
    } finally {
      operationRef.current = false;
      setBusy(false);
    }
  }
  async function addPlace() {
    if (!preview || disabled) return;
    const p = preview;
    const next = await act(
      { type: "contribute", name: p.name, lng: p.lng, lat: p.lat },
      `已添加「${p.name}」`,
    );
    if (next) setPreview(null);
  }
  async function confirmPin() {
    if (!preview || !selected || disabled || operationRef.current) return;
    operationRef.current = true;
    setBusy(true);
    try {
      await saveGuessAndSubmit(
        send,
        {
          type: "guess",
          targetId: selected.id,
          lng: preview.lng,
          lat: preview.lat,
        },
        (next) => {
          setPreview(null);
          const target = next.you.targets.find(
            (t) => !next.you.guesses.some((g) => g.targetId === t.id),
          );
          if (target) setSelectedId(target.id);
        },
      );
    } catch (err) {
      showToast(err.message || "操作失败，请重试");
    } finally {
      operationRef.current = false;
      setBusy(false);
    }
  }
  function pickTarget(id) {
    if (!disabled) {
      setSelectedId(id);
      setPreview(null);
    }
  }
  async function undo() {
    if (!selectedGuess || disabled) return;
    if (await act({ type: "unguess", targetId: selected.id })) setPreview(null);
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
    } catch (err) {
      showToast(err.message || "重开失败，请重试");
    } finally {
      restartRef.current = false;
      setRestarting(false);
    }
  }
  function closeGuide() {
    localStorage.setItem("lg-guide-seen", "1");
    setGuide(false);
  }
  function showResult(id) {
    setSelectedId(id);
    setResultDetail(true);
  }
  const resultActions = (
    <>
      {admin && phase === "reveal" && (
        <button
          className="primary play-again"
          disabled={disabled || restarting}
          onClick={playAgain}
        >
          <Icon name="undo" />
          {restarting ? "正在重开…" : "重开一局"}
        </button>
      )}
      <p className="replay-note">
        {phase !== "reveal"
          ? "已提交，最终排名待公布"
          : admin
            ? "所有玩家将自动进入新局，重新出题"
            : "等待管理员开启下一局 · 无需刷新"}
      </p>
    </>
  );
  const roomError = error && (
    <div className="error room-error" role="alert">
      {error}
      {status === "error" && (
        <button
          className="text-btn"
          onClick={() => {
            try {
              sessionStorage.removeItem("lg-name");
            } catch {
              /* URL also holds the nickname. */
            }
            navigate(admin ? "/admin" : "/");
          }}
        >
          更换昵称
        </button>
      )}
    </div>
  );

  return (
    <main
      className={`game-room floating-game ${admin ? "is-admin" : ""} ${contributing || playing || (resultDetail && !managing) ? "map-play" : ""} ${managing ? "is-managing" : ""} ${overview ? "results-overview" : ""}`}
      data-phase={phase || "connecting"}
      style={{
        "--chrome-bottom": `${layout.chrome}px`,
        "--viewport-height": `${layout.height}px`,
      }}
    >
      {!overview && (
        <MapView
          references={state?.references || []}
          pins={overlays.pins}
          lines={overlays.lines}
          preview={managing ? null : preview}
          clickable={playing && !disabled && mapStatus === "ready"}
          onMapClick={(lng, lat) => {
            if (!operationRef.current)
              setPreview({ lng, lat, kind: "guess", zoom: false });
          }}
          previewActions={
            preview && !managing ? (
              <div
                className="pin-actions"
                aria-label={contributing ? "确认出题地点" : "确认答题位置"}
                aria-busy={busy}
              >
                <button
                  className="pin-confirm"
                  aria-label={
                    contributing
                      ? busy
                        ? "正在添加…"
                        : "添加这个地点"
                      : busy
                        ? "正在确认…"
                        : "确认位置"
                  }
                  disabled={disabled || mapStatus !== "ready"}
                  onClick={contributing ? addPlace : confirmPin}
                >
                  <span aria-hidden="true">✅</span>
                </button>
                <button
                  className="pin-cancel"
                  aria-label="取消预览"
                  disabled={disabled}
                  onClick={() => setPreview(null)}
                >
                  <span aria-hidden="true">❌</span>
                </button>
              </div>
            ) : null
          }
          fitKey={
            personalRevealed
              ? `reveal-${managing ? "all" : selectedId || "all"}`
              : ""
          }
          fitPadding={layout.padding}
          onStatusChange={setMapStatus}
          focusPoint={playing ? [116.397, 39.91] : null}
          focusKey={playing ? "playing" : null}
        />
      )}
      <div className="room-chrome" ref={topRef}>
        <header className="room-top">
          <a className="room-brand" href="/" aria-label="返回首页">
            <Brand />
          </a>
          {admin && (
            <div
              className="room-tabs role-switch"
              role="group"
              aria-label="房主视图"
            >
              <button
                aria-label="房间管理"
                aria-pressed={managing}
                disabled={busy || pending}
                onClick={() => {
                  setTab("manage");
                  setPreview(null);
                }}
              >
                管理
              </button>
              <button
                aria-label="我的答题"
                aria-pressed={!managing}
                disabled={busy || pending}
                onClick={() => setTab("play")}
              >
                答题
              </button>
            </div>
          )}
          <div className="room-top-actions">
            <button
              className="room-code"
              aria-label={`复制房间号 ${code}`}
              onClick={async () => {
                try {
                  showToast(
                    (await copyText(code))
                      ? "房间号已复制"
                      : "未能复制，请长按选择链接。",
                  );
                } catch {
                  showToast("未能复制，请长按选择链接。");
                }
              }}
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
      {(contributing || playing) && (
        <section className="map-tasks" ref={floatingRef} aria-label="游戏任务">
          {contributing ? (
            <>
              <h1 className="sr-only">
                {contributions.length === 2 ? "准备好了" : "给朋友出两道题"}
              </h1>
              <Contribute
                you={you}
                references={state?.references || []}
                preview={preview}
                disabled={disabled}
                onPick={(p) => setPreview(p)}
                onRemove={(p) =>
                  act({ type: "remove_contribute", id: p.id }, "已移除地点")
                }
              />
            </>
          ) : (
            <>
              <h1 className="sr-only">凭记忆，猜三个点</h1>
              <div
                className="question-tabs"
                role="group"
                aria-label="选择题目"
                style={{
                  "--active-slot": Math.max(
                    0,
                    targets.findIndex((t) => t.id === selected?.id),
                  ),
                }}
              >
                <span className="question-highlight" aria-hidden="true" />
                {targets.map((target, i) => {
                  const saved = guesses.some((g) => g.targetId === target.id);
                  return (
                    <button
                      key={target.id}
                      aria-label={`第${i + 1}题 ${target.name}`}
                      aria-pressed={selected?.id === target.id}
                      data-confirmed={saved}
                      disabled={disabled}
                      onClick={() => pickTarget(target.id)}
                    >
                      <span className="question-meta">
                        <b>0{i + 1}</b>
                        {saved && <Icon name="check" size={14} />}
                      </span>
                      <span className="question-name" tabIndex={0}>
                        {target.name}
                      </span>
                      <span className="sr-only">
                        {saved ? "已确认" : "未确认"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="answer-status">
                <p className="answer-count" role="status" aria-live="polite">
                  {`已确认 ${guesses.length}/3`}
                  <span>
                    {busy
                      ? " · 正在确认…"
                      : guesses.length === 2 && !selectedGuess
                        ? " · 确认本题后自动提交"
                        : " · 三题确认后自动提交"}
                  </span>
                </p>
                {selectedGuess && !preview && (
                  <button
                    className="text-btn"
                    disabled={disabled}
                    onClick={undo}
                    aria-label="撤销"
                  >
                    <Icon name="undo" size={15} />
                    撤销
                  </button>
                )}
              </div>
              {hasAllAnswers(you) && !busy && !pending && (
                <div className="submit-recovery">
                  <span>三题已保存，尚未完成提交</span>
                  <button
                    className="primary"
                    disabled={disabled}
                    onClick={() => act({ type: "submit" })}
                  >
                    重试提交
                  </button>
                </div>
              )}
            </>
          )}
          {roomError}
        </section>
      )}
      {overview && (
        <section className="results-page" aria-label="本局战绩">
          {roomError}
          <PersonalResults
            you={you}
            playerName={name}
            final={phase === "reveal"}
            row={ownResult}
            board={state?.leaderboard}
            roomCode={code}
            selectedId={selectedId}
            onSelect={showResult}
          />
          {phase === "reveal" && (
            <section className="results-board">
              <h2 className="section-title">本局排名</h2>
              <Leaderboard
                board={state.leaderboard}
                selfRank={ownResult?.rank}
              />
            </section>
          )}
          <footer className="results-footer">{resultActions}</footer>
        </section>
      )}
      {personalRevealed && resultDetail && !managing && (
        <section
          className="map-tasks result-map-tools"
          ref={floatingRef}
          aria-label="地图回看"
        >
          <button
            className="secondary return-results"
            onClick={() => setResultDetail(false)}
          >
            <Icon name="back" size={18} />
            返回成绩
          </button>
          <div className="result-map-tabs" role="group" aria-label="回看题目">
            {(you.results || []).map((result, i) => (
              <button
                key={result.id}
                aria-pressed={result.id === selectedId}
                onClick={() => setSelectedId(result.id)}
              >
                <span>
                  {i + 1}. {result.name}
                </span>
                <b>{formatDistance(result.distance_m)}</b>
              </button>
            ))}
          </div>
          {roomError}
        </section>
      )}
      {!overview &&
        !contributing &&
        !playing &&
        !(personalRevealed && resultDetail && !managing) && (
          <section
            className="task-panel expanded management-panel"
            ref={panelRef}
            aria-label={managing ? "房间管理" : "游戏任务"}
          >
            <div className="task-heading">
              <div>
                <p className="task-subtitle">
                  {players.length} 人已加入 ·{" "}
                  {phase === "lobby"
                    ? `${ready.length} 人已准备`
                    : `${submitted.length}/${ready.length} 人已提交`}
                </p>
                <h1>
                  {managing
                    ? "房间管理"
                    : phase === "playing"
                      ? "本局旁观"
                      : "正在进入房间"}
                </h1>
              </div>
            </div>
            {roomError}
            <div className="task-body">
              {managing && phase === "lobby" && (
                <div className="invite-section">
                  <Invite onCopy={showToast} />
                  <div className="invite-actions">
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
                </div>
              )}
              {managing && phase === "reveal" && (
                <WinnerSpotlight board={state.leaderboard} roomCode={code} />
              )}
              {!managing && (
                <p className="empty-copy">
                  本局开始时未出满两题，下一局再一起挑战吧。
                </p>
              )}
              <Roster players={players} phase={phase} />
              {managing && phase === "lobby" && contributions.length < 2 && (
                <button
                  className="participate-link"
                  onClick={() => setTab("play")}
                >
                  我也要参赛
                  <Icon name="arrow" size={18} />
                </button>
              )}
              {managing && phase === "reveal" && (
                <>
                  <h2 className="section-title">本局排名</h2>
                  <Leaderboard
                    board={state.leaderboard}
                    selfRank={ownResult?.rank}
                  />
                </>
              )}
            </div>
            <footer className="task-footer">
              {managing ? (
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
                ) : phase === "playing" ? (
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
                ) : (
                  resultActions
                )
              ) : (
                <a className="secondary" href="/screen">
                  观看大屏
                </a>
              )}
            </footer>
          </section>
        )}
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

import { useEffect, useState } from "react";
import MapView from "./MapView.jsx";
import {
  CodeChip,
  ConfirmChip,
  ContributePanel,
  DisconnectBanner,
  Leaderboard,
  MapSubmit,
  PlayHud,
  PlayPanel,
  PlayerList,
  SearchFloat,
  Sheet,
  Toast,
  activeTarget,
  contributePins,
  defaultSheetOpen,
  fitPadForSheet,
  playerMapOverlays,
  playFooter,
  screenMapOverlays,
  useCopied,
  useGuessFlow,
  useIsPhone,
  useToast,
} from "./Panels.jsx";
import { phaseLabel, useRoom } from "./ws.js";

export default function Admin({ code, name }) {
  const { state, error, send, retry } = useRoom(code, "admin", name);
  const [preview, setPreview] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(defaultSheetOpen);
  const [lanUrl, setLanUrl] = useState("");
  const isPhone = useIsPhone();
  const { toast, showToast } = useToast();
  const { copied, copy, elRef } = useCopied();

  const you = state?.you || {};
  const players = state?.players || [];
  const ready = players.filter((p) => p.contributed >= 2).length;
  const playing = state?.phase === "playing";
  const reveal = state?.phase === "reveal";
  const hasTargets = Boolean(you.targets?.length);
  const submitted = Boolean(you.submitted);
  const flow = useGuessFlow({ state, selectedId, setSelectedId, send, showToast });
  const selected = activeTarget(you, selectedId);
  const placed = new Set((you.guesses || []).map((g) => g.targetId)).size;
  const clickable = Boolean(playing && hasTargets && !submitted && (selectedId || selected));
  const overlays = !state || state.phase === "lobby"
    ? { pins: contributePins(you), lines: [] }
    : adminMapOverlays(state, you);
  const mapPreview = state?.phase === "lobby" ? preview : playing && !submitted ? flow.preview : null;
  const showMapSubmit = playing && hasTargets && !submitted && placed === 3 && !sheetOpen;
  const roomCode = state?.room || code;
  const pending = players.filter((p) => !p.submitted && p.contributed >= 2).length;

  useEffect(() => {
    const targets = you.targets;
    if (!targets?.length || selectedId != null) return;
    const guessed = new Set((you.guesses || []).map((g) => g.targetId));
    const next = targets.find((t) => !guessed.has(t.id)) || targets[0];
    if (next) setSelectedId(next.id);
  }, [you.targets, you.guesses, selectedId]);

  useEffect(() => {
    if (state?.phase === "reveal") setSheetOpen(true);
  }, [state?.phase]);

  useEffect(() => {
    if (state && state.phase !== "lobby") return;
    let cancelled = false;
    fetch("/api/lan")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setLanUrl((d.urls || [])[0] || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state?.phase]);

  function toggle() {
    setSheetOpen((v) => !v);
  }
  function collapse() {
    setSheetOpen(false);
  }
  function pickTarget(id) {
    flow.pickTarget(id);
    setSheetOpen(false);
  }
  function copyCode() {
    copy(roomCode).then((ok) => {
      if (!ok) showToast("长按复制");
    });
  }
  function onLobbyPick() {
    if (isPhone) collapse();
  }
  function addLobbyPreview() {
    if (!preview || (you.contribute || []).length >= 2) return;
    const n = preview.name;
    send({ type: "contribute", name: preview.name, lng: preview.lng, lat: preview.lat });
    setPreview(null);
    showToast(`已添加 ${n}`);
  }
  function onStart() {
    if ((you.contribute || []).length < 2) {
      if (!window.confirm("你还没出满两题，开始后本局无法作答，确定开始？")) return;
    }
    send({ type: "start" });
  }

  function onReveal() {
    if (pending > 0) {
      if (!window.confirm("还有 " + pending + " 人未提交，确定揭晓？")) return;
    }
    send({ type: "reveal" });
  }

  const peek = !state
    ? null
    : state.phase === "lobby"
      ? sheetOpen
        ? null
        : "已出题 " + (you.contribute || []).length + "/2"
      : selected
        ? "正在钉：" + selected.name
        : null;

  let footer = null;
  if (!state) {
    footer = null;
  } else if (state.phase === "lobby") {
    footer = (
      <button
        type="button"
        className="primary"
        disabled={ready < 1}
        onClick={onStart}
      >
        {"开始（" + ready + "/" + players.length + " 已就绪）"}
      </button>
    );
  } else if (state.phase === "playing") {
    const submitBtn = !showMapSubmit ? playFooter(you, state.phase, send) : null;
    footer = (
      <>
        {submitBtn}
        <button type="button" className="ghost" onClick={onReveal}>
          揭晓
        </button>
      </>
    );
  } else if (hasTargets) {
    footer = playFooter(you, state.phase, send);
  }

  return (
    <div className="app">
      <MapView
        pins={overlays.pins}
        lines={overlays.lines}
        preview={mapPreview}
        clickable={clickable}
        onMapClick={(lng, lat) => {
          setSheetOpen(false);
          flow.onMapClick(lng, lat);
        }}
        onPreviewClick={flow.confirmPreview}
        fitKey={
          reveal || overlays.lines.length
            ? "reveal-" + overlays.pins.length + "-" + overlays.lines.length
            : ""
        }
        fitPadding={fitPadForSheet(sheetOpen)}
      />
      <CodeChip code={roomCode} copied={copied} onCopy={copyCode} elRef={elRef} />
      {playing && !submitted && hasTargets && selected && (
        <PlayHud
          name={selected.name}
          placed={placed}
          canUnguess={!submitted && placed > 0 && !sheetOpen}
          onUnguess={flow.unguess}
        />
      )}
      {playing && submitted && (
        <div className="map-hud">
          <div className="hud-chip">已提交，等待揭晓</div>
        </div>
      )}
      {playing && !submitted && flow.preview && (
        <ConfirmChip onConfirm={flow.confirmPreview} raised={showMapSubmit} />
      )}
      {showMapSubmit && <MapSubmit onSubmit={() => send({ type: "submit" })} />}
      {state?.phase === "lobby" && preview && (you.contribute || []).length < 2 && (
        <div className="map-submit">
          <button type="button" className="primary" onClick={addLobbyPreview}>
            {"添加「" + preview.name + "」"}
          </button>
        </div>
      )}
      {!sheetOpen && state?.phase === "lobby" && !(preview && (you.contribute || []).length < 2) && (
        <div className="map-submit">
          <button type="button" className="primary" disabled={ready < 1} onClick={onStart}>
            {"开始（" + ready + "/" + players.length + " 已就绪）"}
          </button>
        </div>
      )}
      {!sheetOpen && playing && (
        <div className={"map-submit" + (showMapSubmit ? " raised" : "")}>
          <button type="button" className="ghost" onClick={onReveal}>
            揭晓
          </button>
        </div>
      )}
      {isPhone && state && state.phase === "lobby" && (
        <SearchFloat
          you={you}
          send={send}
          preview={preview}
          setPreview={setPreview}
          onCollapse={collapse}
          onToast={showToast}
        />
      )}
      <Sheet
        expanded={sheetOpen}
        onToggle={toggle}
        title={roomCode}
        tabLabel={roomCode || "菜单"}
        onTitleClick={copyCode}
        subtitle={state ? "管理员 · " + phaseLabel(state.phase) : "管理员 · 连接中…"}
        titleNote={copied ? "已复制" : state ? "管理员 · " + phaseLabel(state.phase) : "管理员 · 连接中…"}
        peek={peek}
        footer={footer}
      >
        {!state ? (
          error && <div className="error">{error}</div>
        ) : (
          <>
            <PlayerList players={players} phase={state.phase} />
            {error && <div className="error">{error}</div>}
            {state.phase === "lobby" && lanUrl && (
              <p className="hint">本机局域网 {lanUrl}</p>
            )}
            {state.phase === "lobby" && (
              <ContributePanel
                you={you}
                send={send}
                error=""
                preview={preview}
                setPreview={setPreview}
                hideSearch={isPhone}
                onPick={onLobbyPick}
                onToast={showToast}
              />
            )}
            {hasTargets && state.phase !== "lobby" && (
              <PlayPanel
                you={you}
                send={send}
                error=""
                phase={state.phase}
                selectedId={selectedId}
                setSelectedId={pickTarget}
                hideActions
                onUnguess={flow.unguess}
              />
            )}
            {reveal && (
              <section className="list-wrap">
                <h2>排名</h2>
                <Leaderboard board={state.leaderboard} showDistance />
              </section>
            )}
          </>
        )}
      </Sheet>
      <DisconnectBanner retry={retry} />
      <Toast message={toast} />
    </div>
  );
}

function adminMapOverlays(state, you) {
  if (state.phase === "reveal") return screenMapOverlays(state);
  return playerMapOverlays(you, state.phase);
}

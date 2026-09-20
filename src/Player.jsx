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
  useCopied,
  useGuessFlow,
  useIsPhone,
  useToast,
} from "./Panels.jsx";
import { phaseLabel, useRoom } from "./ws.js";

export default function Player({ code, name }) {
  const { state, error, send, retry } = useRoom(code, "player", name);
  const [preview, setPreview] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(defaultSheetOpen);
  const isPhone = useIsPhone();
  const { toast, showToast } = useToast();
  const { copied, copy, elRef } = useCopied();

  const you = state?.you || {};
  const playing = state?.phase === "playing";
  const reveal = state?.phase === "reveal";
  const submitted = Boolean(you.submitted);
  const flow = useGuessFlow({ state, selectedId, setSelectedId, send, showToast });
  const selected = activeTarget(you, selectedId);
  const placed = new Set((you.guesses || []).map((g) => g.targetId)).size;
  const clickable = Boolean(playing && !submitted && (selectedId || selected));
  const overlays = !state || state.phase === "lobby"
    ? { pins: contributePins(you), lines: [] }
    : playerMapOverlays(you, state.phase);
  const mapPreview = state?.phase === "lobby" ? preview : playing && !submitted ? flow.preview : null;
  const showMapSubmit = playing && !submitted && placed === 3 && !sheetOpen;
  const roomCode = state?.room || code;

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

  const peek = !state
    ? null
    : state.phase === "lobby"
      ? sheetOpen
        ? null
        : `已出题 ${(you.contribute || []).length}/2`
      : selected
        ? `正在钉：${selected.name}`
        : null;

  let footer = null;
  if (state && state.phase !== "lobby" && !showMapSubmit) {
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
        fitKey={reveal ? `reveal-${overlays.pins.length}-${overlays.lines.length}` : ""}
        fitPadding={fitPadForSheet(sheetOpen)}
      />
      <CodeChip code={roomCode} copied={copied} onCopy={copyCode} elRef={elRef} />
      {playing && !submitted && selected && (
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
            {`添加「${preview.name}」`}
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
        title="地标盲猜"
        tabLabel={roomCode || "菜单"}
        subtitle={state ? `${state.room} · ${name} · ${phaseLabel(state.phase)}` : `房间 ${code} · 连接中…`}
        peek={peek}
        footer={footer}
      >
        {!state ? (
          error && <div className="error">{error}</div>
        ) : state.phase === "lobby" ? (
          <>
            <ContributePanel
              you={you}
              send={send}
              error={error}
              preview={preview}
              setPreview={setPreview}
              hideSearch={isPhone}
              onPick={onLobbyPick}
              onToast={showToast}
            />
            {(you.contribute || []).length >= 2 && (
              <>
                <p className="hint">已就绪，等待管理员开始</p>
                <PlayerList players={state.players} phase={state.phase} compact />
              </>
            )}
          </>
        ) : you.targets?.length ? (
          <>
            <PlayPanel
              you={you}
              send={send}
              error={error}
              phase={state.phase}
              selectedId={selectedId}
              setSelectedId={pickTarget}
              hideActions
              onUnguess={flow.unguess}
            />
            {reveal && (
              <section className="list-wrap">
                <h2>排名</h2>
                <Leaderboard board={state.leaderboard} showDistance />
              </section>
            )}
          </>
        ) : (
          <section className="panel">
            <p className="hint">本局已开始，本局无法作答</p>
            {reveal && (
              <section className="list-wrap">
                <h2>排名</h2>
                <Leaderboard board={state.leaderboard} showDistance />
              </section>
            )}
          </section>
        )}
      </Sheet>
      <DisconnectBanner retry={retry} />
      <Toast message={toast} />
    </div>
  );
}

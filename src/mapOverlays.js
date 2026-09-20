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
  const colorById = Object.fromEntries(
    targets.map((t, i) => [t.id, placeColor(i)]),
  );
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
  const guessMap = Object.fromEntries(
    (you?.guesses || []).map((g) => [g.targetId, g]),
  );
  const resultMap = Object.fromEntries(
    (you?.results || []).map((r) => [r.id, r]),
  );
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

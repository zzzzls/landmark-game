import { useEffect, useRef, useState } from "react";
import { loadAmap } from "./loadAmap.js";

const BEIJING_CENTER = [116.397, 39.91];
const MAP_STYLE = "amap://styles/normal";
const TILE_BG_ROAD_NO_LABEL =
  "https://webrd0{1,2,3,4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&ltype=11&x=[x]&y=[y]&z=[z]";
const PREVIEW_ZOOM = 16;

function hideMapText(map) {
  if (!map) return;
  if (typeof map.setShowLabel === "function") {
    map.setShowLabel(false);
  }
  if (typeof map.setStatus === "function") {
    try {
      map.setStatus({ showLabel: false });
    } catch {
      /* ignore */
    }
  }
  try {
    const layers = typeof map.getLayers === "function" ? map.getLayers() : [];
    for (const layer of layers) {
      const name = String(layer?.CLASS_NAME || "");
      if (name.includes("TileLayer") && typeof layer.setTileUrl === "function") {
        layer.setTileUrl(TILE_BG_ROAD_NO_LABEL);
        if (typeof layer.reload === "function") layer.reload();
      }
    }
  } catch {
    /* ignore */
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncatePinName(s) {
  const t = String(s || "");
  return t.length > 6 ? `${t.slice(0, 6)}…` : t;
}

function pinHtml({ name, label, tag, color, kind, preview: isPreview }) {
  const c = color || "#C23A2B";
  const fallback = kind === "guess" ? "预览" : "";
  const text = escapeHtml(truncatePinName(name || label || fallback));
  const tagHtml = tag ? `<span class="mk-tag">${escapeHtml(tag)}</span>` : "";
  const kindClass = kind === "true" ? " mk-true" : kind === "guess" ? " mk-guess" : "";
  const previewClass = isPreview ? " mk-preview" : "";
  return `<div class="mk${kindClass}${previewClass}" style="--pin:${escapeHtml(c)}"><span class="mk-dot"></span><span class="mk-label">${text}${tagHtml}</span></div>`;
}

export default function MapView({
  pins = [],
  lines = [],
  preview = null,
  clickable = false,
  onMapClick,
  onPreviewClick,
  fitKey,
  fitPadding = [40, 40, 40, 40],
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef([]);
  const clickableRef = useRef(clickable);
  const onClickRef = useRef(onMapClick);
  const onPreviewClickRef = useRef(onPreviewClick);
  const [status, setStatus] = useState("loading");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    clickableRef.current = clickable;
    onClickRef.current = onMapClick;
    onPreviewClickRef.current = onPreviewClick;
  }, [clickable, onMapClick, onPreviewClick]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const AMap = await loadAmap();
        if (cancelled || !elRef.current) return;
        const map = new AMap.Map(elRef.current, {
          viewMode: "2D",
          zoom: 12,
          center: BEIJING_CENTER,
          features: ["bg", "road"],
          showLabel: false,
          mapStyle: MAP_STYLE,
          isHotspot: false,
          showIndoorMap: false,
          jogEnable: false,
        });
        mapRef.current = map;
        let ignoreClick = false;
        map.on("dragstart", () => {
          ignoreClick = true;
        });
        map.on("dragend", () => {
          window.setTimeout(() => {
            ignoreClick = false;
          }, 50);
        });
        map.on("complete", () => {
          hideMapText(map);
          if (!cancelled) setStatus("ready");
        });
        map.on("click", (e) => {
          if (ignoreClick) return;
          if (!clickableRef.current) return;
          if (!onClickRef.current) return;
          const lng = e.lnglat.getLng();
          const lat = e.lnglat.getLat();
          onClickRef.current(lng, lat);
        });
        hideMapText(map);
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [nonce]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = window.AMap;
    if (!map || !AMap || status !== "ready") return;
    if (overlayRef.current.length) {
      map.remove(overlayRef.current);
      overlayRef.current = [];
    }
    const extras = [];
    for (const line of lines) {
      const from = line?.from;
      const to = line?.to;
      if (!from || !to || from.length < 2 || to.length < 2) continue;
      extras.push(
        new AMap.Polyline({
          path: [
            [from[0], from[1]],
            [to[0], to[1]],
          ],
          strokeColor: line.color || "#C23A2B",
          strokeWeight: 4,
          strokeOpacity: 0.9,
          strokeStyle: "dashed",
          lineJoin: "round",
          lineCap: "round",
          bubble: true,
          clickable: false,
        })
      );
    }
    const all = [...pins];
    if (preview && preview.lng != null && preview.lat != null) {
      const kind = preview.kind || (preview.name ? undefined : "guess");
      const rawName = preview.name || preview.label || (kind === "guess" ? "预览" : "");
      all.push({
        key: "preview",
        lng: preview.lng,
        lat: preview.lat,
        name: truncatePinName(rawName),
        label: rawName,
        tag: kind === "guess" ? "猜" : kind === "true" ? "真" : undefined,
        color: preview.color || "#007AFF",
        kind,
        title: preview.name || "预览",
      });
    }
    for (const p of all) {
      const marker = new AMap.Marker({
        position: [p.lng, p.lat],
        offset: new AMap.Pixel(-12, -12),
        content: pinHtml({ ...p, preview: p.key === "preview" }),
        bubble: p.key !== "preview",
        zIndex: p.key === "preview" ? 140 : p.kind === "true" ? 120 : 110,
      });
      if (p.key === "preview") {
        marker.on("click", () => {
          onPreviewClickRef.current?.();
        });
      }
      extras.push(marker);
    }
    if (extras.length) map.add(extras);
    overlayRef.current = extras;
    if (fitKey && (extras.length > 1 || lines.length)) {
      try {
        const pad = fitPadding && fitPadding.length === 4 ? fitPadding : [40, 40, 40, 40];
        map.setFitView(extras, false, pad);
      } catch {
        /* ignore */
      }
    }
  }, [pins, lines, preview, fitKey, fitPadding, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    if (preview == null || preview.lng == null || preview.lat == null) return;
    if (preview.zoom === false) return;
    try {
      map.setZoomAndCenter(PREVIEW_ZOOM, [Number(preview.lng), Number(preview.lat)]);
    } catch {
      /* ignore */
    }
  }, [preview, status]);

  function retry() {
    setNonce((n) => n + 1);
  }

  return (
    <div className={`map-pane${clickable ? " clickable" : ""}`}>
      <div ref={elRef} className="map" />
      {status === "loading" && <div className="overlay">正在加载北京地图…</div>}
      {status === "error" && (
        <div className="overlay overlay-error">
          <p>地图加载失败，请检查网络后重试。</p>
          <button type="button" className="primary overlay-retry" onClick={retry}>
            重试
          </button>
        </div>
      )}
    </div>
  );
}

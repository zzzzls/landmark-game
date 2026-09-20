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

function pinHtml({
  name,
  label,
  tag,
  color,
  kind,
  preview: isPreview,
  coincident,
}) {
  const c = color || "#C23A2B";
  const fallback = kind === "guess" ? "预览" : "";
  const text = escapeHtml(truncatePinName(name || label || fallback));
  const tagHtml = tag ? `<span class="mk-tag">${escapeHtml(tag)}</span>` : "";
  const kindClass =
    kind === "true" ? " mk-true" : kind === "guess" ? " mk-guess" : "";
  const previewClass = `${isPreview ? " mk-preview" : ""}${coincident ? " mk-coincident" : ""}`;
  return `<div class="mk${kindClass}${previewClass}" style="--pin:${escapeHtml(c)}"><span class="mk-dot"></span><span class="mk-label">${text}${tagHtml}</span></div>`;
}

export default function MapView({
  pins = [],
  references = [],
  lines = [],
  preview = null,
  clickable = false,
  onMapClick,
  onPreviewClick,
  previewActions,
  variant = "full",
  fitKey,
  fitPadding = [40, 40, 40, 40],
  onStatusChange,
  focusPoint,
  focusKey,
  focusZoom = 12,
}) {
  const elRef = useRef(null);
  const actionRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const compact = variant === "thumbnail";
  const mapRef = useRef(null);
  const overlayRef = useRef([]);
  const previewMarkerRef = useRef(null);
  const referenceSignature = JSON.stringify(references);
  const clickableRef = useRef(clickable);
  const onClickRef = useRef(onMapClick);
  const onPreviewClickRef = useRef(onPreviewClick);
  const [status, setStatus] = useState("loading");
  const [nonce, setNonce] = useState(0);
  const [mapSize, setMapSize] = useState([0, 0]);
  const [errorMessage, setErrorMessage] = useState("");
  const statusCallbackRef = useRef(onStatusChange);
  statusCallbackRef.current = onStatusChange;
  const lastFitRef = useRef(null);
  const overlaySignature = JSON.stringify([pins, lines, preview]);
  const paddingSignature = JSON.stringify(fitPadding);

  useEffect(() => {
    statusCallbackRef.current?.(status);
  }, [status]);

  useEffect(() => {
    clickableRef.current = clickable;
    onClickRef.current = onMapClick;
    onPreviewClickRef.current = onPreviewClick;
  }, [clickable, onMapClick, onPreviewClick]);

  useEffect(() => {
    let cancelled = false;
    let ownedMap = null;
    let readyTimer = null;
    let dragTimer = null;
    setStatus("loading");
    setErrorMessage("");
    lastFitRef.current = null;
    overlayRef.current = [];
    const fail = (code) => {
      if (cancelled) return;
      clearTimeout(readyTimer);
      if (ownedMap) {
        ownedMap.destroy();
        ownedMap = null;
        mapRef.current = null;
      }
      const messages = {
        missing_js_key: "尚未配置高德地图 Key，请房主检查本地地图配置后重试。",
        map_config_invalid:
          "高德地图配置无效，请房主检查 Key 与安全密钥后重试。",
        map_config_unavailable:
          "暂时无法读取地图配置，请确认游戏服务已启动后重试。",
        map_config_timeout: "读取地图配置超时，请检查与游戏服务器的连接。",
        map_network_failed: "无法连接高德地图，请检查网络后重试。",
        map_network_timeout: "高德地图加载超时，请检查网络后重试。",
        map_tiles_timeout: "地图尚未加载完成，请检查网络及高德配置后重试。",
      };
      setErrorMessage(
        messages[code] || "地图加载失败，请检查网络及高德配置后重试。",
      );
      setStatus("error");
    };
    (async () => {
      try {
        const AMap = await loadAmap();
        if (cancelled || !elRef.current) return;
        const map = new AMap.Map(elRef.current, {
          viewMode: "2D",
          zoom: 12,
          center: BEIJING_CENTER,
          layers: [new AMap.TileLayer({ tileUrl: TILE_BG_ROAD_NO_LABEL })],
          features: ["bg", "road"],
          showLabel: false,
          mapStyle: MAP_STYLE,
          isHotspot: false,
          showIndoorMap: false,
          jogEnable: false,
          // A quick second pin must not start a zoom animation that can
          // outlive submission/reveal. Touch pinch and wheel zoom remain.
          doubleClickZoom: false,
          dragEnable: !compact,
          zoomEnable: !compact,
          scrollWheel: !compact,
          touchZoom: !compact,
          keyboardEnable: !compact,
        });
        ownedMap = map;
        mapRef.current = map;
        let ignoreClick = false;
        map.on("dragstart", () => {
          clearTimeout(dragTimer);
          ignoreClick = true;
        });
        map.on("dragend", () => {
          dragTimer = setTimeout(() => {
            ignoreClick = false;
          }, 80);
        });
        map.on("complete", () => {
          if (cancelled || ownedMap !== map) return;
          clearTimeout(readyTimer);
          hideMapText(map);
          setStatus("ready");
        });
        map.on("click", (e) => {
          if (ignoreClick || !clickableRef.current || !onClickRef.current)
            return;
          onClickRef.current(e.lnglat.getLng(), e.lnglat.getLat());
        });
        readyTimer = setTimeout(() => fail("map_tiles_timeout"), 20000);
        hideMapText(map);
      } catch (error) {
        fail(error.message);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(readyTimer);
      clearTimeout(dragTimer);
      if (ownedMap) ownedMap.destroy();
      mapRef.current = null;
      overlayRef.current = [];
    };
  }, [nonce, compact]);

  useEffect(() => {
    const map = mapRef.current;
    const element = elRef.current;
    if (!map || !element || status !== "ready") return;
    let frame;
    let cancelled = false;
    const syncSize = () => {
      if (cancelled) return;
      const { width, height } = map.getSize();
      // The SDK resize event can precede its internal size update.
      if (width !== element.clientWidth || height !== element.clientHeight) {
        frame = requestAnimationFrame(syncSize);
        return;
      }
      setMapSize((previous) =>
        previous[0] === width && previous[1] === height
          ? previous
          : [width, height],
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncSize);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    map.on("resize", schedule);
    schedule();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      map.off("resize", schedule);
    };
  }, [status, nonce]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = window.AMap;
    if (!map || !AMap || status !== "ready") return;
    // Public orientation aids are separate from game overlays and fit bounds.
    const markers = references.map(
      (place) =>
        new AMap.Marker({
          position: [place.lng, place.lat],
          offset: new AMap.Pixel(-16, -16),
          bubble: true,
          zIndex: 60,
          content: `<div class="mk-reference" data-reference-id="${escapeHtml(place.id)}" role="img" aria-label="公共参照：${escapeHtml(place.name)}"><span class="reference-emoji" aria-hidden="true">${escapeHtml(place.emoji)}</span><span class="reference-name">${escapeHtml(place.name)}<small>参照</small></span></div>`,
        }),
    );
    if (markers.length) map.add(markers);
    return () => {
      if (mapRef.current === map) map.remove(markers);
    };
  }, [referenceSignature, status, nonce]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = window.AMap;
    if (!map || !AMap || status !== "ready") return;
    if (overlayRef.current.length) {
      map.remove(overlayRef.current);
      overlayRef.current = [];
    }
    previewMarkerRef.current = null;
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
        }),
      );
    }
    const all = [...pins];
    if (preview && preview.lng != null && preview.lat != null) {
      const kind = preview.kind || (preview.name ? undefined : "guess");
      const rawName =
        preview.name || preview.label || (kind === "guess" ? "预览" : "");
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
        content: pinHtml({
          ...p,
          coincident: all.some(
            (other) =>
              other !== p &&
              other.lng === p.lng &&
              other.lat === p.lat &&
              other.kind !== p.kind,
          ),
          ...(compact
            ? { name: "", label: p.kind === "guess" ? "猜" : "真", tag: "" }
            : {}),
          preview: p.key === "preview",
        }),
        bubble: p.key !== "preview",
        zIndex: p.key === "preview" ? 140 : p.kind === "true" ? 120 : 110,
      });
      if (p.key === "preview") {
        previewMarkerRef.current = marker;
        marker.on("click", () => {
          onPreviewClickRef.current?.();
        });
      }
      extras.push(marker);
    }
    if (extras.length) map.add(extras);
    overlayRef.current = extras;
  }, [overlaySignature, status, compact]);

  useEffect(() => {
    const map = mapRef.current;
    const extras = overlayRef.current;
    if (!map || status !== "ready" || !fitKey || !extras.length) return;
    const signature = JSON.stringify([fitKey, paddingSignature, mapSize]);
    if (lastFitRef.current === signature) return;
    const frame = requestAnimationFrame(() => {
      const element = elRef.current;
      const size = map.getSize();
      if (
        !element ||
        size.width !== element.clientWidth ||
        size.height !== element.clientHeight
      )
        return;
      try {
        const padding =
          fitPadding?.length === 4 ? fitPadding : [40, 40, 40, 40];
        // UI uses CSS order; AMap expects [top, bottom, left, right].
        // https://developer.amap.com/api/javascript-api-v2/guide/map/state
        const [top, right, bottom, left] = padding;
        map.setFitView(
          extras,
          true,
          compact
            ? [top + 12, bottom + 20, left + 12, right + 46]
            : [top + 16, bottom + 24, left + 16, right + 128],
          16,
        );
        lastFitRef.current = signature;
      } catch {
        /* Retain the current viewport if bounds are unavailable. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [fitKey, paddingSignature, overlaySignature, status, mapSize, compact]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      fitKey ||
      status !== "ready" ||
      preview?.lng == null ||
      preview?.lat == null ||
      preview.zoom === false
    )
      return;
    const frame = requestAnimationFrame(() => {
      const marker = previewMarkerRef.current;
      const element = elRef.current;
      const size = map.getSize();
      if (
        !marker ||
        !element ||
        size.width !== element.clientWidth ||
        size.height !== element.clientHeight
      )
        return;
      try {
        const [top, right, bottom, left] = fitPadding;
        map.setFitView(
          [marker],
          true,
          [top + 16, bottom + 24, left + 16, right + 110],
          PREVIEW_ZOOM,
        );
      } catch {
        /* A later preview or viewport resize can retry positioning. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    preview?.lng,
    preview?.lat,
    preview?.zoom,
    status,
    fitKey,
    paddingSignature,
    mapSize,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      fitKey ||
      status !== "ready" ||
      !focusPoint?.every(Number.isFinite)
    )
      return;
    map.setZoomAndCenter(focusZoom, focusPoint, true);
  }, [focusKey, focusPoint?.[0], focusPoint?.[1], focusZoom, status, fitKey]);

  // React owns the controls; AMap only projects the geographic anchor. Keep
  // screen positioning on a wrapper so the entry animation never moves the pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready" || !preview || !previewActions) {
      setAnchor(null);
      return;
    }
    let frame;
    function measure() {
      const point = map.lngLatToContainer([preview.lng, preview.lat]);
      const rect = elRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = actionRef.current?.offsetWidth || 104;
      const height = actionRef.current?.offsetHeight || 48;
      const x = point.getX(),
        y = point.getY();
      const side = x + 22 + width <= rect.width - 12 ? "right" : "left";
      const visibleBottom = Math.min(
        rect.height,
        (window.visualViewport?.height || window.innerHeight) +
          (window.visualViewport?.offsetTop || 0) -
          rect.top,
      );
      const top = Math.min(
        visibleBottom - height - 40,
        Math.max(fitPadding[0], y - height / 2),
      );
      const left = Math.max(
        12,
        Math.min(
          rect.width - width - 12,
          side === "right" ? x + 22 : x - width - 22,
        ),
      );
      // A dragged-offscreen point must not leave orphaned buttons on the edge.
      const visible = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
      setAnchor((old) =>
        old?.left === left &&
        old?.top === top &&
        old?.side === side &&
        old?.visible === visible
          ? old
          : { left, top, side, visible },
      );
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    const events = ["mapmove", "zoomchange", "resize", "moveend", "zoomend"];
    events.forEach((event) => map.on(event, schedule));
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    const observer = new ResizeObserver(schedule);
    if (actionRef.current) observer.observe(actionRef.current);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      events.forEach((event) => map.off(event, schedule));
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [
    preview?.lng,
    preview?.lat,
    !!previewActions,
    paddingSignature,
    status,
    mapSize,
  ]);

  function retry() {
    setNonce((n) => n + 1);
  }

  return (
    <div
      className={`map-pane${clickable ? " clickable" : ""}${compact ? " map-thumbnail" : ""}`}
      data-map-status={status}
    >
      <div ref={elRef} className="map" />
      {previewActions && preview && (
        <div
          ref={actionRef}
          className="map-anchor"
          data-side={anchor?.side || "right"}
          style={{
            left: anchor?.left || 0,
            top: anchor?.top || 0,
            visibility: anchor?.visible ? "visible" : "hidden",
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            key={`${preview.lng}:${preview.lat}`}
            className="map-anchor-enter"
          >
            {previewActions}
          </div>
        </div>
      )}
      {status === "loading" && <div className="overlay">正在加载北京地图…</div>}
      {status === "error" && (
        <div className="overlay overlay-error">
          <p role="alert">{errorMessage}</p>
          <button
            type="button"
            className="primary overlay-retry"
            onClick={retry}
          >
            重试
          </button>
        </div>
      )}
    </div>
  );
}

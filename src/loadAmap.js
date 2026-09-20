function loadScript(src, isReady) {
  if (isReady()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let el = Array.from(document.scripts).find(
      (script) => script.getAttribute("src") === src,
    );
    // An old completed/failed script cannot fire another load event. Replace it.
    if (el && el.dataset.amapLoad !== "loading") {
      el.remove();
      el = null;
    }
    const created = !el;
    if (!el) {
      el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.dataset.amapLoad = "loading";
    }
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      el.removeEventListener("load", loaded);
      el.removeEventListener("error", failed);
      el.dataset.amapLoad = error ? "error" : "loaded";
      if (error) {
        el.remove();
        reject(new Error(error));
      } else resolve();
    };
    const loaded = () => finish(isReady() ? null : "map_config_invalid");
    const failed = () => finish("map_network_failed");
    const timer = setTimeout(() => finish("map_network_timeout"), 12000);
    el.addEventListener("load", loaded);
    el.addEventListener("error", failed);
    if (created) document.head.appendChild(el);
    else if (isReady()) finish(null);
  });
}

let inflight = null;

async function loadAmapInner() {
  if (window.AMap) return window.AMap;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let cfg;
  try {
    const response = await fetch("/api/map-config", {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error("map_config_unavailable");
    cfg = await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("map_config_timeout");
    throw new Error("map_config_unavailable");
  } finally {
    clearTimeout(timer);
  }
  if (!cfg.jsKey?.trim()) throw new Error("missing_js_key");
  await loadScript("/api/amap-security.js", () =>
    Boolean(window._AMapSecurityConfig?.securityJsCode),
  );
  await loadScript(
    "https://webapi.amap.com/maps?v=2.0&key=" + encodeURIComponent(cfg.jsKey),
    () => Boolean(window.AMap),
  );
  return window.AMap;
}

export function loadAmap() {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (!inflight) {
    inflight = loadAmapInner().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

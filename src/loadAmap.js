function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (window.AMap) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script_failed")));
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("script_failed"));
    document.head.appendChild(el);
  });
}

let inflight = null;

async function loadAmapInner() {
  if (window.AMap) return window.AMap;
  const cfg = await fetch("/api/map-config").then((r) => r.json());
  if (!cfg.jsKey) throw new Error("missing_js_key");
  await loadScript("/api/amap-security.js");
  await loadScript("https://webapi.amap.com/maps?v=2.0&key=" + encodeURIComponent(cfg.jsKey));
  if (!window.AMap) throw new Error("amap_unavailable");
  return window.AMap;
}

export function loadAmap() {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (inflight) return inflight;
  inflight = Promise.race([
    loadAmapInner(),
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error("timeout")), 8000);
    }),
  ]).then((AMap) => AMap).catch((err) => {
    inflight = null;
    throw err;
  });
  return inflight;
}

import test from "node:test";
import assert from "node:assert/strict";

let importVersion = 0;
async function harness(t) {
  const originals = new Map();
  function replace(key, value) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    });
  }
  const env = {
    config: "valid",
    scriptMode: "success",
    requests: 0,
    appended: 0,
  };
  const window = {};
  const scripts = [];
  const document = {
    scripts,
    createElement() {
      const listeners = new Map();
      return {
        dataset: {},
        getAttribute(key) {
          return this[key];
        },
        addEventListener(type, callback) {
          listeners.set(type, callback);
        },
        removeEventListener(type) {
          listeners.delete(type);
        },
        remove() {
          const i = scripts.indexOf(this);
          if (i !== -1) scripts.splice(i, 1);
        },
        emit(type) {
          listeners.get(type)?.();
        },
      };
    },
    head: {
      appendChild(script) {
        scripts.push(script);
        env.appended++;
        queueMicrotask(() => {
          if (env.scriptMode === "network-error") {
            script.emit("error");
            return;
          }
          if (script.src === "/api/amap-security.js") {
            window._AMapSecurityConfig = {
              securityJsCode:
                env.scriptMode === "invalid-security" ? "" : "fixture-security",
            };
          } else {
            window.AMap = { Map: class Map {} };
          }
          script.emit("load");
        });
      },
    },
  };
  replace("window", window);
  replace("document", document);
  replace("fetch", async () => {
    env.requests++;
    return {
      ok: env.config !== "unavailable",
      json: async () => ({
        jsKey: env.config === "missing" ? "" : "fixture-key",
      }),
    };
  });
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  // Each test has independent module-level in-flight state.
  const { loadAmap } = await import(
    `../src/loadAmap.js?test=${++importVersion}`
  );
  return { env, window, document, scripts, loadAmap };
}

test("missing map configuration fails clearly and can recover after configuration is supplied", async (t) => {
  const h = await harness(t);
  h.env.config = "missing";
  await assert.rejects(h.loadAmap(), /missing_js_key/);
  assert.equal(h.env.appended, 0);
  h.env.config = "valid";
  assert.equal(await h.loadAmap(), h.window.AMap);
  assert.equal(h.env.requests, 2);
});

test("configuration service failure is separate from provider network failure", async (t) => {
  const h = await harness(t);
  h.env.config = "unavailable";
  await assert.rejects(h.loadAmap(), /map_config_unavailable/);
  assert.equal(h.env.appended, 0);
  h.env.config = "valid";
  h.env.scriptMode = "network-error";
  await assert.rejects(h.loadAmap(), /map_network_failed/);
  assert.equal(
    h.scripts.length,
    0,
    "Failed script must be removed to allow a genuine retry",
  );
  h.env.scriptMode = "success";
  assert.equal(await h.loadAmap(), h.window.AMap);
});

test("invalid security configuration rejects and a retry reloads the security script", async (t) => {
  const h = await harness(t);
  h.env.scriptMode = "invalid-security";
  await assert.rejects(h.loadAmap(), /map_config_invalid/);
  assert.equal(h.scripts.length, 0);
  h.env.scriptMode = "success";
  assert.equal(await h.loadAmap(), h.window.AMap);
  assert.equal(h.env.appended, 3);
});

test("an already-loaded security script does not wait for a load event that already happened", async (t) => {
  const h = await harness(t);
  const securityScript = h.document.createElement("script");
  securityScript.src = "/api/amap-security.js";
  h.scripts.push(securityScript);
  h.window._AMapSecurityConfig = {
    securityJsCode: "fixture-existing-security",
  };
  // No load event will ever be emitted for this existing script.
  assert.equal(await h.loadAmap(), h.window.AMap);
  assert.equal(h.env.appended, 1, "Only the map SDK should need loading");
  assert.equal(h.scripts[0], securityScript);
});

test("concurrent consumers share one load and subsequent consumers reuse the SDK", async (t) => {
  const h = await harness(t);
  const first = h.loadAmap(),
    second = h.loadAmap();
  assert.equal(first, second);
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b);
  assert.equal(h.env.requests, 1);
  assert.equal(h.env.appended, 2);
  assert.equal(await h.loadAmap(), a);
  assert.equal(h.env.requests, 1);
  assert.equal(h.env.appended, 2);
});

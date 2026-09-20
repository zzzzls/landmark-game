import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PLAYTEST_BASE_URL || "http://localhost:5173";
const SHOTS = path.resolve("artifacts/screenshots");
const runtimeErrors = [];
// One shared current-room lifecycle; stop after a failure instead of cascading
// into later scenarios with half-finished game state.
test.describe.configure({ mode: "serial" });
test.beforeEach(() => {
  runtimeErrors.length = 0;
});
test.afterEach(() => {
  expect(runtimeErrors, "No uncaught browser errors").toEqual([]);
});
function watchErrors(page) {
  page.on("pageerror", (error) =>
    runtimeErrors.push(error.message.replace(/key=[^&\s]+/g, "key=[redacted]")),
  );
}
const PHONE = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
};

async function mobile(browser, width = 390) {
  const context = await browser.newContext({
    ...PHONE,
    viewport: { width, height: 844 },
    baseURL: BASE,
  });
  const page = await context.newPage();
  watchErrors(page);
  return { context, page };
}

function observeRoom(page, role) {
  // Observe actual server broadcasts; game actions below always use visible UI.
  const observed = { current: null, session: null };
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      try {
        const state = JSON.parse(String(payload));
        if (state.type === "state" && (!role || new URL(socket.url()).pathname.endsWith(`/${role}`))) observed.current = state;
        if (state.type === "session") observed.session = state;
      } catch {
        /* Ignore non-state transport frames. */
      }
    }),
  );
  return observed;
}

async function stableMapLayout(page) {
  if (!(await page.locator(".amap-maps").count())) return;
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        let previous = "",
          stableSince = performance.now();
        const deadline = performance.now() + 8000;
        const sample = () => {
          const now = performance.now();
          const signature = JSON.stringify(
            [
              ...document.querySelectorAll(
                ".mk-dot,.mk-label,.task-panel,.screen-rail,.amap-layer",
              ),
            ].map((el) => {
              const r = el.getBoundingClientRect();
              return [
                Math.round(r.x * 10),
                Math.round(r.y * 10),
                Math.round(r.width * 10),
                Math.round(r.height * 10),
              ];
            }),
          );
          if (signature !== previous) {
            previous = signature;
            stableSince = now;
          }
          if (now - stableSince >= 400) resolve();
          else if (now > deadline)
            reject(new Error("Map layout did not settle"));
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
}

async function capture(page, name) {
  await expect(page.locator(".toast")).toHaveCount(0);
  await stableMapLayout(page);
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({
    path: path.join(SHOTS, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

async function closeGuide(page) {
  await expect(page.getByRole("dialog", { name: "先出两道题" })).toBeVisible();
  await page.getByRole("button", { name: "跳过指引", exact: true }).click();
  await expect(page.locator(".guide-dialog")).not.toBeVisible();
}

async function mapReady(page) {
  await expect(page.locator(".amap-maps")).toBeVisible({ timeout: 40_000 });
  await expect(page.locator(".map-pane > .overlay")).toHaveCount(0, {
    timeout: 40_000,
  });
}

async function enter(page, role, name) {
  await page.goto(role === "admin" ? "/admin" : "/");
  await page.getByLabel("你的昵称").fill(name);
  await page.getByRole("button", {
    name: role === "admin" ? "进入控制台" : "加入游戏", exact: true,
  }).click();
  await expect(page).toHaveURL(new RegExp(`${role === "admin" ? "/admin" : "/"}\\?name=`));
}

async function dismissGuide(page) {
  // The guide is shown only once per browser context, including across rounds.
  const seen = await page.evaluate(() => !!localStorage.getItem("lg-guide-seen"));
  if (!seen) await closeGuide(page);
}

async function joined(page) {
  await expect(page.locator(".game-room")).toBeVisible();
  await dismissGuide(page);
  await expect(page.locator(".game-room")).not.toHaveAttribute("data-phase", "connecting");
  await mapReady(page);
}

async function createRoom(page, name = "测试房主") {
  await enter(page, "admin", name);
  const create = page.getByRole("button", { name: "创建房间", exact: true });
  await expect(page.locator(".game-room").or(create)).toBeVisible();
  if (await create.isVisible()) await create.click();
  await joined(page);
  const restart = page.getByRole("button", { name: "重开一局", exact: true });
  if (await restart.isVisible()) await restart.click();
  await expect(page.locator(".game-room")).toHaveAttribute("data-phase", "lobby");
  await mapReady(page);
  // A disconnected administrator seat is reclaimed (including its nickname
  // change). Remove that previous scenario's draft contributions through UI.
  await page.getByRole("button", { name: "我的答题", exact: true }).click();
  while (await page.getByRole("button", { name: /^移除/ }).count()) {
    const before = await page.locator(".place-slots .filled").count();
    await page.getByRole("button", { name: /^移除/ }).first().click();
    await expect(page.locator(".place-slots .filled")).toHaveCount(before - 1);
  }
  await page.getByRole("button", { name: "房间管理", exact: true }).click();
}

async function joinRoom(page, _code, name) {
  await enter(page, "player", name);
  await joined(page);
  await expect(page.getByRole("button", { name: /创建房间|重开一局|再开一局/ })).toHaveCount(0);
}

async function contribute(page, query) {
  const count = await page.locator(".place-slots .filled").count();
  await page
    .getByRole("searchbox", { name: "找一个你熟悉的北京地点" })
    .fill(query);
  const results = page.getByRole("list", { name: "搜索结果" });
  await expect(results.getByRole("button").first()).toBeVisible({
    timeout: 25_000,
  });
  await results.getByRole("button").filter({ hasText: query }).first().click();
  await expect(
    page.getByRole("button", { name: "添加这个地点", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "添加这个地点", exact: true }).click();
  await expect(page.locator(".place-slots .filled")).toHaveCount(count + 1);
}

async function startRoom(page) {
  await page.getByRole("button", { name: /^开始游戏 ·/ }).click();
  const dialog = page.getByRole("dialog", { name: "现在开始这局？" });
  if (await dialog.isVisible())
    await dialog.getByRole("button", { name: "开始游戏", exact: true }).click();
  await expect(page.locator(".game-room")).toHaveAttribute("data-phase", "playing");
}

async function mapPoint(page, offset = 0) {
  // Derive a real uncovered coordinate; never invoke AMap internals or inject pins.
  const panel = await page.locator(".task-panel").boundingBox();
  const caption = await page.locator(".map-caption").boundingBox();
  const viewport = page.viewportSize();
  const top = caption ? caption.y + caption.height + 24 : 160;
  const bottom = Math.min(panel.y - 24, viewport.height - 100);
  expect(
    bottom - top,
    "The phone must retain a usable map above the task panel",
  ).toBeGreaterThan(60);
  return {
    x: Math.min(viewport.width - 55, 145 + offset),
    y: top + (bottom - top) * 0.48,
  };
}

async function confirmMapPin(page, offset = 0) {
  await mapReady(page);
  const point = await mapPoint(page, offset);
  await page.touchscreen.tap(point.x, point.y);
  const confirm = page.getByRole("button", { name: "确认位置", exact: true });
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(confirm).not.toBeVisible();
}

async function answerAll(page) {
  for (let index = 1; index <= 3; index++) {
    await page
      .getByRole("button", { name: new RegExp(`^第${index}题 `) })
      .click();
    await confirmMapPin(page, index * 30);
    await expect(page.locator(".task-subtitle")).toContainText(
      `已确认 ${index}/3`,
    );
  }
  await expect(
    page.getByRole("button", { name: "提交全部答案", exact: true }),
  ).toBeEnabled();
}

async function noHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(Math.max(dimensions.document, dimensions.body)).toBeLessThanOrEqual(
    dimensions.viewport + 1,
  );
}

async function pinsInsideVisibleMap(page, panelSelector) {
  await stableMapLayout(page);
  await expect
    .poll(
      async () =>
        page.evaluate((panelSelector) => {
          const obstacle = document
            .querySelector(panelSelector)
            .getBoundingClientRect();
          const header = document
            .querySelector(".room-top, .screen-header")
            .getBoundingClientRect();
          const pins = [...document.querySelectorAll(".mk-dot,.mk-label")]
            .filter(pin => !pin.closest(".mk-reference"));
          if (!pins.length) return ["No markers"];
          return pins.flatMap((pin) => {
            const r = pin.getBoundingClientRect();
            const onScreen =
              r.left >= 0 &&
              r.right <= innerWidth &&
              r.top >= header.bottom &&
              r.bottom <= innerHeight;
            const covered =
              r.right > obstacle.left &&
              r.left < obstacle.right &&
              r.bottom > obstacle.top &&
              r.top < obstacle.bottom;
            return onScreen && !covered
              ? []
              : [
                  {
                    text: pin.textContent,
                    box: { x: r.x, y: r.y, width: r.width, height: r.height },
                    panelTop: obstacle.top,
                    panelLeft: obstacle.left,
                  },
                ];
          });
        }, panelSelector),
      {
        message:
          "All answer markers must be on the visible map, outside the panel",
      },
    )
    .toEqual([]);
}

async function expandDetails(page) {
  const button = page.getByRole("button", { name: "展开详情", exact: true });
  if (await button.isVisible()) await button.click();
}

// Session tests share one current room. Start this suite against a fresh backend;
// subsequent scenarios reuse its lobby or restart its revealed round through UI.
async function trackSockets(page) {
  await page.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.__testRoomSockets = [];
    window.WebSocket = class extends NativeSocket {
      constructor(...args) {
        super(...args);
        if (String(args[0]).includes("/ws/")) window.__testRoomSockets.push(this);
      }
    };
  });
}
async function interruptNetwork(client) {
  await client.context.setOffline(true);
  await client.page.evaluate(() => window.__testRoomSockets.forEach(socket => socket.close()));
  await expect(client.page.locator(".connection-banner").first()).toBeVisible();
}
async function submit(page) {
  await page.getByRole("button", { name: "提交全部答案", exact: true }).click();
  await expect(page.locator(".personal-results")).toBeVisible();
}
function distanceText(meters) {
  return meters < 1000 ? `${Math.round(meters)} 米` : `${(meters / 1000).toFixed(2)} 公里`;
}
function separationMeters(a, b) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(a.lat - b.lat);
  const dLng = radians(a.lng - b.lng);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
async function referenceLandmarks(page, observed) {
  await expect.poll(() => observed.current?.references?.length).toBe(4);
  expect(observed.current.references.map(place => place.name).sort()).toEqual(["天安门", "鸟巢", "北京西站", "国贸"].sort());
  await expect(page.locator(".mk-reference")).toHaveCount(4);
  for (const place of observed.current.references) {
    expect(Number.isFinite(place.lng) && Number.isFinite(place.lat)).toBe(true);
    await expect(page.locator(".mk-reference").filter({ hasText: place.name })).toContainText(place.emoji);
  }
}
async function ownResults(page, observed) {
  await expect.poll(() => observed.current?.you.results?.length).toBe(3);
  const you = observed.current.you;
  expect(you.results.every(result => Number.isFinite(result.distance_m))).toBe(true);
  expect(you.totalError).toBe(you.results.reduce((sum, result) => sum + result.distance_m, 0));
  for (const result of you.results) {
    for (const reference of observed.current.references) {
      expect(result.name.replace(/\s/g, "").toLowerCase()).not.toBe(reference.name.replace(/\s/g, "").toLowerCase());
      expect(separationMeters(result, reference), "Public orientation landmarks must not become answers").toBeGreaterThan(50);
    }
  }
  await expect(page.locator(".result-summary")).toContainText(distanceText(you.totalError));
  await expect(page.locator(".result-list > li")).toHaveCount(3);
  for (const result of you.results) {
    const row = page.getByRole("button", { name: `查看${result.name}的结果`, exact: true });
    await expect(row).toContainText(distanceText(result.distance_m));
  }
}
async function assertFresh(observed, oldCode) {
  await expect.poll(() => observed.current?.room).not.toBe(oldCode);
  await expect.poll(() => observed.current?.phase).toBe("lobby");
  expect(observed.current.you.contribute).toEqual([]);
  expect(observed.current.you.guesses).toEqual([]);
  expect(observed.current.you.submitted).toBe(false);
  expect(observed.current.you.targets || []).toEqual([]);
  expect(observed.current.you.results).toBeUndefined();
}

test("waiting players and screen follow create, private immediate scores, final three-place board and restart", async ({ browser }) => {
  const host = await mobile(browser);
  const first = await mobile(browser);
  const second = await mobile(browser, 430);
  await trackSockets(second.page);
  const screenContext = await browser.newContext({ baseURL: BASE, viewport: { width: 1920, height: 1080 } });
  const screen = await screenContext.newPage();
  watchErrors(screen);
  const hostState = observeRoom(host.page);
  const firstState = observeRoom(first.page);
  const secondState = observeRoom(second.page);
  const screenState = observeRoom(screen, "screen");
  try {
    await enter(first.page, "player", "胡同探索员");
    await expect(first.page.getByRole("heading", { name: "等待管理员创建房间", exact: true })).toBeVisible();
    await expect(first.page.getByRole("button", { name: /创建房间|重开一局/ })).toHaveCount(0);
    await screen.goto("/screen");
    await expect(screen.getByRole("heading", { name: "等待管理员创建房间", exact: true })).toBeVisible();
    await capture(first.page, "player-waiting-390");
    await capture(screen, "screen-waiting-1920");
    await createRoom(host.page);
    await joined(first.page); // No reload or navigation: session broadcast enters the room.
    await mapReady(screen);
    await expect.poll(() => screenState.current?.phase).toBe("lobby");
    await joinRoom(second.page, null, "方向感特别好的北京朋友");
    await referenceLandmarks(first.page, firstState);
    await referenceLandmarks(screen, screenState);
    const code = firstState.current.room;
    expect(hostState.current.room).toBe(code);
    expect(screenState.current.room).toBe(code);
    await capture(host.page, "host-lobby-390");
    await capture(screen, "screen-lobby-1920");
    await contribute(first.page, "天坛");
    await contribute(first.page, "故宫");
    await contribute(second.page, "北海");
    await contribute(second.page, "颐和园");
    await capture(first.page, "player-ready-390");
    await first.page.reload();
    await mapReady(first.page);
    await expect(first.page.locator(".place-slots .filled")).toHaveCount(2);
    await expect(first.page.locator(".guide-dialog")).not.toBeVisible();
    await startRoom(host.page);
    for (const client of [first, second])
      await expect(client.page.locator(".game-room")).toHaveAttribute("data-phase", "playing");
    await expect.poll(() => firstState.current?.you.targets?.length).toBe(3);
    expect(firstState.current.you.targets.every(target => !("lng" in target) && !("lat" in target))).toBe(true);
    for (const target of firstState.current.you.targets)
      expect(firstState.current.references.map(place => place.name)).not.toContain(target.name);
    expect(screenState.current.truePins).toBeUndefined();
    await noHorizontalOverflow(first.page);
    await capture(first.page, "player-guessing-390");
    const point = await mapPoint(first.page);
    const gesture = await first.context.newCDPSession(first.page);
    await gesture.send("Input.synthesizeScrollGesture", { x: Math.round(point.x), y: Math.round(point.y), xDistance: 45, yDistance: 18, gestureSourceType: "touch", preventFling: true });
    await gesture.send("Input.synthesizePinchGesture", { x: Math.round(point.x), y: Math.round(point.y), scaleFactor: 1.25, gestureSourceType: "touch", relativeSpeed: 400 });
    await gesture.detach();
    await first.page.waitForTimeout(150); // Real map's post-drag tap guard.
    await expect(first.page.getByRole("button", { name: "确认位置", exact: true })).not.toBeVisible();
    await answerAll(first.page);
    await first.page.getByRole("button", { name: /^第1题 / }).click();
    await first.page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(first.page.locator(".task-subtitle")).toContainText("已确认 2/3");
    await expect(first.page.getByRole("button", { name: "提交全部答案", exact: true })).not.toBeVisible();
    await confirmMapPin(first.page, 90);
    await first.page.getByRole("button", { name: /^第1题 / }).click();
    await confirmMapPin(first.page, 120);
    await first.page.reload();
    await mapReady(first.page);
    await expect(first.page.locator(".task-subtitle")).toContainText("已确认 3/3");
    await submit(first.page);
    await ownResults(first.page, firstState);
    await expect(first.page.locator(".game-room")).toHaveAttribute("data-phase", "playing");
    await expect(first.page.locator(".result-challenge")).toContainText("最终排名待公布");
    await expect(first.page.locator(".result-rank,.leaderboard")).toHaveCount(0);
    await expect(first.page.locator(".mk-true")).toHaveCount(3);
    await expect.poll(() => screenState.current?.screenPins?.length).toBe(1);
    for (const observed of [firstState, secondState, hostState, screenState]) {
      expect(observed.current.phase).toBe("playing");
      expect(observed.current.leaderboard).toEqual([]);
      expect(observed.current.playerResults).toBeUndefined();
      expect(observed.current.players.every(player => player.totalError === null)).toBe(true);
    }
    expect(secondState.current.you.results).toBeUndefined();
    expect(hostState.current.you.results).toBeUndefined();
    expect(screenState.current.truePins).toBeUndefined();
    await expect(second.page.locator(".mk-true,.personal-results")).toHaveCount(0);
    await expect(screen.locator(".mk-true,.screen-results")).toHaveCount(0);
    await capture(first.page, "player-submitted-private-390");
    await answerAll(second.page);
    await submit(second.page);
    for (const client of [host, first, second])
      await expect(client.page.locator(".game-room")).toHaveAttribute("data-phase", "reveal");
    await expect.poll(() => screenState.current?.phase).toBe("reveal");
    await ownResults(second.page, secondState);
    const scored = screenState.current.playerResults.filter(row => row.submitted);
    expect(scored).toHaveLength(2);
    for (const player of scored) {
      const row = screen.locator(".screen-result-row").filter({ has: screen.locator(".screen-result-player > strong", { hasText: player.name }) });
      await expect(row).toHaveCount(1);
      await expect(row.locator(".screen-result-places > div")).toHaveCount(3);
      for (const result of player.results) {
        await expect(row).toContainText(result.name);
        await expect(row).toContainText(distanceText(result.distance_m));
      }
    }
    const scores = screenState.current.leaderboard.map(row => row.totalError);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    await pinsInsideVisibleMap(second.page, ".task-panel");
    await pinsInsideVisibleMap(screen, ".screen-rail");
    await capture(screen, "screen-reveal-1920");
    for (const width of [360, 390, 430]) {
      await first.page.setViewportSize({ width, height: 844 });
      await noHorizontalOverflow(first.page);
      await pinsInsideVisibleMap(first.page, ".task-panel");
      await capture(first.page, `player-results-${width}`);
    }
    await first.page.getByRole("button", { name: /^查看.*的结果$/ }).first().click();
    await expect(first.page.locator(".mk-true")).toHaveCount(1);
    await pinsInsideVisibleMap(first.page, ".task-panel");
    await capture(first.page, "player-result-detail-430");
    await first.page.getByRole("button", { name: "查看成绩与排名", exact: true }).click();
    await expect(first.page.locator(".mk-true")).toHaveCount(3);
    // One client misses the entire restart broadcast; its session reconnect must
    // still select the new current room and discard old answers automatically.
    await interruptNetwork(second);
    await host.page.getByRole("button", { name: "重开一局", exact: true }).click();
    await assertFresh(firstState, code);
    await assertFresh(hostState, code);
    await expect.poll(() => screenState.current?.room).toBe(firstState.current.room);
    await expect(screen.locator(".screen-page")).toHaveAttribute("data-phase", "lobby");
    await second.context.setOffline(false);
    await assertFresh(secondState, code);
    await expect(second.page.locator(".connection-banner")).toHaveCount(0);
    await mapReady(second.page);
    await expect(second.page.locator(".place-slots .filled")).toHaveCount(0);
    await second.page.reload();
    await mapReady(second.page);
    expect(secondState.current.room).toBe(firstState.current.room);
    expect(secondState.current.players.find(player => player.id === secondState.current.you.id).name).toBe("方向感特别好的北京朋友");
    await capture(first.page, "player-restarted-430");
  } finally {
    await Promise.all([host.context.close(), first.context.close(), second.context.close(), screenContext.close()]);
  }
});

test("solo participating administrator sees truthful first-frame results and preserves reduced motion", async ({ browser }) => {
  const host = await mobile(browser, 360);
  const state = observeRoom(host.page);
  const observeSettlement = () => {
    window.__settlementEvidence = { first: null, celebrationStarts: 0 };
    let celebrating = false;
    new MutationObserver(() => {
      const panel = document.querySelector(".personal-results");
      if (panel && !window.__settlementEvidence.first)
        window.__settlementEvidence.first = panel.querySelector(".result-summary")?.textContent;
      const active = !!panel?.classList.contains("is-celebrating");
      if (active && !celebrating) window.__settlementEvidence.celebrationStarts++;
      celebrating = active;
    }).observe(document, { childList: true, subtree: true, attributes: true });
  };
  try {
    await createRoom(host.page, "单人房主");
    await host.page.getByRole("button", { name: "我的答题", exact: true }).click();
    await contribute(host.page, "天坛");
    await contribute(host.page, "故宫");
    await host.page.getByRole("button", { name: "房间管理", exact: true }).click();
    await startRoom(host.page);
    await expect(host.page.getByRole("button", { name: "我的答题", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(state.current.you.targets).toHaveLength(3);
    expect(state.current.you.targets.every(target => target.id.startsWith("pool_"))).toBe(true);
    expect(state.current.you.targets.some(target => ["天坛", "故宫"].includes(target.name))).toBe(false);
    await capture(host.page, "solo-guessing-360");
    await answerAll(host.page);
    await host.page.evaluate(observeSettlement);
    await host.page.addInitScript(observeSettlement);
    await submit(host.page);
    await expect(host.page.locator(".game-room")).toHaveAttribute("data-phase", "reveal");
    await ownResults(host.page, state);
    const total = distanceText(state.current.you.totalError);
    await expect.poll(() => host.page.evaluate(() => window.__settlementEvidence.celebrationStarts)).toBe(1);
    expect(await host.page.evaluate(() => window.__settlementEvidence.first)).toContain(total);
    await expect(host.page.locator(".result-rank b")).toHaveText("1");
    await expect(host.page.locator(".personal-results")).not.toHaveClass(/is-celebrating/);
    await pinsInsideVisibleMap(host.page, ".task-panel");
    await capture(host.page, "solo-results-360");
    await host.page.getByRole("button", { name: "房间管理", exact: true }).click();
    await host.page.getByRole("button", { name: "我的答题", exact: true }).click();
    await expect(host.page.locator(".personal-results")).not.toHaveClass(/is-celebrating/);
    await host.page.reload();
    await mapReady(host.page);
    await host.page.getByRole("button", { name: "我的答题", exact: true }).click();
    await expect(host.page.locator(".result-summary")).toContainText(total);
    await expect(host.page.locator(".personal-results")).not.toHaveClass(/is-celebrating/);
    expect(await host.page.evaluate(() => window.__settlementEvidence.celebrationStarts)).toBe(0);
    await host.page.emulateMedia({ reducedMotion: "reduce" });
    const motion = await host.page.locator(".personal-results").evaluate(panel => {
      // Inspect the celebration selectors under the real reduced-motion media
      // preference; applying the class changes no game state or score.
      panel.classList.add("is-celebrating");
      const values = [panel, ...panel.querySelectorAll("*")].flatMap(element => [null, "::before", "::after"].map(pseudo => {
        const style = getComputedStyle(element, pseudo);
        return [style.animationDuration, style.transitionDuration];
      })).flat();
      panel.classList.remove("is-celebrating");
      return values;
    });
    for (const value of motion) expect(value.split(",").every(duration => parseFloat(duration) <= 0.00001)).toBe(true);
    await noHorizontalOverflow(host.page);
    await capture(host.page, "solo-results-reduced-motion-360");
  } finally { await host.context.close(); }
});

test("early reveal, late spectator and network recovery keep incomplete results honest", async ({ browser }) => {
  const host = await mobile(browser);
  const player = await mobile(browser);
  const spectator = await mobile(browser, 360);
  const state = observeRoom(player.page);
  const spectatorState = observeRoom(spectator.page);
  await trackSockets(player.page);
  try {
    await createRoom(host.page, "提前揭晓主持人");
    await joinRoom(player.page, null, "未完成玩家");
    await contribute(player.page, "北海");
    await contribute(player.page, "颐和园");
    await startRoom(host.page);
    await confirmMapPin(player.page);
    await expect(player.page.locator(".task-subtitle")).toContainText("已确认 1/3");
    await interruptNetwork(player);
    await expect(player.page.locator(".map-pane")).not.toHaveClass(/clickable/);
    await player.page.getByRole("button", { name: /^第1题 / }).click();
    await expect(player.page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
    await player.context.setOffline(false);
    await expect(player.page.locator(".connection-banner")).toHaveCount(0);
    await mapReady(player.page);
    await expect(player.page.locator(".task-subtitle")).toContainText("已确认 1/3");
    await joinRoom(spectator.page, null, "迟到的朋友");
    await expect(spectator.page.getByRole("heading", { name: "本局旁观", exact: true })).toBeVisible();
    expect(spectatorState.current.you.targets || []).toEqual([]);
    await expect(spectator.page.locator(".target-tabs")).toHaveCount(0);
    await noHorizontalOverflow(spectator.page);
    await capture(spectator.page, "late-spectator-360");
    await host.page.getByRole("button", { name: "提前揭晓", exact: true }).click();
    const dialog = host.page.getByRole("dialog", { name: "提前揭晓答案？" });
    await expect(dialog).toContainText("未提交者不计入排名");
    await dialog.getByRole("button", { name: "再等等", exact: true }).click();
    await expect(host.page.locator(".game-room")).toHaveAttribute("data-phase", "playing");
    await host.page.getByRole("button", { name: "提前揭晓", exact: true }).click();
    await dialog.getByRole("button", { name: "确认揭晓", exact: true }).click();
    await expect(player.page.locator(".game-room")).toHaveAttribute("data-phase", "reveal");
    await expandDetails(player.page);
    await expect(player.page.locator(".result-summary")).toContainText("未计入排名");
    await expect(player.page.locator(".leaderboard")).toHaveCount(0);
    expect(state.current.you.totalError).toBeNull();
    expect(state.current.you.results.every(result => result.distance_m === null)).toBe(true);
    await expect(spectator.page.locator(".result-summary")).toContainText("本局旁观");
    await expect(spectator.page.locator(".result-detail-heading")).toHaveCount(0);
    await capture(player.page, "early-reveal-incomplete-390");
  } finally { await Promise.all([host.context.close(), player.context.close(), spectator.context.close()]); }
});

test("fixed nickname entry, guide and pixel layouts at phone and desktop sizes", async ({ browser }) => {
  const phone = await mobile(browser);
  try {
    await phone.page.goto("/");
    await expect(phone.page.getByLabel("房间号", { exact: true })).toHaveCount(0);
    await expect(phone.page.getByRole("button", { name: /创建房间|重开一局/ })).toHaveCount(0);
    await phone.page.getByRole("button", { name: "加入游戏", exact: true }).click();
    await expect(phone.page.getByRole("alert")).toContainText("取一个昵称");
    await phone.page.getByRole("button", { name: "怎么玩", exact: true }).click();
    await expect(phone.page.getByRole("heading", { name: "先出两道题", exact: true })).toBeVisible();
    await phone.page.getByRole("button", { name: "下一步", exact: true }).click();
    await expect(phone.page.getByRole("heading", { name: "凭记忆，猜三个点", exact: true })).toBeVisible();
    await phone.page.getByRole("button", { name: "下一步", exact: true }).click();
    await expect(phone.page.getByRole("dialog")).toContainText("立即查看自己的真实位置与总误差");
    await phone.page.getByRole("button", { name: "开始探索", exact: true }).click();
    await phone.page.getByLabel("你的昵称").fill("入口测试");
    await phone.page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [360, 390, 430, 1440, 1920]) {
      await phone.page.setViewportSize({ width, height: width < 500 ? 844 : 1080 });
      await noHorizontalOverflow(phone.page);
      await capture(phone.page, `home-${width}`);
    }
    await phone.page.setViewportSize({ width: 390, height: 500 });
    await phone.page.getByLabel("你的昵称").click();
    await noHorizontalOverflow(phone.page);
    await expect(phone.page.getByLabel("你的昵称")).toBeInViewport();
    await capture(phone.page, "home-short-screen-390");
  } finally { await phone.context.close(); }
});

test("real map and search recover after failures, including short phone keyboard layout", async ({ browser }) => {
  const host = await mobile(browser);
  try {
    await createRoom(host.page, "恢复测试");
    await host.page.route("**/api/map-config", route => route.fulfill({ json: { jsKey: "" } }));
    await host.page.reload();
    await expect(host.page.locator(".overlay-error")).toContainText("尚未配置高德地图 Key");
    await host.page.unroute("**/api/map-config");
    await host.page.locator(".overlay-retry").click();
    await mapReady(host.page);
    await host.page.getByRole("button", { name: "我的答题", exact: true }).click();
    await host.page.route("**/api/search?*", route => route.abort());
    await host.page.getByRole("searchbox").fill("天坛");
    await expect(host.page.getByRole("alert")).toContainText("搜索失败");
    await host.page.unroute("**/api/search?*");
    await host.page.getByRole("button", { name: "重新搜索", exact: true }).click();
    await expect(host.page.getByRole("list", { name: "搜索结果" }).getByRole("button").first()).toBeVisible();
    await host.page.route("**/api/search?q=__empty__", route => route.fulfill({ json: [] }));
    await host.page.getByRole("searchbox").fill("__empty__");
    await expect(host.page.getByText("没有找到，试试更完整的地名。", { exact: true })).toBeVisible();
    await host.page.unroute("**/api/search?q=__empty__");
    await host.page.getByRole("searchbox").fill("");
    await host.page.setViewportSize({ width: 390, height: 500 });
    await host.page.getByRole("searchbox").focus();
    await expect(host.page.getByRole("searchbox")).toBeInViewport();
    await noHorizontalOverflow(host.page);
    await capture(host.page, "player-search-short-screen-390");
    await host.page.setViewportSize({ width: 390, height: 844 });
    await contribute(host.page, "天坛");
    await expect(host.page.locator(".place-slots .filled")).toHaveCount(1);
  } finally { await host.context.close(); }
});

test("participating administrator and player with equal nicknames retain separate personal scores", async ({ browser }) => {
  const host = await mobile(browser);
  const player = await mobile(browser);
  const hostState = observeRoom(host.page);
  const playerState = observeRoom(player.page);
  try {
    await createRoom(host.page, "同名朋友");
    await host.page.getByRole("button", { name: "我的答题", exact: true }).click();
    await joinRoom(player.page, null, "同名朋友");
    await contribute(host.page, "天坛");
    await contribute(host.page, "故宫");
    await contribute(player.page, "北海");
    await contribute(player.page, "颐和园");
    await host.page.getByRole("button", { name: "房间管理", exact: true }).click();
    await startRoom(host.page);
    expect(hostState.current.you.id).not.toBe(playerState.current.you.id);
    await answerAll(host.page);
    await submit(host.page);
    await ownResults(host.page, hostState);
    expect(playerState.current.you.results).toBeUndefined();
    await answerAll(player.page);
    await submit(player.page);
    for (const [page, observed] of [[host.page, hostState], [player.page, playerState]]) {
      await expect(page.locator(".game-room")).toHaveAttribute("data-phase", "reveal");
      await ownResults(page, observed);
      const row = observed.current.leaderboard.find(player => player.playerId === observed.current.you.id);
      await pinsInsideVisibleMap(page, ".task-panel");
      await expect(page.locator(".result-rank b")).toHaveText(String(row.rank));
      await expect(page.locator(".leaderboard .is-you")).toHaveCount(1);
      await expect(page.locator(".leaderboard .is-you strong")).toHaveText(distanceText(observed.current.you.totalError));
    }
  } finally { await Promise.all([host.context.close(), player.context.close()]); }
});

test("thirty seeded participants remain readable across every real screen result page", async ({ browser }) => {
  // This bounded screen-volume fixture uses the actual room WebSocket protocol.
  // The preceding scenarios exercise all player actions through real UI/maps.
  const host = await mobile(browser);
  const hostState = observeRoom(host.page);
  const screenContext = await browser.newContext({ baseURL: BASE, viewport: { width: 1920, height: 1080 } });
  const screen = await screenContext.newPage();
  const observed = observeRoom(screen, "screen");
  watchErrors(screen);
  try {
    await createRoom(host.page, "大屏分页主持人");
    const code = hostState.current.room;
    await screen.goto("/screen");
    await mapReady(screen);
    await screen.evaluate(async code => {
      const seed = [];
      window.__screenSeed = seed;
      const waitFor = (client, predicate) => new Promise((resolve, reject) => {
        const start = performance.now();
        function check() {
          if (client.error) return reject(new Error(client.error));
          if (predicate(client.state)) return resolve(client.state);
          if (performance.now() - start > 15000) return reject(new Error("Screen fixture state timeout"));
          setTimeout(check, 20);
        }
        check();
      });
      window.__seedWait = waitFor;
      for (let i = 0; i < 30; i++) {
        const client = { state: null, error: null };
        const name = `${String(i + 1).padStart(2, "0")}号北京方向感挑战者`;
        client.ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/${code}/player?name=${encodeURIComponent(name)}`);
        client.ws.onmessage = ({ data }) => {
          const message = JSON.parse(data);
          if (message.type === "state") client.state = message;
          if (message.type === "error") client.error = message.message;
        };
        seed.push(client);
        await waitFor(client, state => !!state);
        for (let n = 0; n < 2; n++) {
          client.ws.send(JSON.stringify({ type: "contribute", name: `${name}的地点${n + 1}`, lng: 116.22 + i * .004, lat: 39.83 + n * .14 }));
          await waitFor(client, state => state?.you.contribute.length === n + 1);
        }
      }
    }, code);
    await startRoom(host.page);
    await screen.evaluate(async () => {
      for (const [index, client] of window.__screenSeed.entries()) {
        await window.__seedWait(client, state => state?.phase === "playing");
        for (const [slot, target] of client.state.you.targets.entries()) {
          client.ws.send(JSON.stringify({ type: "guess", targetId: target.id, lng: 116.3 + index * .002, lat: 39.9 + slot * .012 }));
          await window.__seedWait(client, state => state.you.guesses.length === slot + 1);
        }
        client.ws.send(JSON.stringify({ type: "submit" }));
        await window.__seedWait(client, state => state.you.submitted);
      }
    });
    await expect(screen.locator(".screen-page")).toHaveAttribute("data-phase", "reveal");
    await expect.poll(() => observed.current?.playerResults?.filter(row => row.submitted).length).toBe(30);
    await screen.getByRole("button", { name: "暂停轮播", exact: true }).click();
    const allRows = observed.current.playerResults;
    const pages = Math.ceil(allRows.length / 6);
    // Real time matters here: neither pointer nor keyboard focus leaves the
    // control after resume, so a lingering hover/focus pause cannot hide.
    await expect(screen.locator(".screen-pagination")).toContainText(`1 / ${pages} 页`);
    await screen.waitForTimeout(11000);
    await expect(screen.locator(".screen-pagination")).toContainText(`1 / ${pages} 页`);
    await screen.getByRole("button", { name: "继续轮播", exact: true }).click();
    await expect(screen.getByRole("button", { name: "暂停轮播", exact: true })).toBeFocused();
    await expect(screen.locator(".screen-pagination")).toContainText(`2 / ${pages} 页`, { timeout: 13000 });
    await screen.getByRole("button", { name: "暂停轮播", exact: true }).click();
    await screen.waitForTimeout(11000);
    await expect(screen.locator(".screen-pagination")).toContainText(`2 / ${pages} 页`);
    await screen.getByRole("button", { name: "上一页", exact: true }).click();
    const seen = new Set();
    for (let index = 0; index < pages; index++) {
      await expect(screen.locator(".screen-pagination")).toContainText(`${index + 1} / ${pages} 页`);
      const rows = allRows.slice(index * 6, index * 6 + 6);
      await expect(screen.locator(".screen-result-row")).toHaveCount(rows.length);
      for (const [offset, player] of rows.entries()) {
        const row = screen.locator(".screen-result-row").nth(offset);
        await expect(row.locator(".screen-result-player > strong")).toHaveText(player.name);
        await expect(row).toBeInViewport();
        if (player.submitted) {
          await expect(row.locator(".screen-result-places > div")).toHaveCount(3);
          for (const result of player.results) {
            await expect(row).toContainText(result.name);
            await expect(row).toContainText(distanceText(result.distance_m));
          }
          seen.add(player.playerId);
        }
      }
      await noHorizontalOverflow(screen);
      await capture(screen, `screen-30-players-page-${index + 1}-1920`);
      if (index + 1 < pages) await screen.getByRole("button", { name: "下一页", exact: true }).click();
    }
    expect(seen.size).toBe(30);
    await screen.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(screen.locator(".screen-pagination")).toContainText(`1 / ${pages} 页`);
    await screen.getByRole("button", { name: "上一页", exact: true }).click();
    await expect(screen.locator(".screen-pagination")).toContainText(`${pages} / ${pages} 页`);
  } finally {
    await screen.evaluate(() => window.__screenSeed?.forEach(client => client.ws.close())).catch(() => {});
    await Promise.all([host.context.close(), screenContext.close()]);
  }
});

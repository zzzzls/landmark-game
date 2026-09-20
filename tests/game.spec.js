import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PLAYTEST_BASE_URL || "http://localhost:5173";
const SHOTS = path.resolve("artifacts/screenshots");
const runtimeErrors = [];
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

function observeRoom(page) {
  // Observe actual server broadcasts; game actions below always use visible UI.
  const observed = { current: null };
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      try {
        const state = JSON.parse(String(payload));
        if (state.type === "state") observed.current = state;
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

async function createRoom(page, name = "测试房主") {
  await page.goto("/");
  await page
    .locator(".entry-tabs")
    .getByRole("button", { name: "创建房间", exact: true })
    .click();
  await page.getByLabel("你的昵称").fill(name);
  await page
    .locator("form")
    .getByRole("button", { name: "创建房间", exact: true })
    .click();
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{4}\/admin\?name=/);
  const code = new URL(page.url()).pathname.split("/")[2];
  await closeGuide(page);
  await expect(page.locator(".game-room")).toHaveAttribute(
    "data-phase",
    "lobby",
  );
  await mapReady(page);
  return code;
}

async function joinRoom(page, code, name) {
  await page.goto("/");
  await page.getByLabel("你的昵称").fill(name);
  await page.getByLabel("房间号", { exact: true }).fill(code);
  await page
    .locator("form")
    .getByRole("button", { name: "加入游戏", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/r/${code}\\?name=`));
  await closeGuide(page);
  await expect(page.locator(".game-room")).not.toHaveAttribute(
    "data-phase",
    "connecting",
  );
  await mapReady(page);
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

async function startRoom(page, hasObservers = true) {
  await page.getByRole("button", { name: /^开始游戏 ·/ }).click();
  if (hasObservers) {
    const dialog = page.getByRole("dialog", { name: "现在开始这局？" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "开始游戏", exact: true }).click();
  }
  await expect(page.locator(".game-room")).toHaveAttribute(
    "data-phase",
    "playing",
  );
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
          const pins = [...document.querySelectorAll(".mk-dot,.mk-label")];
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

test("two phone players complete a real-map game; host and screen stay synchronized", async ({
  browser,
}) => {
  const host = await mobile(browser);
  const first = await mobile(browser);
  const second = await mobile(browser, 430);
  const screenContext = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1920, height: 1080 },
  });
  const screen = await screenContext.newPage();
  watchErrors(screen);
  const firstState = observeRoom(first.page);
  const secondState = observeRoom(second.page);
  const screenState = observeRoom(screen);
  try {
    const code = await createRoom(host.page);
    await capture(host.page, "host-lobby-390");
    await joinRoom(first.page, code, "胡同探索员");
    await joinRoom(second.page, code, "方向感特别好的北京朋友");
    await screen.goto(`/r/${code}/screen`);
    await mapReady(screen);
    await expect.poll(() => screenState.current?.phase).toBe("lobby");
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
    await expect(first.page.locator(".game-room")).toHaveAttribute(
      "data-phase",
      "playing",
    );
    await expect(second.page.locator(".game-room")).toHaveAttribute(
      "data-phase",
      "playing",
    );
    await expect.poll(() => firstState.current?.you.targets?.length).toBe(3);
    expect(
      firstState.current.you.targets.every(
        (target) => !("lng" in target) && !("lat" in target),
      ),
    ).toBe(true);
    expect(screenState.current.truePins).toBeUndefined();
    await noHorizontalOverflow(first.page);
    await capture(first.page, "player-guessing-390");
    // Exercise a genuine map drag before pinning.
    const point = await mapPoint(first.page);
    const gesture = await first.context.newCDPSession(first.page);
    await gesture.send("Input.synthesizeScrollGesture", {
      x: Math.round(point.x),
      y: Math.round(point.y),
      xDistance: 45,
      yDistance: 18,
      gestureSourceType: "touch",
      preventFling: true,
    });
    await gesture.send("Input.synthesizePinchGesture", {
      x: Math.round(point.x),
      y: Math.round(point.y),
      scaleFactor: 1.25,
      gestureSourceType: "touch",
      relativeSpeed: 400,
    });
    await gesture.detach();
    // Allow the map's 80 ms post-drag tap guard to finish, as on a real phone.
    await first.page.waitForTimeout(150);
    await expect(
      first.page.getByRole("button", { name: "确认位置", exact: true }),
    ).not.toBeVisible();
    await answerAll(first.page);
    await first.page.getByRole("button", { name: /^第1题 / }).click();
    await first.page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(first.page.locator(".task-subtitle")).toContainText(
      "已确认 2/3",
    );
    await expect(
      first.page.getByRole("button", { name: "提交全部答案", exact: true }),
    ).not.toBeVisible();
    await confirmMapPin(first.page, 90);
    await first.page.getByRole("button", { name: /^第1题 / }).click();
    await confirmMapPin(first.page, 120); // Modify an existing answer.
    await expect(first.page.locator(".task-subtitle")).toContainText(
      "已确认 3/3",
    );
    await first.page.reload();
    await mapReady(first.page);
    await expect(first.page.locator(".task-subtitle")).toContainText(
      "已确认 3/3",
    );
    await first.page
      .getByRole("button", { name: "提交全部答案", exact: true })
      .click();
    await expect(
      first.page.getByRole("heading", { name: "答案已提交", exact: true }),
    ).toBeVisible();
    await expect.poll(() => screenState.current?.screenPins?.length).toBe(1);
    expect(screenState.current.phase).toBe("playing");
    expect(screenState.current.truePins).toBeUndefined();
    expect(screenState.current.leaderboard).toEqual([]);
    expect(firstState.current.you.results).toBeUndefined();
    expect(
      firstState.current.players.every((player) => player.totalError === null),
    ).toBe(true);
    await expect(screen.locator(".mk-true")).toHaveCount(0);
    await expect(screen.locator(".leaderboard")).toHaveCount(0);
    await capture(first.page, "player-submitted-390");
    await answerAll(second.page);
    await second.page
      .getByRole("button", { name: "提交全部答案", exact: true })
      .click();
    for (const page of [host.page, first.page, second.page]) {
      await expect(page.locator(".game-room")).toHaveAttribute(
        "data-phase",
        "reveal",
      );
    }
    await expect.poll(() => screenState.current?.phase).toBe("reveal");
    await expect(screen.locator(".leaderboard > li")).toHaveCount(2);
    await expect
      .poll(() => screen.locator(".mk-true").count())
      .toBeGreaterThan(0);
    expect(secondState.current.you.results).toHaveLength(3);
    expect(
      secondState.current.you.results.every((result) =>
        Number.isFinite(result.distance_m),
      ),
    ).toBe(true);
    const scores = screenState.current.leaderboard.map((row) => row.totalError);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    await pinsInsideVisibleMap(first.page, ".task-panel");
    await pinsInsideVisibleMap(second.page, ".task-panel");
    await pinsInsideVisibleMap(screen, ".screen-rail");
    await capture(first.page, "player-results-390");
    await capture(second.page, "player-results-430");
    await capture(screen, "screen-reveal-1920");
    for (const width of [360, 390, 430]) {
      await first.page.setViewportSize({ width, height: 844 });
      await noHorizontalOverflow(first.page);
      await pinsInsideVisibleMap(first.page, ".task-panel");
      await capture(first.page, `player-results-${width}`);
    }
    await first.page
      .getByRole("button", { name: /^查看.*的结果$/ })
      .first()
      .click();
    await expect(first.page.locator(".mk-true")).toHaveCount(1);
    await pinsInsideVisibleMap(first.page, ".task-panel");
    await capture(first.page, "player-result-detail-430");
    await first.page
      .getByRole("button", { name: "查看成绩与排名", exact: true })
      .click();
    await expect(first.page.locator(".mk-true")).toHaveCount(3);
    for (const width of [1440, 1920]) {
      await screen.setViewportSize({ width, height: 1080 });
      await noHorizontalOverflow(screen);
      await pinsInsideVisibleMap(screen, ".screen-rail");
      await capture(screen, `screen-reveal-${width}`);
    }
  } finally {
    await Promise.all([
      host.context.close(),
      first.context.close(),
      second.context.close(),
      screenContext.close(),
    ]);
  }
});

test("solo host gets truthful animated results and can safely create another room", async ({
  browser,
}) => {
  const host = await mobile(browser, 360);
  const state = observeRoom(host.page);
  const distanceText = (meters) =>
    meters < 1000
      ? `${Math.round(meters)} 米`
      : `${(meters / 1000).toFixed(2)} 公里`;
  const observeSettlement = () => {
    const evidence = { first: null, celebrationStarts: 0 };
    window.__settlementEvidence = evidence;
    let celebrating = false;
    new MutationObserver(() => {
      const panel = document.querySelector(".personal-results");
      if (panel && !evidence.first) {
        evidence.first = {
          summary: panel.querySelector(".result-summary")?.textContent,
          rank: panel.querySelector(".result-rank b")?.textContent,
          best: panel.querySelector(".result-best")?.textContent,
        };
      }
      const active = !!panel?.classList.contains("is-celebrating");
      if (active && !celebrating) evidence.celebrationStarts += 1;
      celebrating = active;
    }).observe(document, { childList: true, subtree: true, attributes: true });
  };
  let releaseCreate;
  try {
    const originalCode = await createRoom(host.page, "单人房主");
    const originalUrl = host.page.url();
    await host.page
      .getByRole("button", { name: "我的答题", exact: true })
      .click();
    await contribute(host.page, "天坛");
    await contribute(host.page, "故宫");
    await host.page
      .getByRole("button", { name: "房间管理", exact: true })
      .click();
    await startRoom(host.page, false);
    await expect(
      host.page.getByRole("button", { name: "我的答题", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => state.current?.you.targets?.length).toBe(3);
    expect(
      state.current.you.targets.every((target) =>
        target.id.startsWith("pool_"),
      ),
    ).toBe(true);
    expect(
      state.current.you.targets.some((target) =>
        ["天坛", "故宫"].includes(target.name),
      ),
    ).toBe(false);
    await noHorizontalOverflow(host.page);
    await capture(host.page, "solo-guessing-360");
    await answerAll(host.page);
    // Observe the first rendered values before clicking submit. Waiting for the
    // toast or screenshot would miss the short celebration and hide count-up bugs.
    await host.page.evaluate(observeSettlement);
    await host.page.addInitScript(observeSettlement);
    await host.page
      .getByRole("button", { name: "提交全部答案", exact: true })
      .click();
    await expect(host.page.locator(".game-room")).toHaveAttribute(
      "data-phase",
      "reveal",
    );
    const completed = structuredClone(state.current);
    const own = completed.players.find(
      (player) => player.id === completed.you.id,
    );
    const rank = completed.leaderboard.find(
      (row) => row.color === own.color,
    ).rank;
    const best = completed.you.results.reduce((nearest, result) =>
      result.distance_m < nearest.distance_m ? result : nearest,
    );
    const total = distanceText(own.totalError);
    await expect
      .poll(() =>
        host.page.evaluate(() => window.__settlementEvidence.celebrationStarts),
      )
      .toBe(1);
    const firstPaint = await host.page.evaluate(
      () => window.__settlementEvidence.first,
    );
    expect(firstPaint.summary).toContain(total);
    expect(firstPaint.rank).toBe(String(rank));
    expect(firstPaint.best).toContain(best.name);
    expect(firstPaint.best).toContain(distanceText(best.distance_m));
    await expect(host.page.locator(".result-summary")).toContainText(total);
    await expect(host.page.locator(".result-rank b")).toHaveText(String(rank));
    await expect(host.page.locator(".result-best")).toContainText(best.name);
    await expect(host.page.locator(".result-best")).toContainText(
      distanceText(best.distance_m),
    );
    await expect(host.page.locator(".leaderboard > li")).toHaveCount(1);
    await expect(host.page.locator(".personal-results")).not.toHaveClass(
      /is-celebrating/,
    );
    await pinsInsideVisibleMap(host.page, ".task-panel");
    await capture(host.page, "solo-results-360");
    await host.page
      .getByRole("button", { name: "房间管理", exact: true })
      .click();
    await host.page
      .getByRole("button", { name: "我的答题", exact: true })
      .click();
    await expect(host.page.locator(".personal-results")).not.toHaveClass(
      /is-celebrating/,
    );
    expect(
      await host.page.evaluate(
        () => window.__settlementEvidence.celebrationStarts,
      ),
    ).toBe(1);
    await host.page.reload();
    await mapReady(host.page);
    await host.page
      .getByRole("button", { name: "我的答题", exact: true })
      .click();
    await expect(host.page.locator(".result-summary")).toContainText(total);
    await expect(host.page.locator(".personal-results")).not.toHaveClass(
      /is-celebrating/,
    );
    expect(
      await host.page.evaluate(
        () => window.__settlementEvidence.celebrationStarts,
      ),
    ).toBe(0);

    await host.page.emulateMedia({ reducedMotion: "reduce" });
    const motion = await host.page
      .locator(".personal-results")
      .evaluate((panel) => {
        const all = [panel, ...panel.querySelectorAll("*")];
        return all.flatMap((element) =>
          [null, "::before", "::after"].map((pseudo) => {
            const style = getComputedStyle(element, pseudo);
            return {
              animation: style.animationDuration,
              transition: style.transitionDuration,
            };
          }),
        );
      });
    for (const style of motion) {
      // 0.01 ms is the accessible near-zero duration used by the global override.
      expect(
        style.animation
          .split(",")
          .every((value) => parseFloat(value) <= 0.00001),
      ).toBe(true);
      expect(
        style.transition
          .split(",")
          .every((value) => parseFloat(value) <= 0.00001),
      ).toBe(true);
    }
    await noHorizontalOverflow(host.page);
    await capture(host.page, "solo-results-reduced-motion-360");

    let createRequests = 0;
    let failCreate = true;
    const blockedCreate = new Promise((resolve) => {
      releaseCreate = resolve;
    });
    await host.page.route("**/api/rooms", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      createRequests += 1;
      if (failCreate) {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: '{"detail":"test unavailable"}',
        });
      }
      await blockedCreate;
      return route.continue(); // Successful room creation is always the real backend.
    });
    const again = host.page
      .locator(".task-footer")
      .getByRole("button", { name: "再开一局", exact: true });
    await again.click();
    await expect(host.page.locator(".toast")).toContainText(
      "新房间创建失败，请再试一次。",
    );
    await expect(again).toBeEnabled();
    await expect(host.page).toHaveURL(originalUrl);
    await expect(host.page.locator(".result-summary")).toContainText(total);
    expect(createRequests).toBe(1);
    failCreate = false;
    const buttonBox = await again.boundingBox();
    await again.click();
    await expect.poll(() => createRequests).toBe(2);
    // Repeated physical taps while the first POST is in flight must not create
    // extra rooms. The coordinate remains usable when the busy label changes.
    await host.page.touchscreen.tap(
      buttonBox.x + buttonBox.width / 2,
      buttonBox.y + buttonBox.height / 2,
    );
    await host.page.touchscreen.tap(
      buttonBox.x + buttonBox.width / 2,
      buttonBox.y + buttonBox.height / 2,
    );
    expect(createRequests).toBe(2);
    releaseCreate();
    await expect(host.page).not.toHaveURL(originalUrl);
    await expect(host.page).toHaveURL(/\/r\/[A-Z0-9]{4}\/admin\?name=/);
    const newUrl = new URL(host.page.url());
    expect(newUrl.pathname.split("/")[2]).not.toBe(originalCode);
    expect(newUrl.searchParams.get("name")).toBe("单人房主");
    await expect(host.page.locator(".game-room")).toHaveAttribute(
      "data-phase",
      "lobby",
    );
    await mapReady(host.page);
    await expect
      .poll(() => state.current?.room)
      .toBe(newUrl.pathname.split("/")[2]);
    expect(state.current.players).toHaveLength(1);
    expect(state.current.players[0].contributed).toBe(0);
    expect(state.current.you.targets || []).toEqual([]);
    expect(createRequests).toBe(2);
    await capture(host.page, "play-again-new-room-360");
    await host.page.goto(originalUrl);
    await mapReady(host.page);
    await expect(host.page.locator(".game-room")).toHaveAttribute(
      "data-phase",
      "reveal",
    );
    await host.page
      .getByRole("button", { name: "我的答题", exact: true })
      .click();
    await expect(host.page.locator(".result-summary")).toContainText(total);
    await expect(host.page.locator(".result-rank b")).toHaveText(String(rank));
    expect(state.current.you.results).toEqual(completed.you.results);
    await expect(host.page.locator(".personal-results")).not.toHaveClass(
      /is-celebrating/,
    );
    expect(
      await host.page.evaluate(
        () => window.__settlementEvidence.celebrationStarts,
      ),
    ).toBe(0);
  } finally {
    releaseCreate?.();
    await host.context.close();
  }
});

test("early reveal, late spectator and network reconnect preserve honest incomplete results", async ({
  browser,
}) => {
  const host = await mobile(browser);
  const player = await mobile(browser);
  const spectator = await mobile(browser, 360);
  const state = observeRoom(player.page);
  await player.page.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.__testRoomSockets = [];
    window.WebSocket = class extends NativeSocket {
      constructor(...args) {
        super(...args);
        if (String(args[0]).includes("/ws/"))
          window.__testRoomSockets.push(this);
      }
    };
  });
  try {
    const code = await createRoom(host.page, "主持人");
    await joinRoom(player.page, code, "未完成玩家");
    await contribute(player.page, "北海");
    await contribute(player.page, "颐和园");
    await startRoom(host.page);
    await confirmMapPin(player.page);
    await expect(player.page.locator(".task-subtitle")).toContainText(
      "已确认 1/3",
    );
    await player.context.setOffline(true);
    // Close the real transport during a network outage; do not synthesize state
    // or send game protocol messages. The app must reconnect by itself.
    await player.page.evaluate(() => window.__testRoomSockets.at(-1).close());
    await expect(player.page.locator(".connection-banner")).toContainText(
      "连接中断",
    );
    await expect(player.page.locator(".map-pane")).not.toHaveClass(/clickable/);
    await player.page.getByRole("button", { name: /^第1题 / }).click();
    await expect(
      player.page.getByRole("button", { name: "撤销", exact: true }),
    ).toBeDisabled();
    await player.context.setOffline(false);
    await expect(player.page.locator(".connection-banner")).toHaveCount(0);
    await mapReady(player.page);
    await expect(player.page.locator(".task-subtitle")).toContainText(
      "已确认 1/3",
    );
    await joinRoom(spectator.page, code, "迟到的朋友");
    await expect(
      spectator.page.getByRole("heading", { name: "本局旁观", exact: true }),
    ).toBeVisible();
    await expect(spectator.page.locator(".target-tabs")).toHaveCount(0);
    await noHorizontalOverflow(spectator.page);
    await capture(spectator.page, "late-spectator-360");
    await host.page
      .getByRole("button", { name: "提前揭晓", exact: true })
      .click();
    const dialog = host.page.getByRole("dialog", { name: "提前揭晓答案？" });
    await expect(dialog).toContainText("未提交者不计入排名");
    await dialog.getByRole("button", { name: "再等等", exact: true }).click();
    await expect(host.page.locator(".game-room")).toHaveAttribute(
      "data-phase",
      "playing",
    );
    await host.page
      .getByRole("button", { name: "提前揭晓", exact: true })
      .click();
    await dialog.getByRole("button", { name: "确认揭晓", exact: true }).click();
    await expect(player.page.locator(".game-room")).toHaveAttribute(
      "data-phase",
      "reveal",
    );
    await expandDetails(player.page);
    await expect(player.page.locator(".result-summary")).toContainText(
      "未计入排名",
    );
    await expect(player.page.locator(".leaderboard")).toHaveCount(0);
    expect(
      state.current.players.find((p) => p.name === "未完成玩家").totalError,
    ).toBeNull();
    expect(
      state.current.you.results.every((result) => result.distance_m === null),
    ).toBe(true);
    await capture(player.page, "early-reveal-incomplete-390");
  } finally {
    await Promise.all([
      host.context.close(),
      player.context.close(),
      spectator.context.close(),
    ]);
  }
});

test("entry validation, guide, reduced motion and phone/desktop layouts", async ({
  browser,
}) => {
  const phone = await mobile(browser);
  try {
    await phone.page.goto("/");
    await phone.page
      .getByRole("button", { name: "怎么玩", exact: true })
      .click();
    await expect(
      phone.page.getByRole("heading", { name: "先出两道题", exact: true }),
    ).toBeVisible();
    await phone.page
      .getByRole("button", { name: "下一步", exact: true })
      .click();
    await expect(
      phone.page.getByRole("heading", {
        name: "凭记忆，猜三个点",
        exact: true,
      }),
    ).toBeVisible();
    await phone.page
      .getByRole("button", { name: "下一步", exact: true })
      .click();
    await expect(
      phone.page.getByRole("heading", {
        name: "误差越小，排名越高",
        exact: true,
      }),
    ).toBeVisible();
    await phone.page
      .getByRole("button", { name: "开始探索", exact: true })
      .click();
    await phone.page.getByLabel("你的昵称").fill("入口测试");
    await phone.page.getByLabel("房间号", { exact: true }).fill("AB");
    await phone.page
      .locator("form")
      .getByRole("button", { name: "加入游戏", exact: true })
      .click();
    await expect(phone.page.getByRole("alert")).toContainText("四位房间号");
    await phone.page.getByLabel("房间号", { exact: true }).fill("0000");
    await phone.page
      .locator("form")
      .getByRole("button", { name: "加入游戏", exact: true })
      .click();
    await expect(phone.page.getByRole("alert")).toContainText(
      "房间不存在或已失效",
    );
    await phone.page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [360, 390, 430, 1440, 1920]) {
      await phone.page.setViewportSize({
        width,
        height: width < 500 ? 844 : 1080,
      });
      await noHorizontalOverflow(phone.page);
      await capture(phone.page, `home-${width}`);
    }
    await phone.page.setViewportSize({ width: 390, height: 500 });
    await phone.page.getByLabel("你的昵称").focus();
    await noHorizontalOverflow(phone.page);
    await expect(phone.page.getByLabel("你的昵称")).toBeInViewport();
    await capture(phone.page, "home-short-screen-390");
  } finally {
    await phone.context.close();
  }
});

test("real map recovers after missing configuration; search failures remain recoverable", async ({
  browser,
}) => {
  const host = await mobile(browser);
  try {
    await createRoom(host.page, "恢复测试");
    await host.page.route("**/api/map-config", (route) =>
      route.fulfill({ json: { jsKey: "" } }),
    );
    await host.page.reload();
    await expect(host.page.locator(".overlay-error")).toContainText(
      "尚未配置高德地图 Key",
    );
    await host.page.unroute("**/api/map-config");
    await host.page.locator(".overlay-retry").click();
    await mapReady(host.page);
    await host.page
      .getByRole("button", { name: "我的答题", exact: true })
      .click();
    await host.page.route("**/api/search?*", (route) => route.abort());
    await host.page.getByRole("searchbox").fill("天坛");
    await expect(host.page.getByRole("alert")).toContainText("搜索失败");
    await host.page.unroute("**/api/search?*");
    await host.page
      .getByRole("button", { name: "重新搜索", exact: true })
      .click();
    await expect(
      host.page
        .getByRole("list", { name: "搜索结果" })
        .getByRole("button")
        .first(),
    ).toBeVisible();
    await host.page.route("**/api/search?q=__empty__", (route) =>
      route.fulfill({ json: [] }),
    );
    await host.page.getByRole("searchbox").fill("__empty__");
    await expect(
      host.page.getByText("没有找到，试试更完整的地名。", { exact: true }),
    ).toBeVisible();
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
  } finally {
    await host.context.close();
  }
});

test("a participating host and a player with the same nickname see their own results", async ({
  browser,
}) => {
  const host = await mobile(browser);
  const player = await mobile(browser);
  const hostState = observeRoom(host.page);
  const playerState = observeRoom(player.page);
  try {
    const code = await createRoom(host.page, "同名朋友");
    await host.page
      .getByRole("button", { name: "我的答题", exact: true })
      .click();
    await joinRoom(player.page, code, "同名朋友");
    await contribute(host.page, "天坛");
    await contribute(host.page, "故宫");
    await contribute(player.page, "北海");
    await contribute(player.page, "颐和园");
    await host.page
      .getByRole("button", { name: "房间管理", exact: true })
      .click();
    await startRoom(host.page, false);
    await answerAll(host.page);
    await host.page
      .getByRole("button", { name: "提交全部答案", exact: true })
      .click();
    await answerAll(player.page);
    await player.page
      .getByRole("button", { name: "提交全部答案", exact: true })
      .click();
    for (const [page, observed] of [
      [host.page, hostState],
      [player.page, playerState],
    ]) {
      await expect(page.locator(".game-room")).toHaveAttribute(
        "data-phase",
        "reveal",
      );
      const own = observed.current.players.find(
        (p) => p.id === observed.current.you.id,
      );
      const entry = observed.current.leaderboard.find(
        (p) => p.color === own.color,
      );
      const distance =
        own.totalError < 1000
          ? `${Math.round(own.totalError)} 米`
          : `${(own.totalError / 1000).toFixed(2)} 公里`;
      await pinsInsideVisibleMap(page, ".task-panel");
      await expect(page.locator(".result-summary")).toContainText(distance);
      await expect(page.locator(".result-rank b")).toHaveText(
        String(entry.rank),
      );
      await expect(page.locator(".leaderboard .is-you")).toHaveCount(1);
      await expect(page.locator(".leaderboard .is-you strong")).toHaveText(
        distance,
      );
    }
  } finally {
    await Promise.all([host.context.close(), player.context.close()]);
  }
});

// Run against an isolated, fresh backend and a production build preview.
// Never retain request URLs, query strings, response bodies, traces or HARs.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = new URL(process.env.PLAYTEST_BASE_URL || "http://127.0.0.1:5188");
const report = {
  checkedAt: new Date().toISOString(),
  scope: "Three cold browser contexts: waiting pages and room lobby, real AMap",
  passed: false,
  phase: "launch",
  roles: {},
};
const isAmap = (host) => ["amap.com", "autonavi.com"].some(
  (domain) => host === domain || host.endsWith(`.${domain}`),
);
let browser;

async function openRole(role) {
  const context = await browser.newContext(role === "screen"
    ? { viewport: { width: 1920, height: 1080 }, serviceWorkers: "block" }
    : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const entry = report.roles[role] = {
    requests: {}, unexpected: [], failedLocal: [], pageErrors: 0,
    mapReady: false, tileResponses: 0, localFontLoaded: false,
  };
  function classify(request) {
    const url = new URL(request.url());
    if (["data:", "blob:", "about:"].includes(url.protocol)) return null;
    return {
      hostname: url.hostname,
      resourceType: request.resourceType(),
      local: url.origin === base.origin,
      amap: ["http:", "https:"].includes(url.protocol) && isAmap(url.hostname),
    };
  }
  context.on("request", (request) => {
    const item = classify(request);
    if (!item) return;
    const key = `${item.hostname} (${item.resourceType})`;
    entry.requests[key] = (entry.requests[key] || 0) + 1;
    if (!item.local && !item.amap) entry.unexpected.push(item);
  });
  context.on("response", (response) => {
    const item = classify(response.request());
    if (!item) return;
    if (item.amap && /^webrd0[1-4]\.is\.autonavi\.com$/.test(item.hostname) && response.ok()) {
      entry.tileResponses++;
    }
    if (item.local && response.status() >= 400) entry.failedLocal.push({ ...item, status: response.status() });
  });
  context.on("requestfailed", (request) => {
    const item = classify(request);
    if (item?.local) entry.failedLocal.push({ ...item, status: "requestfailed" });
  });
  page.on("pageerror", () => { entry.pageErrors++; });
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    const item = { hostname: url.hostname, resourceType: "websocket" };
    entry.requests[`${item.hostname} (websocket)`] = (entry.requests[`${item.hostname} (websocket)`] || 0) + 1;
    const sameOrigin = url.host === base.host && url.protocol === (base.protocol === "https:" ? "wss:" : "ws:");
    if (!sameOrigin) entry.unexpected.push(item);
  });
  await page.goto(new URL(role === "player" ? "/" : `/${role}`, base).href);
  await page.evaluate(() => document.fonts.ready);
  entry.localFontLoaded = await page.evaluate(() =>
    [...document.fonts].some((font) => font.family.includes("Beijing Pixel Digits") && font.status === "loaded"),
  );
  return { page, entry };
}

try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  report.phase = "verify-fresh-backend";
  const screen = await openRole("screen");
  // This assertion runs before creating or joining a room: never touch an active game.
  await expect(screen.page.getByRole("heading", { name: "等待管理员创建房间" })).toBeVisible();
  report.phase = "cold-player-and-admin";
  const player = await openRole("player");
  const admin = await openRole("admin");
  for (const [role, item] of [["player", player], ["admin", admin]]) {
    await item.page.getByLabel("你的昵称").fill(`资源检查${role}`);
    await item.page.getByRole("button", {
      name: role === "admin" ? "进入控制台" : "加入游戏", exact: true,
    }).click();
  }
  await expect(player.page.getByRole("heading", { name: "等待管理员创建房间" })).toBeVisible();
  report.phase = "create-room-through-ui";
  const create = admin.page.getByRole("button", { name: "创建房间", exact: true });
  await expect(create).toBeEnabled();
  await create.click();
  for (const [role, { page, entry }] of [["admin", admin], ["player", player], ["screen", screen]]) {
    report.phase = `real-map-${role}`;
    await expect(page.locator(role === "screen" ? ".screen-page" : ".game-room")).toHaveAttribute("data-phase", "lobby");
    if (role !== "screen") {
      await expect(page.getByRole("button", { name: "跳过指引", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "跳过指引", exact: true }).click();
    }
    await expect(page.locator(".amap-maps")).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(".map-pane > .overlay")).toHaveCount(0, { timeout: 45_000 });
    await expect(page.locator(".mk-reference")).toHaveCount(4);
    await expect.poll(() => entry.tileResponses, { timeout: 20_000 }).toBeGreaterThan(0);
    entry.mapReady = true;
    await page.waitForTimeout(1500);
  }
  report.phase = "assert-resource-policy";
  for (const entry of Object.values(report.roles)) {
    expect(entry.unexpected).toEqual([]);
    expect(entry.failedLocal).toEqual([]);
    expect(entry.pageErrors).toBe(0);
    expect(entry.localFontLoaded).toBe(true);
  }
  report.passed = true;
  report.phase = "complete";
} catch {
  // Playwright's raw errors can include credential-bearing URLs; report only the phase.
  process.exitCode = 1;
} finally {
  await mkdir("artifacts", { recursive: true });
  // Serialize before context teardown can add aborted-request events.
  const safeReport = JSON.stringify(report, null, 2);
  await browser?.close();
  await writeFile("artifacts/resource-audit.json", `${safeReport}\n`);
  console.log(safeReport);
}

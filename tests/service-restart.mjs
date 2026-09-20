// Isolated real-browser recovery check. Owns and stops only its child processes.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const base = 'http://127.0.0.1:5176';
const env = { ...process.env, FRONTEND_PORT: '5176', BACKEND_PORT: '18004' };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function free(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
}
function start(command, args) {
  const child = spawn(command, args, { env, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', () => {});
  return child;
}
async function stop(child) {
  if (!child || child.exitCode != null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  try { process.kill(-child.pid, 'SIGTERM'); } catch { return; }
  await Promise.race([exited, delay(5000)]);
  if (child.exitCode == null) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await exited; }
}
async function reachable(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await delay(100);
  }
  throw new Error(`Service unavailable: ${url}`);
}
const backend = () => start('uv', ['run', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '18004', '--log-level', 'warning']);
let api, vite, browser;
try {
  await free(5176); await free(18004);
  api = backend();
  vite = start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1']);
  await reachable(`${base}/api/health`);
  browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];
  const pages = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: { width: i === 2 ? 1920 : 390, height: i === 2 ? 1080 : 844 } });
    await context.addInitScript(() => localStorage.setItem('lg-guide-seen', '1'));
    const page = await context.newPage();
    page.on('pageerror', err => errors.push(err.message)); pages.push(page);
  }
  const [admin, player, screen] = pages;
  await admin.goto(`${base}/admin`);
  await admin.getByLabel('你的昵称').fill('重启验收管理员');
  await admin.getByRole('button', { name: '进入控制台' }).click();
  await admin.getByRole('button', { name: '创建房间' }).click();
  await expect(admin.locator('.room-code strong')).toBeVisible();
  await player.goto(base);
  await player.getByLabel('你的昵称').fill('重启验收玩家');
  await player.getByRole('button', { name: '加入游戏' }).click();
  await screen.goto(`${base}/screen`);
  await expect(player.locator('.game-room')).toHaveAttribute('data-phase', 'lobby');
  await expect(screen.locator('.screen-page')).toHaveAttribute('data-phase', 'lobby');
  await stop(api);
  await expect(player.getByRole('status').filter({ hasText: '正在恢复房间联动' })).toBeVisible({ timeout: 15000 });
  api = backend(); await reachable(`${base}/api/health`);
  await expect(player.getByRole('heading', { name: '等待管理员创建房间' })).toBeVisible({ timeout: 15000 });
  await expect(player.locator('.session-waiting')).toContainText('重启验收玩家');
  await expect(screen.getByRole('heading', { name: '等待管理员创建房间' })).toBeVisible();
  await admin.getByRole('button', { name: '创建房间' }).click();
  await expect(player.locator('.game-room')).toHaveAttribute('data-phase', 'lobby');
  await expect(screen.locator('.screen-page')).toHaveAttribute('data-phase', 'lobby');
  await expect(player.locator('.map-pane > .overlay')).toHaveCount(0, { timeout: 40000 });
  await expect(player.locator('.mk-reference')).toHaveCount(4);
  await expect(player.locator('.place-slots .filled')).toHaveCount(0);
  expect(errors).toEqual([]);
  await mkdir('artifacts/screenshots', { recursive: true });
  await player.screenshot({ path: 'artifacts/screenshots/service-restart-390.png' });
  const result = { status: 'passed', coverage: ['real_process_restart', 'players_and_screen_wait', 'nickname_preserved', 'new_room_auto_join', 'real_map_reloaded', 'references_restored'], errors };
  await writeFile('artifacts/service-restart.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await stop(vite); await stop(api);
}

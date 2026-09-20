import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const kids = [];

function run(cmd, args) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: isWin,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  kids.push(child);
  child.on("error", (err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
}

run(isWin ? "uv.exe" : "uv", [
  "run",
  "uvicorn",
  "backend.main:app",
  "--host",
  "0.0.0.0",
  "--port",
  process.env.BACKEND_PORT || "8000",
  "--reload",
]);
run(isWin ? "npx.cmd" : "npx", ["vite"]);

function shutdown() {
  for (const c of kids) {
    try {
      c.kill();
    } catch {}
  }
}
process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

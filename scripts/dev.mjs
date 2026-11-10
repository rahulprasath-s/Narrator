import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const python = existsSync(path.join(root, ".venv/bin/python"))
  ? path.join(root, ".venv/bin/python")
  : "python3";
const production = process.argv.includes("--production");
if (production && !existsSync(path.join(root, "frontend/dist/index.html"))) {
  console.error("Build the React app first with npm run build.");
  process.exit(1);
}
const processes = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill("SIGTERM");
  process.exitCode = code;
}
function launch(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  processes.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
}
launch(python, [
  "-m",
  "uvicorn",
  "api:app",
  "--host",
  "127.0.0.1",
  "--port",
  process.env.NARRATOR_API_PORT || "8000",
]);
if (!production)
  launch(process.execPath, [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--config",
    "frontend/vite.config.js",
  ]);
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

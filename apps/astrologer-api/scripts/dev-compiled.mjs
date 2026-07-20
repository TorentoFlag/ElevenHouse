import { spawn } from "node:child_process";

const buildCommand = ["pnpm", ["build"]];
const watchCommand = [
  "pnpm",
  ["exec", "tsc", "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"]
];
const apiCommand = ["node", ["--watch", "dist/main.js"]];

let shuttingDown = false;
const children = new Set();

const initialBuild = spawnChild(buildCommand[0], buildCommand[1], { exitOnFailure: true });

initialBuild.on("exit", (code, signal) => {
  children.delete(initialBuild);
  if (shuttingDown) return;

  if (code !== 0 || signal) {
    process.exit(code ?? 1);
    return;
  }

  spawnChild(watchCommand[0], watchCommand[1], { exitOnFailure: false });
  spawnChild(apiCommand[0], apiCommand[1], { exitOnFailure: true });
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function spawnChild(command, args, options) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: process.env
  });

  children.add(child);

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;

    if (options.exitOnFailure && (code !== 0 || signal)) {
      shutdown("SIGTERM");
      process.exit(code ?? 1);
    }
  });

  return child;
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    child.kill(signal);
  }
}

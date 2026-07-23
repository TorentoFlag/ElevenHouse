import { spawn } from "node:child_process";

export function createCompiledDevPlan({
  packageName,
  entrypoint = "dist/main.js",
  tsconfig = "tsconfig.build.json"
}) {
  return {
    initialBuild: {
      command: "pnpm",
      args: ["--filter", `${packageName}...`, "build"],
      exitOnFailure: true
    },
    watch: {
      command: "pnpm",
      args: ["exec", "tsc", "-p", tsconfig, "--watch", "--preserveWatchOutput"],
      exitOnFailure: false
    },
    runtime: {
      command: "node",
      args: ["--watch", entrypoint],
      exitOnFailure: true
    }
  };
}

export function runCompiledDev(input) {
  const plan = createCompiledDevPlan(input);
  const children = new Set();
  let shuttingDown = false;

  const initialBuild = spawnChild(plan.initialBuild);

  initialBuild.on("exit", (code, signal) => {
    children.delete(initialBuild);
    if (shuttingDown) return;

    if (code !== 0 || signal) {
      process.exit(code ?? 1);
      return;
    }

    spawnChild(plan.watch);
    spawnChild(plan.runtime);
  });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  function spawnChild(step) {
    const child = spawn(step.command, step.args, {
      stdio: "inherit",
      env: process.env
    });

    children.add(child);

    child.on("exit", (code, signal) => {
      children.delete(child);
      if (shuttingDown) return;

      if (step.exitOnFailure && (code !== 0 || signal)) {
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
}

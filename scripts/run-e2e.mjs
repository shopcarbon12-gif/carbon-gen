import { spawn } from "node:child_process";
import path from "node:path";

const cwd = process.cwd();
const port = process.env.E2E_PORT || "3010";
const baseUrl = `http://127.0.0.1:${port}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/login`, {
        redirect: "manual",
        signal: AbortSignal.timeout(2000),
      });
      if (res.status >= 200) return;
    } catch {
      // retry
    }
    await sleep(1000);
  }
  throw new Error(`Server did not become ready at ${baseUrl} within ${timeoutMs}ms`);
}

async function run() {
  console.log(`[e2e-runner] starting app on ${baseUrl}`);
  const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
  const server = spawn(process.execPath, [nextBin, "start", "-p", port], {
    cwd,
    stdio: "pipe",
    env: { ...process.env },
  });

  let serverOut = "";
  let serverErr = "";

  server.stdout.on("data", (chunk) => {
    serverOut += String(chunk);
  });
  server.stderr.on("data", (chunk) => {
    serverErr += String(chunk);
  });

  try {
    await waitForReady();
    console.log("[e2e-runner] app ready, running e2e checks");
    const test = spawn("node", ["scripts/e2e.mjs"], {
      cwd,
      stdio: "inherit",
      env: { ...process.env, E2E_BASE_URL: baseUrl },
    });

    const code = await new Promise((resolve) => test.on("exit", resolve));
    if (code !== 0) {
      throw new Error(`E2E script exited with code ${code}`);
    }
    console.log("[e2e-runner] e2e checks completed");
  } catch (err) {
    if (serverOut.trim()) {
      console.error("\n[server stdout]\n" + serverOut.slice(-4000));
    }
    if (serverErr.trim()) {
      console.error("\n[server stderr]\n" + serverErr.slice(-4000));
    }
    throw err;
  } finally {
    if (!server.killed) {
      server.kill("SIGTERM");
      await sleep(1200);
      if (!server.killed) server.kill("SIGKILL");
    }
  }
}

run().catch((err) => {
  console.error("run-e2e failed:", err?.message || err);
  process.exit(1);
});

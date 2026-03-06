import { spawn } from "node:child_process";

const port = String(process.env.PORT || "3000").trim() || "3000";
const host = String(process.env.HOSTNAME || "0.0.0.0").trim() || "0.0.0.0";

const child = spawn(process.execPath, [".next/standalone/server.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: port,
    HOSTNAME: host,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

import { Redis } from "@upstash/redis";
import fs from "node:fs";
import path from "node:path";

function readEnvFile() {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const text = fs.readFileSync(envPath, "utf8");
    const out = {};

    for (const line of text.split(/\r?\n/)) {
      const row = line.trim();
      if (!row || row.startsWith("#")) continue;
      const idx = row.indexOf("=");
      if (idx <= 0) continue;
      const key = row.slice(0, idx).trim();
      const value = row.slice(idx + 1).trim();
      out[key] = value;
    }

    return out;
  } catch {
    return {};
  }
}

const fileEnv = readEnvFile();

function required(name) {
  return (process.env[name] || fileEnv[name] || "").trim();
}

async function main() {
  const url = required("UPSTASH_REDIS_REST_URL");
  const token = required("UPSTASH_REDIS_REST_TOKEN");

  if (!url || !token) {
    console.error("UPSTASH CHECK FAILED");
    console.error("Missing env vars:");
    if (!url) console.error("- UPSTASH_REDIS_REST_URL");
    if (!token) console.error("- UPSTASH_REDIS_REST_TOKEN");
    process.exit(2);
  }

  const redis = new Redis({ url, token });
  const testKey = `carbon-gen:upstash:health:${Date.now()}`;

  try {
    const ping = await redis.ping();
    await redis.set(testKey, "ok", { ex: 30 });
    const value = await redis.get(testKey);
    await redis.del(testKey);

    if (ping !== "PONG") {
      throw new Error(`Unexpected ping response: ${String(ping)}`);
    }
    if (value !== "ok") {
      throw new Error(`Read/write test failed (value=${String(value)})`);
    }

    console.log("UPSTASH CHECK OK");
    console.log("Redis ping and read/write test succeeded.");
  } catch (err) {
    console.error("UPSTASH CHECK FAILED");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();

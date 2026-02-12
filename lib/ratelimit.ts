import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "@/lib/redis";

const redis = getRedis();

const loginRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(10, "15 m"),
      analytics: true,
      prefix: "carbon-gen:login",
    })
  : null;

export async function checkLoginRateLimit(key: string) {
  if (!loginRatelimit) {
    return {
      success: true,
      error: undefined,
    };
  }

  const result = await loginRatelimit.limit(key);
  return result;
}

const generateRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(30, "15 m"),
      analytics: true,
      prefix: "carbon-gen:generate",
    })
  : null;

export async function checkGenerateRateLimit(key: string) {
  if (!generateRatelimit) {
    return {
      success: true,
      error: undefined,
    };
  }

  const result = await generateRatelimit.limit(key);
  return result;
}

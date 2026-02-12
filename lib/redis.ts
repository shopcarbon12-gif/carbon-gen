import { Redis } from "@upstash/redis";

const redisUrl = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
const redisToken = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

export function getRedis() {
  if (!redisUrl || !redisToken) return null;
  return new Redis({ url: redisUrl, token: redisToken });
}

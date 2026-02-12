import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export async function GET() {
  const redis = getRedis();

  if (!redis) {
    return NextResponse.json(
      {
        ok: true,
        degraded: true,
        redis: {
          ok: false,
          error: "Upstash env vars missing (rate limiting disabled)",
        },
      },
      { status: 200 }
    );
  }

  try {
    const pong = await redis.ping();
    return NextResponse.json({
      ok: true,
      redis: { ok: pong === "PONG" },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        redis: { ok: false, error: err?.message ?? "Redis ping failed" },
      },
      { status: 500 }
    );
  }
}

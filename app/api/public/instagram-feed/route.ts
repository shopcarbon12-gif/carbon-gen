import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fetchInstagramBusinessMedia } from "@/lib/instagram-meta-graph";
import type { InstagramMediaItem } from "@/lib/instagram-feed/types";
import { readInstagramCredentials } from "@/lib/instagramConnectionRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public Instagram feed for the storefront.
 *
 * Every other Instagram route in this app requires a Carbon login, which is
 * correct for the studio but useless to shopcarbon.com — a shopper has no
 * session here. This is the one endpoint the storefront calls, so it is
 * deliberately unauthenticated and deliberately narrow: it returns post
 * images and permalinks and nothing else.
 *
 * It replaces Elfsight, whose widget stopped rendering the moment their
 * monthly view quota ran out. The failure modes that killed it are what this
 * route is built to avoid:
 *
 *   • Meta is called at most once per TTL, not once per shopper, so traffic
 *     volume can never exhaust anything.
 *   • If Graph fails, the last good response keeps being served for up to a
 *     day rather than the section going blank.
 *   • Nothing here can 500 at a shopper: on total failure it answers 200 with
 *     an empty list and the storefront simply hides the section.
 *
 * The access token never leaves the server, and Graph's error text is logged
 * rather than returned — it can name the account and the app, which is not
 * something to hand to anonymous callers.
 */

/** Serve from cache this long before asking Graph again. */
const FRESH_MS = 15 * 60 * 1000;

/** If Graph is failing, keep serving the last good payload up to this age. */
const STALE_MS = 24 * 60 * 60 * 1000;

const MAX_ITEMS = 24;
const DEFAULT_ITEMS = 12;

type Cached = { at: number; items: InstagramMediaItem[] };

/*
  Module scope: this app runs as a long-lived container, so the cache is shared
  by every request the instance serves. A cold start just means one Graph call.
*/
let cache: Cached | null = null;
let inflight: Promise<Cached | null> | null = null;

const ALLOWED_ORIGINS = new Set([
  "https://shopcarbon.com",
  "https://www.shopcarbon.com",
  "https://30e7d3.myshopify.com",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://shopcarbon.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
    /*
      Let the browser and any CDN in front of us absorb repeat views. The
      stale-while-revalidate window means a shopper never waits on Graph.
    */
    "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

/** One Graph call at a time per instance — a cold start under load must not stampede Meta. */
async function refresh(): Promise<Cached | null> {
  if (inflight) return inflight;

  inflight = (async () => {
    /* Env vars if pinned, otherwise the connection stored by the studio's
       Connect flow — so connecting never needs a redeploy. */
    const creds = await readInstagramCredentials();
    if (!creds) return null;

    const result = await fetchInstagramBusinessMedia({
      igUserId: creds.igUserId,
      accessToken: creds.accessToken,
      limit: MAX_ITEMS,
    });
    if (!result.ok) {
      // Logged, never returned: Graph errors name the account and the app.
      console.error("[instagram-feed] Graph error:", result.error);
      return null;
    }
    const next: Cached = { at: Date.now(), items: result.items };
    cache = next;
    return next;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const limitParam = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(Math.floor(limitParam), MAX_ITEMS)
    : DEFAULT_ITEMS;

  const now = Date.now();
  let payload = cache;

  if (!payload || now - payload.at > FRESH_MS) {
    const fresh = await refresh();
    if (fresh) payload = fresh;
  }

  /* Graph is down and the last good copy is too old to stand behind. */
  if (payload && now - payload.at > STALE_MS) payload = null;

  if (!payload) {
    return NextResponse.json(
      { ok: false, items: [], count: 0 },
      { status: 200, headers: cors },
    );
  }

  const items = payload.items.slice(0, limit).map((i) => ({
    id: i.id,
    type: i.mediaType,
    image: i.mediaUrl,
    permalink: i.permalink,
    caption: i.caption ? i.caption.slice(0, 300) : undefined,
    timestamp: i.timestamp,
  }));

  return NextResponse.json(
    {
      ok: true,
      items,
      count: items.length,
      cachedAt: new Date(payload.at).toISOString(),
      /* True when Graph is failing and this is a previously cached copy. */
      stale: now - payload.at > FRESH_MS,
    },
    { status: 200, headers: cors },
  );
}

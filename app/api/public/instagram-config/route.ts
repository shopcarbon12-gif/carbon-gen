import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  loadInstagramSectionConfig,
  type InstagramSectionStoredConfig,
} from "@/lib/instagramSectionConfigRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The storefront widget's settings, read live on every page load.
 *
 * Deliberately uncached. These values were previously baked into the widget
 * script, which is cached for five minutes — so pressing "Publish Changes" in
 * the studio did nothing visible for up to five minutes, and the studio did not
 * really control the live section. The payload is a few hundred bytes of text
 * and never calls Meta, so serving it fresh costs far less than a stale one
 * costs in confusion.
 *
 * The post images and profile still come from /api/public/instagram-feed, which
 * keeps its cache — that one does call Meta, and its quota is the thing worth
 * protecting.
 */

const ALLOWED_ORIGINS = [
  "https://shopcarbon.com",
  "https://www.shopcarbon.com",
  "https://shopcarbon.myshopify.com",
];

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    Vary: "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, must-revalidate",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));

  /* A settings read that fails must not blank the section: the widget falls back
     to its own written defaults, so an empty config still renders a correct row. */
  let config: InstagramSectionStoredConfig = {};
  try {
    config = (await loadInstagramSectionConfig("default")) || {};
  } catch (error) {
    console.error("[instagram-config] load failed:", error);
  }

  return new NextResponse(JSON.stringify({ ok: true, config }), { status: 200, headers: cors });
}

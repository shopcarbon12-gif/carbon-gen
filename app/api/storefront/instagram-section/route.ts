import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { canManageInstagramSection, readSession } from "@/lib/userAuth";
import {
  normalizeInstagramAtLabel,
  normalizeWebUrlForStorage,
} from "@/lib/instagram-hero-text-normalize";
import {
  INSTAGRAM_HERO_HEIGHT,
  INSTAGRAM_HERO_WIDTH,
  loadInstagramSectionConfig,
  upsertInstagramSectionConfig,
  type InstagramSectionStoredConfig,
} from "@/lib/instagramSectionConfigRepository";

export const runtime = "nodejs";
export const maxDuration = 30;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function parseScope(req: NextRequest) {
  try {
    const url = new URL(req.url);
    return (url.searchParams.get("scope") || "default").trim() || "default";
  } catch {
    return "default";
  }
}

function isAllowedUrl(raw: string) {
  const s = raw.trim();
  if (!s) return true;
  if (s.startsWith("https://")) return true;
  if (process.env.NODE_ENV !== "production" && s.startsWith("http://localhost")) return true;
  return false;
}

function numInRange(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, n));
}

function mergeInstagramConfig(
  prev: InstagramSectionStoredConfig,
  input: unknown
): InstagramSectionStoredConfig | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const next: InstagramSectionStoredConfig = { ...prev };

  const setStr = (key: keyof InstagramSectionStoredConfig, max = 500) => {
    if (!(key in o)) return;
    const v = o[key];
    if (typeof v !== "string") return;
    const t = v.trim().slice(0, max);
    if (!t) delete next[key];
    else (next as Record<string, unknown>)[key as string] = t;
  };

  setStr("heroImageUrl", 2000);
  setStr("heroAlt", 500);
  setStr("heroLinkText", 200);
  setStr("heroLinkHref", 2000);
  setStr("heroLinkColor", 64);
  setStr("profileAvatarUrl", 2000);
  setStr("profileBrandName", 200);
  setStr("profileHandle", 200);
  setStr("profilePostsCount", 64);
  setStr("profileFollowersCount", 64);
  setStr("profileFollowButtonLabel", 120);
  setStr("profileFollowButtonHref", 2000);

  const dPx = numInRange(o.heroLinkFontSizeDesktopPx, 8, 160);
  if (dPx !== undefined) next.heroLinkFontSizeDesktopPx = dPx;
  const mPx = numInRange(o.heroLinkFontSizeMobilePx, 8, 160);
  if (mPx !== undefined) next.heroLinkFontSizeMobilePx = mPx;
  const fw = numInRange(o.heroLinkFontWeight, 100, 900);
  if (fw !== undefined) next.heroLinkFontWeight = fw;

  if (typeof o.feedSliderArrowsEnabled === "boolean") {
    next.feedSliderArrowsEnabled = o.feedSliderArrowsEnabled;
  }
  if (typeof o.feedSliderDragEnabled === "boolean") {
    next.feedSliderDragEnabled = o.feedSliderDragEnabled;
  }
  const animSec = numInRange(o.feedSliderAnimationSec, 0.05, 3);
  if (animSec !== undefined) next.feedSliderAnimationSec = animSec;
  const autoSec = numInRange(o.feedSliderAutoplaySec, 0, 120);
  if (autoSec !== undefined) next.feedSliderAutoplaySec = autoSec;

  const lt = next.heroLinkText;
  if (typeof lt === "string" && lt) next.heroLinkText = normalizeInstagramAtLabel(lt);
  const ph = next.profileHandle;
  if (typeof ph === "string" && ph) next.profileHandle = normalizeInstagramAtLabel(ph);
  for (const k of ["heroLinkHref", "heroImageUrl", "profileFollowButtonHref"] as const) {
    const v = next[k];
    if (typeof v === "string" && v) (next as Record<string, string>)[k] = normalizeWebUrlForStorage(v);
  }

  const urlKeys: (keyof InstagramSectionStoredConfig)[] = [
    "heroImageUrl",
    "profileAvatarUrl",
    "heroLinkHref",
    "profileFollowButtonHref",
  ];
  for (const k of urlKeys) {
    const v = next[k];
    if (typeof v === "string" && v && !isAllowedUrl(v)) return null;
  }

  return next;
}

export async function GET(req: NextRequest) {
  try {
    const scope = parseScope(req);
    const config = await loadInstagramSectionConfig(scope);
    return NextResponse.json({
      ok: true,
      scope,
      heroWidth: INSTAGRAM_HERO_WIDTH,
      heroHeight: INSTAGRAM_HERO_HEIGHT,
      config,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isRequestAuthed(req)) return unauthorized();
  const session = readSession(req);
  if (!canManageInstagramSection(session)) {
    return NextResponse.json(
      { ok: false, error: "Forbidden: insufficient role to update Instagram section settings" },
      { status: 403 }
    );
  }
  try {
    const scope = parseScope(req);
    const prev = await loadInstagramSectionConfig(scope);
    const body = (await req.json()) as { config?: unknown };
    const merged = mergeInstagramConfig(prev, body?.config);
    if (merged === null) {
      return NextResponse.json(
        { ok: false, error: "Invalid config payload or URL (use https)" },
        { status: 400 }
      );
    }
    await upsertInstagramSectionConfig(merged, scope);
    return NextResponse.json({ ok: true, scope });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save settings";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

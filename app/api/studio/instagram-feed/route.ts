import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { fetchInstagramBusinessMedia, fetchInstagramProfile } from "@/lib/instagram-meta-graph";
import { readInstagramCredentials } from "@/lib/instagramConnectionRepository";
import type { InstagramMediaItem } from "@/lib/instagram-feed/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  /* Env vars if pinned, otherwise the connection stored by the Connect flow —
     the studio preview and the public storefront feed must agree on which
     account they are showing. */
  const creds = await readInstagramCredentials();
  const igUserId = creds?.igUserId ?? "";
  const accessToken = creds?.accessToken ?? "";

  if (!igUserId || !accessToken) {
    const missingEnv: string[] = [];
    if (!igUserId) missingEnv.push("META_INSTAGRAM_BUSINESS_ACCOUNT_ID");
    if (!accessToken) missingEnv.push("META_PAGE_ACCESS_TOKEN");
    return NextResponse.json({
      ok: true,
      source: "placeholder" as const,
      items: [] as InstagramMediaItem[],
      feedStatus: "credentials_incomplete" as const,
      missingEnv,
    });
  }

  /* Posts and profile in parallel: the header counts and the tiles come from one
     render, so fetching them in sequence would only delay the preview. The
     profile is optional — a failure there leaves the header on its written
     defaults rather than blanking a feed that loaded fine. */
  const [result, profileResult] = await Promise.all([
    fetchInstagramBusinessMedia({ igUserId, accessToken }),
    fetchInstagramProfile({ igUserId, accessToken }),
  ]);
  const profile = profileResult.ok ? profileResult.profile : null;

  if (!result.ok) {
    return NextResponse.json({
      ok: true,
      source: "placeholder" as const,
      items: [] as InstagramMediaItem[],
      feedStatus: "graph_error" as const,
      graphError: result.error,
    });
  }

  if (result.items.length === 0) {
    return NextResponse.json({
      ok: true,
      source: "placeholder" as const,
      items: [] as InstagramMediaItem[],
      feedStatus: "no_media" as const,
      mediaCount: 0,
    });
  }

  if (result.items.length < 2) {
    return NextResponse.json({
      ok: true,
      source: "placeholder" as const,
      items: result.items,
      feedStatus: "insufficient_media" as const,
      mediaCount: result.items.length,
    });
  }

  return NextResponse.json({
    ok: true,
    source: "meta" as const,
    items: result.items,
    profile,
    feedStatus: "ok" as const,
    mediaCount: result.items.length,
  });
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { canManageInstagramSection, readSession } from "@/lib/userAuth";
import {
  loadInstagramSectionConfig,
  upsertInstagramSectionConfig,
} from "@/lib/instagramSectionConfigRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Push the studio's Instagram settings to the live storefront section.
 *
 * The settings the studio saves and the settings the storefront reads are the
 * same record, so this does not copy anything — what it does is stamp the
 * publish and confirm, from the server, that the storefront will now serve
 * those exact values. Before this existed the "Publish Changes" button only
 * navigated to the settings page, so there was no moment at which anyone could
 * say the live section had been updated.
 *
 * Nothing needs cache-busting: /api/public/instagram-config is uncached, so the
 * next storefront page load already reads what this confirms.
 */
export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const session = readSession(req);
  if (!canManageInstagramSection(session)) {
    return NextResponse.json(
      { ok: false, error: "Forbidden: insufficient role to publish the Instagram section" },
      { status: 403 }
    );
  }

  try {
    const config = await loadInstagramSectionConfig("default");
    const publishedAt = new Date().toISOString();
    await upsertInstagramSectionConfig({ ...config, publishedAt }, "default");

    return NextResponse.json({
      ok: true,
      publishedAt,
      /* Echoed back so the studio can say what went live rather than just
         "done" — a publish that silently pushed the wrong hero is worse than
         one that failed loudly. */
      config: { ...config, publishedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

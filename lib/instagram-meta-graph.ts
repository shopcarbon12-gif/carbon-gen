import type { InstagramMediaItem, InstagramMediaType } from "@/lib/instagram-feed/types";

const GRAPH_VERSION = "v21.0";

type GraphMediaRow = Record<string, unknown>;

function mapMediaType(raw: string): InstagramMediaType {
  const u = raw.toUpperCase();
  if (u === "VIDEO") return "VIDEO";
  if (u === "CAROUSEL_ALBUM") return "CAROUSEL_ALBUM";
  return "IMAGE";
}

function firstCarouselImageUrl(row: GraphMediaRow): string {
  const children = row.children as { data?: GraphMediaRow[] } | undefined;
  const first = children?.data?.[0];
  if (!first) return "";
  const t = String(first.media_type || "").toUpperCase();
  if (t === "VIDEO") {
    return String(first.thumbnail_url || first.media_url || "");
  }
  return String(first.media_url || "");
}

function mapGraphMediaRow(row: GraphMediaRow): InstagramMediaItem | null {
  const id = String(row.id || "").trim();
  if (!id) return null;
  const mediaTypeRaw = String(row.media_type || "");
  const mediaType = mapMediaType(mediaTypeRaw);
  const permalink = String(row.permalink || "").trim();
  if (!permalink) return null;

  let mediaUrl = "";
  if (mediaType === "IMAGE") {
    mediaUrl = String(row.media_url || "").trim();
  } else if (mediaType === "VIDEO") {
    mediaUrl = String(row.thumbnail_url || row.media_url || "").trim();
  } else if (mediaType === "CAROUSEL_ALBUM") {
    mediaUrl = firstCarouselImageUrl(row);
  }

  if (!mediaUrl) return null;

  const caption = row.caption;
  return {
    id,
    mediaType,
    mediaUrl,
    permalink,
    caption: typeof caption === "string" ? caption : undefined,
  };
}

/**
 * Fetches recent media for an Instagram Business / Creator account via Graph API.
 * Requires a Page access token with Instagram permissions (see Meta app setup).
 */
export async function fetchInstagramBusinessMedia(params: {
  igUserId: string;
  accessToken: string;
  limit?: number;
}): Promise<{ ok: true; items: InstagramMediaItem[] } | { ok: false; error: string }> {
  const { igUserId, accessToken, limit = 50 } = params;
  const fields = [
    "id",
    "media_type",
    "media_url",
    "thumbnail_url",
    "permalink",
    "caption",
    "children{media_type,media_url,thumbnail_url}",
  ].join(",");

  const url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(igUserId)}/media`,
  );
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);

  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Graph request failed";
    return { ok: false, error: msg };
  }

  const json = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    error?: { message?: string };
  };

  if (!res.ok) {
    const msg =
      typeof json?.error?.message === "string" && json.error.message.trim()
        ? json.error.message.trim()
        : `Graph HTTP ${res.status}`;
    return { ok: false, error: msg };
  }

  const rows = Array.isArray(json.data) ? json.data : [];
  const items: InstagramMediaItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const mapped = mapGraphMediaRow(row as GraphMediaRow);
    if (mapped) items.push(mapped);
  }

  return { ok: true, items };
}

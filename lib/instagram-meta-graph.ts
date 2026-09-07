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
  const ts = row.timestamp;

  /* Carousel children in order. Only populated for albums, so its presence is
     what the grid uses to decide whether the multi-post badge belongs on a
     tile — a single-image post must not show it. */
  let children: string[] | undefined;
  if (mediaType === "CAROUSEL_ALBUM") {
    const kids = (row.children as { data?: GraphMediaRow[] } | undefined)?.data;
    if (Array.isArray(kids)) {
      const urls = kids
        .map((k) => {
          const t = String(k.media_type || "").toUpperCase();
          return String((t === "VIDEO" ? k.thumbnail_url || k.media_url : k.media_url) || "").trim();
        })
        .filter(Boolean);
      if (urls.length) children = urls;
    }
  }

  const like = Number(row.like_count);
  const comments = Number(row.comments_count);

  return {
    id,
    mediaType,
    mediaUrl,
    permalink,
    caption: typeof caption === "string" ? caption : undefined,
    timestamp: typeof ts === "string" && ts.trim() ? ts.trim() : undefined,
    children,
    likeCount: Number.isFinite(like) ? like : undefined,
    commentsCount: Number.isFinite(comments) ? comments : undefined,
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
    "timestamp",
    "like_count",
    "comments_count",
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


/**
 * Profile header data — the name, handle, avatar and the post/follower counts.
 *
 * These were hard-coded strings in lib/instagram-feed/config.ts ("322",
 * "3.8K") and had already drifted from reality (343 posts, 3.7K followers).
 * Reading them from Graph means the header cannot go stale again.
 */
export async function fetchInstagramProfile(params: {
  igUserId: string;
  accessToken: string;
}): Promise<
  | {
      ok: true;
      profile: {
        username: string;
        name: string;
        avatarUrl: string;
        followersCount: number;
        mediaCount: number;
      };
    }
  | { ok: false; error: string }
> {
  const url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(params.igUserId)}`,
  );
  url.searchParams.set("fields", "username,name,followers_count,media_count,profile_picture_url");
  url.searchParams.set("access_token", params.accessToken);

  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Graph request failed" };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string };
  };
  if (!res.ok) {
    const msg =
      typeof json?.error?.message === "string" && json.error.message.trim()
        ? json.error.message.trim()
        : `Graph HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return {
    ok: true,
    profile: {
      username: String(json.username || ""),
      name: String(json.name || ""),
      avatarUrl: String(json.profile_picture_url || ""),
      followersCount: Number(json.followers_count) || 0,
      mediaCount: Number(json.media_count) || 0,
    },
  };
}

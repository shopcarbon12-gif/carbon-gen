import { NextResponse } from "next/server";
import { loadAccessibilityWidgetConfig } from "@/lib/accessibilityConfigRepository";
import { normalizeAccessibilityLogoUrl } from "@/lib/accessibilityLogoUrl";

export const runtime = "nodejs";

const MAX_LOGO_BYTES = 2_500_000;

function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 8) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  const head = buf.subarray(0, Math.min(256, buf.length)).toString("utf8").trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  return null;
}

function parseScope(req: Request) {
  try {
    const u = new URL(req.url);
    return (u.searchParams.get("scope") || "default").trim() || "default";
  } catch {
    return "default";
  }
}

export async function GET(req: Request) {
  const scope = parseScope(req);
  let saved: Record<string, unknown>;
  try {
    saved = await loadAccessibilityWidgetConfig(scope);
  } catch {
    return NextResponse.json({ ok: false, error: "config_unavailable" }, { status: 500 });
  }
  const logoUrl = normalizeAccessibilityLogoUrl(saved.logoUrl, "");
  if (!logoUrl) {
    return NextResponse.json({ ok: false, error: "no_logo" }, { status: 404 });
  }

  if (/^data:image\//i.test(logoUrl)) {
    const comma = logoUrl.indexOf(",");
    if (comma < 0) {
      return NextResponse.json({ ok: false, error: "invalid_data_url" }, { status: 400 });
    }
    const meta = logoUrl.slice(0, comma);
    const data = logoUrl.slice(comma + 1);
    const isBase64 = /;base64$/i.test(meta);
    let buf: Buffer;
    try {
      buf = isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data), "utf8");
    } catch {
      return NextResponse.json({ ok: false, error: "decode_failed" }, { status: 400 });
    }
    if (buf.length > MAX_LOGO_BYTES) {
      return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
    }
    const mimeMatch = /^data:([^;,]+)/i.exec(logoUrl);
    const ct = mimeMatch?.[1]?.trim() || "image/png";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "content-type": ct,
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    });
  }

  let fetchUrl = logoUrl;
  try {
    const du = new URL(logoUrl);
    const h = du.hostname.toLowerCase();
    if (h === "www.dropbox.com" || h === "dropbox.com") {
      du.searchParams.set("dl", "1");
      fetchUrl = du.toString();
    }
  } catch {
    /* keep fetchUrl */
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(fetchUrl, {
      redirect: "follow",
      signal: ac.signal,
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "CarbonAccessibilityBrandImage/1.0",
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "upstream" }, { status: 502 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_LOGO_BYTES) {
      return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
    }
    const ct = res.headers.get("content-type") || "application/octet-stream";
    let baseCt = ct.split(";")[0].trim().toLowerCase();
    if (!baseCt.startsWith("image/")) {
      const sniffed = sniffImageMime(buf);
      if (!sniffed) {
        const probe = buf.subarray(0, 64).toString("utf8").toLowerCase();
        if (probe.includes("<!doctype") || probe.includes("<html")) {
          return NextResponse.json(
            { ok: false, error: "url_returns_html_use_direct_image_link" },
            { status: 415 }
          );
        }
        return NextResponse.json({ ok: false, error: "not_image" }, { status: 415 });
      }
      baseCt = sniffed;
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "content-type": baseCt,
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch {
    clearTimeout(timer);
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 502 });
  }
}

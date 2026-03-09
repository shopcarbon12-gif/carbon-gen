import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { downloadStorageObject, tryGetStoragePathFromUrl } from "@/lib/storageProvider";
import { createHmac, timingSafeEqual } from "crypto";

function getPublicPreviewSigningSecret() {
  return String(
    process.env.SHOPIFY_PUSH_SOURCE_SIGNING_SECRET ||
      process.env.AUTH_SECRET ||
      process.env.SESSION_SECRET ||
      ""
  ).trim();
}

function isValidSignedPublicAccess(path: string, expRaw: string, sigRaw: string) {
  const secret = getPublicPreviewSigningSecret();
  if (!secret || !path) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= 0) return false;
  const now = Math.floor(Date.now() / 1000);
  if (now > exp) return false;
  const expected = createHmac("sha256", secret).update(`${path}|${exp}`).digest("hex");
  const provided = String(sigRaw || "").trim().toLowerCase();
  if (!provided || provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

function isValidPublicPushStagingAccess(path: string, publicFlag: string) {
  const normalized = String(path || "").trim().replace(/^\/+/, "");
  if (!normalized) return false;
  if (String(publicFlag || "").trim() !== "1") return false;
  return normalized.startsWith("items/push-staging/");
}

export async function GET(req: NextRequest) {
  try {
    const isAuthedCookie =
      (process.env.NODE_ENV !== "production" &&
        (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true") ||
      req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    const path = String(req.nextUrl.searchParams.get("path") || "").trim();
    const rawUrl = String(req.nextUrl.searchParams.get("url") || "").trim();
    const resolvedPath = path || (rawUrl ? tryGetStoragePathFromUrl(rawUrl) : "");
    if (!resolvedPath) {
      return NextResponse.json({ error: "Missing or unsupported storage path/url." }, { status: 400 });
    }
    const isSignedPublic = isValidSignedPublicAccess(
      resolvedPath,
      String(req.nextUrl.searchParams.get("exp") || "").trim(),
      String(req.nextUrl.searchParams.get("sig") || "").trim()
    );
    const isPublicPushStaging = isValidPublicPushStagingAccess(
      resolvedPath,
      String(req.nextUrl.searchParams.get("public") || "").trim()
    );
    if (!isAuthedCookie && !isSignedPublic && !isPublicPushStaging) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { body, contentType } = await downloadStorageObject(resolvedPath);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control":
          isSignedPublic || isPublicPushStaging ? "public, max-age=300" : "private, max-age=300",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load storage preview." },
      { status: 500 }
    );
  }
}

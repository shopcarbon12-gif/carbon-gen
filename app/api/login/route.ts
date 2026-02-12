import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { checkLoginRateLimit } from "@/lib/ratelimit";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveStableUserId } from "@/lib/userScope";

function getClientKey(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip || "unknown";
}

function wantsHtml(req: NextRequest) {
  const accept = req.headers.get("accept") || "";
  return accept.includes("text/html");
}

function redirectToLogin(error?: string) {
  const location = error ? `/login?error=${encodeURIComponent(error)}` : "/login";
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location },
  });
}

function redirectToDashboard() {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/dashboard" },
  });
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function buildErrorResponse(req: NextRequest, message: string, status: number) {
  if (wantsHtml(req)) {
    return redirectToLogin(message);
  }
  return jsonError(message, status);
}

async function readPassword(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    return typeof body?.password === "string" ? body.password : "";
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await req.formData().catch(() => null);
    const raw = form?.get("password");
    return typeof raw === "string" ? raw : "";
  }

  return "";
}

export async function POST(req: NextRequest) {
  try {
    const key = getClientKey(req);
    const rate = await checkLoginRateLimit(key);
    if (!rate.success) {
      const reset = "reset" in rate ? rate.reset : undefined;
      if ("error" in rate && rate.error) {
        return buildErrorResponse(req, rate.error, 500);
      }

      if (wantsHtml(req)) {
        return redirectToLogin("Too many login attempts. Please try again later.");
      }

      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers:
            typeof reset === "number"
              ? { "RateLimit-Reset": String(reset) }
              : undefined,
        }
      );
    }

    const password = await readPassword(req);

    const plainPassword = (process.env.APP_PASSWORD || "").trim();
    const hashRaw = process.env.APP_PASSWORD_HASH ?? "";
    const hashPrevRaw = process.env.APP_PASSWORD_HASH_PREV ?? "";
    const hashesRaw = process.env.APP_PASSWORD_HASHES ?? "";

    const hash = hashRaw.trim();
    const hashPrev = hashPrevRaw.trim();
    const extraHashes = hashesRaw
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);

    const hashes = [hash, hashPrev, ...extraHashes].filter(Boolean);

    if (!password.trim()) {
      return buildErrorResponse(req, "Password required", 400);
    }

    if (!plainPassword && hashes.length === 0) {
      return buildErrorResponse(
        req,
        "Server misconfigured (missing APP_PASSWORD / APP_PASSWORD_HASH / APP_PASSWORD_HASH_PREV / APP_PASSWORD_HASHES)",
        500
      );
    }

    const pw = password.trim();
    let isValid = false;

    if (plainPassword && pw === plainPassword) {
      isValid = true;
    }

    for (const h of hashes) {
      if (isValid) break;
      if (await bcrypt.compare(pw, h)) {
        isValid = true;
        break;
      }
    }

    if (!isValid) {
      return buildErrorResponse(req, "Invalid password", 401);
    }

    const res = wantsHtml(req) ? redirectToDashboard() : NextResponse.json({ success: true });
    const existingUserId = req.cookies.get("carbon_gen_user_id")?.value?.trim() || "";
    const userId = resolveStableUserId();

    // One-time migration: if older sessions used random per-domain IDs,
    // move those model rows into the stable user id so local + hosted app stay synced.
    if (existingUserId && existingUserId !== userId) {
      try {
        const supabase = getSupabaseAdmin();
        await supabase
          .from("models")
          .update({ user_id: userId })
          .eq("user_id", existingUserId);
      } catch {
        // Non-blocking: login should not fail if migration fails.
      }
    }

    res.cookies.set({
      name: "carbon_gen_auth_v1",
      value: "true",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    res.cookies.set({
      name: "carbon_gen_user_id",
      value: userId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return buildErrorResponse(req, "Login failed", 500);
  }
}

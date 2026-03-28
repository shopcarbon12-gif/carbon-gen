import { NextResponse } from "next/server";

export const runtime = "nodejs";
import bcrypt from "bcryptjs";
import {
  isMetaReviewRole,
  META_REVIEW_LOGIN_USERNAME,
  normalizeUsername,
} from "@/lib/authRoleConstants";
import { runMetaReviewSeedIfConfigured } from "@/lib/runMetaReviewSeedIfConfigured";
import { authenticateUser, getUserByUsername } from "@/lib/userAuth";

const DEFAULT_SESSION_USER_ID = "00000000-0000-0000-0000-000000000001";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function readHashCandidates() {
  const direct = [
    normalizeText(process.env.APP_PASSWORD_HASH),
    normalizeText(process.env.APP_ADMIN_PASSWORD_HASH),
    normalizeText(process.env.APP_PASSWORD_HASH_PREV),
  ].filter(Boolean);

  const extra = normalizeText(process.env.APP_PASSWORD_HASHES)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  return [...direct, ...extra];
}

function readPlainPasswordCandidates() {
  return [
    normalizeText(process.env.APP_PASSWORD),
    normalizeText(process.env.APP_ADMIN_PASSWORD),
  ].filter(Boolean);
}

function setSessionCookies(
  req: Request,
  res: NextResponse,
  user: { id: string; username: string; role: string }
) {
  const username = normalizeUsername(user.username);
  const role = String(user.role || "user").trim().toLowerCase();

  const proto = req.headers.get("x-forwarded-proto") || req.headers.get("x-forwarded-protocol") || "";
  const isSecure =
    req.url.startsWith("https://") ||
    proto.toLowerCase().includes("https");

  res.cookies.set({
    name: "carbon_gen_auth_v1",
    value: "true",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  res.cookies.set({
    name: "carbon_gen_username",
    value: username || "admin",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  res.cookies.set({
    name: "carbon_gen_user_role",
    value: role || "user",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  res.cookies.set({
    name: "carbon_gen_user_id",
    value: String(user.id || DEFAULT_SESSION_USER_ID),
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

/** Browsers open URLs with GET; login uses POST from /login. Redirect so bookmarks don’t show 405. */
export async function GET(req: Request) {
  const incoming = new URL(req.url);
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.trim() ||
    incoming.host;
  let proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto !== "http" && proto !== "https") {
    proto = incoming.protocol === "https:" ? "https" : "http";
  }
  if (!host) {
    const u = new URL(req.url);
    u.pathname = "/login";
    u.search = "";
    u.hash = "";
    return NextResponse.redirect(u);
  }
  const login = new URL("/login", `${proto}://${host}`);
  return NextResponse.redirect(login);
}

export async function POST(req: Request) {
  try {
    await runMetaReviewSeedIfConfigured();
    const body = await req.json().catch(() => ({}));
    const username = normalizeUsername(String(body?.username || ""));
    const password = body?.password;

    if (!username) {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const adminUsername =
      normalizeUsername(String(process.env.APP_ADMIN_USERNAME || "admin")) || "admin";
    const adminAliases = new Set([adminUsername, "admin", "eliorp1"]);

    let appUser: Awaited<ReturnType<typeof authenticateUser>> = null;
    try {
      appUser = await authenticateUser(username, password);
    } catch (e: any) {
      console.warn("DB Auth unavailable/failed, falling back:", e?.message);
      if (!adminAliases.has(username)) {
        return NextResponse.json(
          {
            error: "Sign-in database is unavailable.",
            hint: "Check COOLIFY_DATABASE_URL or DATABASE_URL on this server. Table-backed accounts cannot sign in until Postgres is reachable.",
            code: "auth_db_unavailable",
          },
          { status: 503 }
        );
      }
    }

    if (appUser) {
      const payload = isMetaReviewRole(appUser.role)
        ? { success: true as const, next: "/studio/instagram-widget" as const }
        : { success: true as const };
      const res = NextResponse.json(payload);
      setSessionCookies(req, res, {
        id: appUser.id,
        username: appUser.username,
        role: appUser.role,
      });
      return res;
    }

    if (username === META_REVIEW_LOGIN_USERNAME) {
      try {
        const row = await getUserByUsername(username);
        if (!row) {
          return NextResponse.json(
            {
              error: "Invalid username or password.",
              hint: "This Meta review account is not in this server’s database. On Coolify, open a shell on the app container and run: npm run seed:meta-review-user -- shopcarbon",
              code: "meta_review_not_provisioned",
            },
            { status: 401 }
          );
        }
      } catch {
        /* wrong password or other; fall through */
      }
    }

    if (!adminAliases.has(username)) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const hashCandidates = readHashCandidates();
    const plainCandidates = readPlainPasswordCandidates();
    if (hashCandidates.length === 0 && plainCandidates.length === 0) {
      return NextResponse.json(
        {
          error:
            "Server misconfigured (missing APP_PASSWORD_HASH/APP_ADMIN_PASSWORD_HASH/APP_PASSWORD/APP_ADMIN_PASSWORD).",
        },
        { status: 500 }
      );
    }

    let isValid = false;
    for (const hash of hashCandidates) {
      if (!hash || hash.length < 50) continue;
      if (await bcrypt.compare(password, hash)) {
        isValid = true;
        break;
      }
    }
    if (!isValid) {
      isValid = plainCandidates.some((plain) => password === plain);
    }

    if (!isValid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const res = NextResponse.json({ success: true });
    setSessionCookies(req, res, {
      id: DEFAULT_SESSION_USER_ID,
      username: adminUsername,
      role: "admin",
    });
    return res;
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

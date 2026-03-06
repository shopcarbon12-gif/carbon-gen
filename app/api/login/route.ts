import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authenticateUser, normalizeUsername } from "@/lib/userAuth";

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

export async function POST(req: Request) {
  try {
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

    // Preferred mode: table-backed username + password auth.
    try {
      const appUser = await authenticateUser(username, password);
      if (appUser) {
        const res = NextResponse.json({ success: true });
        setSessionCookies(req, res, {
          id: appUser.id,
          username: appUser.username,
          role: appUser.role,
        });
        return res;
      }
    } catch (e: any) {
      console.warn("DB Auth unavailable/failed, falling back:", e?.message);
      // Suppress error so we can proceed to the fallback mode
    }

    // Controlled fallback mode: admin username + master password.
    const adminAliases = new Set([adminUsername, "admin", "eliorp1"]);
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

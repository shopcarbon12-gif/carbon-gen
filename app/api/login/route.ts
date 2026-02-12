import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authenticateUser, normalizeUsername } from "@/lib/userAuth";

const DEFAULT_SESSION_USER_ID = "00000000-0000-0000-0000-000000000001";

function setSessionCookies(
  res: NextResponse,
  user: { id: string; username: string; role: string }
) {
  const username = normalizeUsername(user.username);
  const role = String(user.role || "user").trim().toLowerCase();

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
    name: "carbon_gen_username",
    value: username || "admin",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  res.cookies.set({
    name: "carbon_gen_user_role",
    value: role || "user",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  res.cookies.set({
    name: "carbon_gen_user_id",
    value: String(user.id || DEFAULT_SESSION_USER_ID),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
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
        setSessionCookies(res, {
          id: appUser.id,
          username: appUser.username,
          role: appUser.role,
        });
        return res;
      }
    } catch (e: any) {
      const message = String(e?.message || "").toLowerCase();
      const missingUsersTable =
        message.includes("app_users") && message.includes("does not exist");
      if (!missingUsersTable) {
        throw e;
      }
    }

    // Controlled fallback mode: admin username + master password.
    if (username !== adminUsername) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const hash = process.env.APP_PASSWORD_HASH;
    const plainPassword = process.env.APP_PASSWORD;

    if (!hash && !plainPassword) {
      return NextResponse.json(
        { error: "Server misconfigured (missing APP_PASSWORD_HASH/APP_PASSWORD)" },
        { status: 500 }
      );
    }

    let isValid = false;
    if (hash && hash.length >= 50) {
      isValid = await bcrypt.compare(password, hash);
    } else if (plainPassword) {
      isValid = password === plainPassword;
    } else {
      return NextResponse.json(
        {
          error:
            "APP_PASSWORD_HASH looks truncated. In .env.local, escape $ like \\$ and restart dev server.",
        },
        { status: 500 }
      );
    }

    if (!isValid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const res = NextResponse.json({ success: true });
    setSessionCookies(res, {
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

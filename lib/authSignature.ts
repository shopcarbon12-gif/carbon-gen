/**
 * HMAC-signed session binding for the Carbon-gen admin cookies.
 *
 * The legacy auth cookies (`carbon_gen_auth_v1`, `_username`, `_user_role`,
 * `_user_id`) are plaintext constants, so anyone could forge them — including
 * `carbon_gen_user_role=superadmin`. This module adds a `carbon_gen_sig`
 * cookie that HMAC-signs (username|role|uid|issuedAt) with a server secret.
 *
 * Rollout is gated by CARBON_GEN_REQUIRE_SIGNED_SESSION so it can ship as a
 * no-op first and be switched on once every live session has re-logged in.
 *
 * Uses Web Crypto + btoa only, so the same code runs in the Edge middleware
 * (proxy.ts) and in Node route handlers.
 */

export const SIG_COOKIE = "carbon_gen_sig";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function signedSessionRequired(): boolean {
  return (process.env.CARBON_GEN_REQUIRE_SIGNED_SESSION || "").trim().toLowerCase() === "true";
}

function getSecret(): string {
  return (process.env.CARBON_GEN_AUTH_SECRET || "").trim();
}

function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return toB64Url(new Uint8Array(sig));
}

/** Constant-time string compare (equal-length hex/b64url strings). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Build the `carbon_gen_sig` value for a freshly authenticated session. */
export async function makeSessionSignature(
  username: string,
  role: string,
  uid: string,
): Promise<string> {
  const iat = String(Date.now());
  const mac = await hmac(getSecret(), `${username}|${role}|${uid}|${iat}`);
  return `${iat}.${mac}`;
}

type CookieReader = { get(name: string): { value: string } | undefined };

/**
 * True when the request carries a `carbon_gen_sig` that validly binds the
 * current username/role/uid cookies and has not expired. Returns false when no
 * secret is configured, so a misconfigured deploy fails closed under the flag.
 */
export async function hasValidSessionSignature(cookies: CookieReader): Promise<boolean> {
  const secret = getSecret();
  if (!secret) return false;
  const raw = cookies.get(SIG_COOKIE)?.value || "";
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return false;
  const iat = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const iatNum = Number(iat);
  if (!Number.isFinite(iatNum) || Date.now() - iatNum > MAX_AGE_MS) return false;
  const username = cookies.get("carbon_gen_username")?.value || "";
  const role = cookies.get("carbon_gen_user_role")?.value || "";
  const uid = cookies.get("carbon_gen_user_id")?.value || "";
  const expected = await hmac(secret, `${username}|${role}|${uid}|${iat}`);
  return safeEqual(expected, mac);
}

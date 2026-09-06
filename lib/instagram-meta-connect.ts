/**
 * Shared bits of the Meta connect flow, used by both the start route and the
 * OAuth callback so the redirect URI they send can never drift apart — Meta
 * matches it exactly against the registered value and rejects the exchange on
 * any difference.
 */

export const META_OAUTH_STATE_COOKIE = "carbon_meta_oauth_state";

/** Must equal the URI registered in Meta → Facebook Login → Settings. */
export function metaRedirectUri(origin: string): string {
  return new URL("/api/instagram/meta/callback", origin).toString();
}

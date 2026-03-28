/**
 * Runs once per Node.js server process (see Next.js instrumentation).
 *
 * Production (NODE_ENV=production): set only META_REVIEW_SEED_PASSWORD (≥8 chars) on Coolify.
 * The server upserts meta-review@shopcarbon.com into the same Postgres the app uses.
 *
 * Local dev: also set META_REVIEW_AUTO_PROVISION=true or we skip (avoids accidental DB writes).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const pw = String(process.env.META_REVIEW_SEED_PASSWORD || "").trim();
  if (pw.length < 8) return;

  const isProd = process.env.NODE_ENV === "production";
  const explicit = ["true", "1"].includes(
    String(process.env.META_REVIEW_AUTO_PROVISION || "").trim().toLowerCase()
  );
  if (!isProd && !explicit) return;

  try {
    const { ensureMetaReviewUser } = await import("@/lib/ensureMetaReviewUser");
    const result = await ensureMetaReviewUser(pw);
    console.info(
      `[carbon] Meta review dashboard user: ${result.action} (${isProd ? "production META_REVIEW_SEED_PASSWORD" : "META_REVIEW_AUTO_PROVISION"})`
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[carbon] Meta review auto-provision failed:", msg);
  }
}

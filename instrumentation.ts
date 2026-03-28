/**
 * Runs once per Node.js server process (see Next.js instrumentation).
 * Set META_REVIEW_AUTO_PROVISION=true and META_REVIEW_SEED_PASSWORD on Coolify so
 * meta-review@shopcarbon.com exists in the same Postgres the app uses — no local seed mismatch.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const flag = String(process.env.META_REVIEW_AUTO_PROVISION || "").trim().toLowerCase();
  if (flag !== "true" && flag !== "1") return;

  const pw = String(process.env.META_REVIEW_SEED_PASSWORD || "").trim();
  if (pw.length < 8) {
    console.warn(
      "[carbon] META_REVIEW_AUTO_PROVISION is set but META_REVIEW_SEED_PASSWORD is missing or shorter than 8 chars; skipping meta-review user."
    );
    return;
  }

  try {
    const { ensureMetaReviewUser } = await import("@/lib/ensureMetaReviewUser");
    const result = await ensureMetaReviewUser(pw);
    console.info(`[carbon] Meta review dashboard user: ${result.action} (META_REVIEW_AUTO_PROVISION)`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[carbon] Meta review auto-provision failed:", msg);
  }
}

import "server-only";

const GLOBAL_KEY = "__carbonMetaReviewSeedRan";

/** Same plain password Meta reviewers use in submission notes (not a secret). */
const BUILTIN_META_REVIEW_PASSWORD = "shopcarbon";

/**
 * Upserts meta-review@shopcarbon.com before credential check.
 * - Production: always runs (password from META_REVIEW_SEED_PASSWORD if ≥8 chars, else builtin reviewer password unless META_REVIEW_DISABLE_BUILTIN_SEED).
 * - Non-production: only if META_REVIEW_AUTO_PROVISION is true/1 (uses env password or builtin when env empty).
 *
 * globalThis: one bcrypt+upsert per process; on failure flag clears so the next login can retry.
 */
export async function runMetaReviewSeedIfConfigured(): Promise<void> {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: boolean };
  if (g[GLOBAL_KEY]) return;

  const isProd = process.env.NODE_ENV === "production";
  const explicit = ["true", "1"].includes(
    String(process.env.META_REVIEW_AUTO_PROVISION || "").trim().toLowerCase()
  );
  if (!isProd && !explicit) return;

  const disableBuiltin = ["true", "1"].includes(
    String(process.env.META_REVIEW_DISABLE_BUILTIN_SEED || "").trim().toLowerCase()
  );

  let pw = String(process.env.META_REVIEW_SEED_PASSWORD || "").trim();
  if (pw.length < 8 && !disableBuiltin) {
    pw = BUILTIN_META_REVIEW_PASSWORD;
  }
  if (pw.length < 8) return;

  const source =
    String(process.env.META_REVIEW_SEED_PASSWORD || "").trim().length >= 8
      ? "META_REVIEW_SEED_PASSWORD"
      : "builtin_meta_review_password";

  g[GLOBAL_KEY] = true;
  try {
    const { ensureMetaReviewUser } = await import("@/lib/ensureMetaReviewUser");
    const result = await ensureMetaReviewUser(pw);
    console.info(`[carbon] Meta review user: ${result.action} (${source}; prod=${isProd})`);
  } catch (e: unknown) {
    g[GLOBAL_KEY] = false;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[carbon] Meta review seed failed:", msg);
  }
}

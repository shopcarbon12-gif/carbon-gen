const GLOBAL_KEY = "__carbonMetaReviewSeedRan";

/**
 * Upserts meta-review@shopcarbon.com when META_REVIEW_SEED_PASSWORD is set.
 * - Production: runs if NODE_ENV === "production"
 * - Non-production: only if META_REVIEW_AUTO_PROVISION is true/1
 *
 * Uses globalThis so we only bcrypt+write once per successful run; on failure the flag clears
 * so the next login can retry (Coolify / standalone may not run instrumentation.ts).
 */
export async function runMetaReviewSeedIfConfigured(): Promise<void> {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: boolean };
  if (g[GLOBAL_KEY]) return;

  const pw = String(process.env.META_REVIEW_SEED_PASSWORD || "").trim();
  if (pw.length < 8) return;

  const isProd = process.env.NODE_ENV === "production";
  const explicit = ["true", "1"].includes(
    String(process.env.META_REVIEW_AUTO_PROVISION || "").trim().toLowerCase()
  );
  if (!isProd && !explicit) return;

  g[GLOBAL_KEY] = true;
  try {
    const { ensureMetaReviewUser } = await import("@/lib/ensureMetaReviewUser");
    const result = await ensureMetaReviewUser(pw);
    console.info(
      `[carbon] Meta review user: ${result.action} (META_REVIEW_SEED_PASSWORD; prod=${isProd})`
    );
  } catch (e: unknown) {
    g[GLOBAL_KEY] = false;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[carbon] Meta review seed failed:", msg);
  }
}

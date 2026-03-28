/**
 * Runs once per Node.js process when Next loads instrumentation (may not run in all Docker/standalone setups).
 * Login POST also calls runMetaReviewSeedIfConfigured() so provisioning still happens.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runMetaReviewSeedIfConfigured } = await import("@/lib/runMetaReviewSeedIfConfigured");
  await runMetaReviewSeedIfConfigured();
}

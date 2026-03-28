/**
 * Intentionally empty: do not import DB/pg from instrumentation.
 * Next.js compiles `instrumentation` with a webpack graph that cannot resolve Node builtins (`fs`),
 * which breaks `pg` / `pg-connection-string` and surfaces as 500 + "Can't resolve 'fs'" in dev.
 *
 * Meta-review user seeding still runs from `app/api/login/route.ts` via `runMetaReviewSeedIfConfigured()`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
}

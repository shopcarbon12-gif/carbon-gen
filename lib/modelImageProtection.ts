import { listAllModelsAsc } from "@/lib/modelsRepository";
import { tryGetStoragePathFromUrl } from "@/lib/storageProvider";

/**
 * Storage object paths (R2 object keys) that belong to SAVED models.
 *
 * Saved-model reference photos live under the `models/<id>/...` prefix, which is
 * the same prefix the daily cleanup and the manual "empty storage" action sweep.
 * Any bulk delete over `models/` MUST exclude these paths, or saved models lose
 * their photos. Callers should resolve this set BEFORE deleting and, if it throws,
 * abort the sweep (fail safe — never wipe saved models).
 */
export async function getProtectedModelStoragePaths(): Promise<Set<string>> {
  const protectedPaths = new Set<string>();
  const models = await listAllModelsAsc();
  for (const model of models) {
    for (const url of model.ref_image_urls || []) {
      const path = tryGetStoragePathFromUrl(String(url || ""));
      if (path) protectedPaths.add(path);
    }
  }
  return protectedPaths;
}

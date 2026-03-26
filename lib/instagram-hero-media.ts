/**
 * Hero slot uses `heroImageUrl` for both images and videos; detect video by URL path/extension.
 */
export function isHeroVideoUrl(url: string): boolean {
  const raw = String(url || "").trim();
  if (!raw) return false;
  try {
    const pathPart = raw.split("?")[0].toLowerCase();
    return /\.(mp4|webm|mov|m4v|ogv)$/i.test(pathPart);
  } catch {
    return false;
  }
}

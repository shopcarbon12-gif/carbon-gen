import { WORKSPACE_PAGE_CATALOG, pagePermissionKeyFor } from "@/lib/workspacePageCatalog";

export type WorkspaceMenuAccessGroup = {
  id: string;
  /** Label shown in the workspace menu (Carbon shell). */
  menuLabel: string;
  /** Primary route(s) for admins to recognize the page. */
  pathHint: string;
  /**
   * Capability keys from `PERMISSION_OPTIONS` that define access to this area.
   * Empty means access is not expressed through this matrix (see `ungatedNote`).
   */
  permissionKeys: readonly string[];
  /** Shown when `permissionKeys` is empty. */
  ungatedNote?: string;
};

/**
 * Role matrix rows are generated from the shared page catalog so future pages
 * appear automatically after being added to `WORKSPACE_PAGE_CATALOG`.
 */
export const WORKSPACE_MENU_ACCESS_GROUPS: WorkspaceMenuAccessGroup[] = WORKSPACE_PAGE_CATALOG.map(
  (page) => ({
    id: page.id.replace(/_/g, "-"),
    menuLabel: page.menuLabel,
    pathHint: page.pathHint,
    permissionKeys: [pagePermissionKeyFor(page.id)],
    ungatedNote:
      page.id === "instagram_widget"
        ? "Meta App Review viewers can still have special route handling by account role."
        : undefined,
  })
);

export function menuAccessState(
  permissions: Record<string, boolean> | undefined,
  keys: readonly string[]
): "na" | "allowed" | "denied" | "mixed" {
  if (!keys.length) return "na";
  const vals = keys.map((k) => Boolean(permissions?.[k]));
  if (vals.every(Boolean)) return "allowed";
  if (vals.every((v) => !v)) return "denied";
  return "mixed";
}

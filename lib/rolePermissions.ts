import { hasFullAppAccess } from "@/lib/authRoleConstants";
import { WORKSPACE_PAGE_CATALOG, pagePermissionKeyFor } from "@/lib/workspacePageCatalog";

export type PermissionOption = {
  key: string;
  label: string;
};

const PAGE_PERMISSION_OPTIONS: PermissionOption[] = WORKSPACE_PAGE_CATALOG.map((page) => ({
  key: pagePermissionKeyFor(page.id),
  label: `Access page: ${page.menuLabel}`,
}));

export const PERMISSION_OPTIONS: PermissionOption[] = [
  ...PAGE_PERMISSION_OPTIONS,
  { key: "models.read", label: "View models" },
  { key: "models.write", label: "Create/edit models" },
  { key: "items.read", label: "View item refs" },
  { key: "items.write", label: "Upload item refs" },
  { key: "generate.run", label: "Run generation" },
  { key: "accessibility.read", label: "Use Accessibility page" },
  { key: "rfid.read", label: "Use RFID Price Tag page" },
  { key: "lightspeed.read", label: "Use Lightspeed Catalog page" },
  { key: "instagram.manage", label: "Use Instagram Widget page" },
  { key: "collection_mapping.read", label: "Use Collection Mapping page" },
  { key: "shopify.pull", label: "Shopify pull" },
  { key: "shopify.push", label: "Shopify push images" },
  { key: "seo.write", label: "Edit/push SEO" },
  { key: "settings.shopify", label: "Manage Shopify connection" },
  { key: "settings.dropbox", label: "Manage Dropbox connection" },
  { key: "admin.users", label: "Manage users" },
  { key: "admin.roles", label: "Manage roles & permissions" },
];

export const SYSTEM_ROLES = ["superadmin", "admin", "manager", "user", "meta_review"] as const;

const MANAGER_ALLOWED = new Set([
  "page.pictures_generator",
  "page.seo_manager",
  "page.accessibility",
  "page.rfid_price_tag",
  "page.lightspeed_catalog",
  "page.shopify_mapping_inventory",
  "page.collection_mapping",
  "page.instagram_widget",
  "page.create_new_items",
  "page.social_ads_meta",
  "page.ops_inventory",
  "page.workspace_dashboard",
  "page.settings_integrations",
  "page.settings_users",
  "models.read",
  "models.write",
  "items.read",
  "items.write",
  "generate.run",
  "accessibility.read",
  "rfid.read",
  "lightspeed.read",
  "instagram.manage",
  "collection_mapping.read",
  "shopify.pull",
  "shopify.push",
  "seo.write",
]);

const USER_ALLOWED = new Set([
  "page.pictures_generator",
  "page.accessibility",
  "page.rfid_price_tag",
  "page.lightspeed_catalog",
  "page.collection_mapping",
  "page.instagram_widget",
  "page.workspace_dashboard",
  "models.read",
  "items.read",
  "generate.run",
  "accessibility.read",
  "rfid.read",
  "lightspeed.read",
  "instagram.manage",
  "collection_mapping.read",
]);

export function defaultAllowedForRole(roleName: string, permission: string) {
  const role = String(roleName || "").trim().toLowerCase();
  if (hasFullAppAccess(role)) return true;
  if (role === "meta_review") return false;
  if (role === "manager") return MANAGER_ALLOWED.has(permission);
  if (role === "user") return USER_ALLOWED.has(permission);
  return false;
}

export function normalizeRoleName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}


export type PermissionOption = {
  key: string;
  label: string;
};

export const PERMISSION_OPTIONS: PermissionOption[] = [
  { key: "models.read", label: "View models" },
  { key: "models.write", label: "Create/edit models" },
  { key: "items.read", label: "View item refs" },
  { key: "items.write", label: "Upload item refs" },
  { key: "generate.run", label: "Run generation" },
  { key: "shopify.pull", label: "Shopify pull" },
  { key: "shopify.push", label: "Shopify push images" },
  { key: "seo.write", label: "Edit/push SEO" },
  { key: "settings.shopify", label: "Manage Shopify connection" },
  { key: "settings.dropbox", label: "Manage Dropbox connection" },
  { key: "admin.users", label: "Manage users" },
  { key: "admin.roles", label: "Manage roles & permissions" },
];

export const SYSTEM_ROLES = ["admin", "manager", "user"] as const;

const MANAGER_ALLOWED = new Set([
  "models.read",
  "models.write",
  "items.read",
  "items.write",
  "generate.run",
  "shopify.pull",
  "shopify.push",
  "seo.write",
]);

const USER_ALLOWED = new Set(["models.read", "items.read", "generate.run"]);

export function defaultAllowedForRole(roleName: string, permission: string) {
  const role = String(roleName || "").trim().toLowerCase();
  if (role === "admin") return true;
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


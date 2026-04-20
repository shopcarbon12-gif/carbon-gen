export type WorkspacePageDef = {
  id: string;
  menuLabel: string;
  href: string;
  pathHint: string;
  /**
   * Pages shown in the workspace sidebar menu.
   * Settings-only entries can stay false while still appearing in roles matrix.
   */
  showInWorkspaceMenu: boolean;
};

export function pagePermissionKeyFor(pageId: string) {
  return `page.${String(pageId || "").trim().toLowerCase()}`;
}

export const WORKSPACE_PAGE_CATALOG: WorkspacePageDef[] = [
  {
    id: "pictures_generator",
    menuLabel: "Pictures Generator",
    href: "/studio/images",
    pathHint: "/studio/images · /studio/gemini-generator",
    showInWorkspaceMenu: true,
  },
  {
    id: "seo_manager",
    menuLabel: "SEO Manager",
    href: "/studio/seo",
    pathHint: "/studio/seo",
    showInWorkspaceMenu: true,
  },
  {
    id: "accessibility",
    menuLabel: "Accessibility",
    href: "/accessibility",
    pathHint: "/accessibility",
    showInWorkspaceMenu: true,
  },
  {
    id: "rfid_price_tag",
    menuLabel: "RFID Price Tag",
    href: "/studio/rfid-price-tag",
    pathHint: "/studio/rfid-price-tag",
    showInWorkspaceMenu: true,
  },
  {
    id: "lightspeed_catalog",
    menuLabel: "Lightspeed Catalog",
    href: "/studio/lightspeed-catalog",
    pathHint: "/studio/lightspeed-catalog",
    showInWorkspaceMenu: true,
  },
  {
    id: "shopify_mapping_inventory",
    menuLabel: "Shopify Mapping Inventory",
    href: "/studio/shopify-mapping-inventory",
    pathHint: "/studio/shopify-mapping-inventory/*",
    showInWorkspaceMenu: true,
  },
  {
    id: "collection_mapping",
    menuLabel: "Collection Mapping",
    href: "/shopify-collection-mapping",
    pathHint: "/shopify-collection-mapping",
    showInWorkspaceMenu: true,
  },
  {
    id: "instagram_widget",
    menuLabel: "Instagram Widget",
    href: "/studio/instagram-widget",
    pathHint: "/studio/instagram-widget/*",
    showInWorkspaceMenu: true,
  },
  {
    id: "create_new_items",
    menuLabel: "Create New Items",
    href: "/studio/video",
    pathHint: "/studio/video",
    showInWorkspaceMenu: true,
  },
  {
    id: "social_ads_meta",
    menuLabel: "Social Ads & Meta",
    href: "/studio/social",
    pathHint: "/studio/social",
    showInWorkspaceMenu: true,
  },
  {
    id: "ops_inventory",
    menuLabel: "Ops Inventory",
    href: "/ops/inventory",
    pathHint: "/ops/inventory",
    showInWorkspaceMenu: true,
  },
  {
    id: "workspace_dashboard",
    menuLabel: "Workspace Dashboard",
    href: "/dashboard",
    pathHint: "/dashboard",
    showInWorkspaceMenu: true,
  },
  {
    id: "settings_integrations",
    menuLabel: "Settings · APIs & connections",
    href: "/settings",
    pathHint: "/settings (Shopify, Dropbox, ...)",
    showInWorkspaceMenu: false,
  },
  {
    id: "settings_users",
    menuLabel: "Settings · User accounts",
    href: "/settings",
    pathHint: "/settings (create users, passwords)",
    showInWorkspaceMenu: false,
  },
  {
    id: "settings_roles",
    menuLabel: "Settings · Roles & permissions",
    href: "/settings/roles",
    pathHint: "/settings/roles",
    showInWorkspaceMenu: false,
  },
];

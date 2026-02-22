import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeShopDomain } from "@/lib/shopify";

const TABLE = "shopify_cart_config";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function resolveShop(raw: string | null | undefined) {
  const requested = normalizeShopDomain(normalizeText(raw) || "") || "";
  if (requested) return requested;
  return normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN) || "") || "__default__";
}

export async function loadConfig(shop: string): Promise<Record<string, unknown>> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(TABLE)
      .select("config")
      .eq("shop", shop)
      .maybeSingle();

    if (error) throw error;

    if (data?.config && typeof data.config === "object") {
      return data.config as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export type SyncToggles = {
  lsSyncEnabled: boolean;
  shopifySyncEnabled: boolean;
  /** When false, the 15-min cron skips. Manual push/remove/pull still work if shopifySyncEnabled is on. */
  shopifyAutoSyncEnabled: boolean;
};

const DEFAULT_SYNC_TOGGLES: SyncToggles = {
  lsSyncEnabled: true,
  shopifySyncEnabled: true,
  shopifyAutoSyncEnabled: true,
};

/** Load sync toggles from cart config. Defaults to true when not set. */
export async function loadSyncToggles(shop: string): Promise<SyncToggles> {
  const config = await loadConfig(shop);
  const section = config?.syncToggles as Record<string, unknown> | undefined;
  if (!section || typeof section !== "object") {
    return DEFAULT_SYNC_TOGGLES;
  }
  return {
    lsSyncEnabled: section.lsSyncEnabled !== false,
    shopifySyncEnabled: section.shopifySyncEnabled !== false,
    shopifyAutoSyncEnabled: section.shopifyAutoSyncEnabled !== false,
  };
}

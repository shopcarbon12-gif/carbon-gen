import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeShopDomain } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "shopify_cart_config";
const memoryConfigs = new Map<string, Record<string, unknown>>();

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function resolveShop(raw: string | null | undefined) {
  const requested = normalizeShopDomain(normalizeText(raw) || "") || "";
  if (requested) return requested;
  return normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN) || "") || "__default__";
}

async function loadConfig(shop: string): Promise<{ data: Record<string, unknown>; backend: string; warning?: string }> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(TABLE)
      .select("config")
      .eq("shop", shop)
      .maybeSingle();

    if (error) throw error;

    if (data?.config && typeof data.config === "object") {
      return { data: data.config as Record<string, unknown>, backend: "supabase" };
    }
    const mem = memoryConfigs.get(shop);
    return { data: mem || {}, backend: mem ? "memory" : "none" };
  } catch (e: unknown) {
    const mem = memoryConfigs.get(shop);
    const msg = normalizeText((e as { message?: string } | null)?.message);
    return {
      data: mem || {},
      backend: "memory",
      warning: `Supabase unavailable (${msg}). Using in-memory config.`,
    };
  }
}

async function saveConfig(shop: string, section: string, values: Record<string, unknown>): Promise<{ ok: boolean; backend: string; warning?: string }> {
  const existing = await loadConfig(shop);
  const merged = { ...existing.data, [section]: values };

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from(TABLE)
      .upsert(
        { shop, config: merged, updated_at: new Date().toISOString() },
        { onConflict: "shop" }
      );

    if (error) throw error;
    memoryConfigs.set(shop, merged);
    return { ok: true, backend: "supabase" };
  } catch (e: unknown) {
    memoryConfigs.set(shop, merged);
    const msg = normalizeText((e as { message?: string } | null)?.message);
    return {
      ok: true,
      backend: "memory",
      warning: `Supabase unavailable (${msg}). Saved in-memory only.`,
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = resolveShop(searchParams.get("shop"));
    const result = await loadConfig(shop);

    return NextResponse.json({
      ok: true,
      shop,
      config: result.data,
      backend: result.backend,
      warning: result.warning || "",
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: normalizeText((e as { message?: string } | null)?.message) || "Failed to load config." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const shop = resolveShop(body?.shop);
    const section = normalizeText(body?.section);
    const values = (body?.values && typeof body.values === "object") ? body.values as Record<string, unknown> : null;

    if (!section) {
      return NextResponse.json({ error: "section is required." }, { status: 400 });
    }
    if (!values) {
      return NextResponse.json({ error: "values object is required." }, { status: 400 });
    }

    const result = await saveConfig(shop, section, values);

    return NextResponse.json({
      ok: true,
      shop,
      section,
      backend: result.backend,
      warning: result.warning || "",
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: normalizeText((e as { message?: string } | null)?.message) || "Failed to save config." },
      { status: 500 }
    );
  }
}

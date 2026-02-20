import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "lightspeed_pos_config";
const memoryConfigs = new Map<string, Record<string, unknown>>();

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function resolveKey(raw: string | null | undefined) {
  const key = normalizeText(raw) || "default";
  return key;
}

async function loadConfig(key: string): Promise<{
  data: Record<string, unknown>;
  backend: string;
  warning?: string;
}> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(TABLE)
      .select("config")
      .eq("id", key)
      .maybeSingle();

    if (error) throw error;

    if (data?.config && typeof data.config === "object") {
      return { data: data.config as Record<string, unknown>, backend: "supabase" };
    }
    const mem = memoryConfigs.get(key);
    return { data: mem || {}, backend: mem ? "memory" : "none" };
  } catch (e: unknown) {
    const mem = memoryConfigs.get(key);
    const msg = normalizeText((e as { message?: string } | null)?.message);
    return {
      data: mem || {},
      backend: mem ? "memory" : "none",
      warning: `Supabase unavailable (${msg}). Using in-memory config.`,
    };
  }
}

async function saveConfig(
  key: string,
  section: string,
  values: Record<string, unknown>
): Promise<{ ok: boolean; backend: string; warning?: string }> {
  const existing = await loadConfig(key);
  const merged = { ...existing.data, [section]: values };

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from(TABLE).upsert(
      { id: key, config: merged, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );

    if (error) throw error;
    memoryConfigs.set(key, merged);
    return { ok: true, backend: "supabase" };
  } catch (e: unknown) {
    memoryConfigs.set(key, merged);
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
    const key = resolveKey(searchParams.get("key") ?? process.env.LS_ACCOUNT_ID);
    const result = await loadConfig(key);

    return NextResponse.json({
      ok: true,
      key,
      config: result.data,
      backend: result.backend,
      warning: result.warning || "",
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error:
          normalizeText((e as { message?: string } | null)?.message) || "Failed to load POS config.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const key = resolveKey(body?.key ?? process.env.LS_ACCOUNT_ID);
    const section = normalizeText(body?.section);
    const values =
      body?.values && typeof body.values === "object"
        ? (body.values as Record<string, unknown>)
        : null;

    if (!section) {
      return NextResponse.json({ error: "section is required." }, { status: 400 });
    }
    if (!values) {
      return NextResponse.json({ error: "values object is required." }, { status: 400 });
    }

    const result = await saveConfig(key, section, values);

    return NextResponse.json({
      ok: true,
      key,
      section,
      backend: result.backend,
      warning: result.warning || "",
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error:
          normalizeText((e as { message?: string } | null)?.message) || "Failed to save POS config.",
      },
      { status: 500 }
    );
  }
}

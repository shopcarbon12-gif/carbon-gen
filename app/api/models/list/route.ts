import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const DEFAULT_SESSION_USER_ID = "00000000-0000-0000-0000-000000000001";

function sanitizeReferenceUrl(value: unknown) {
  if (typeof value !== "string") return "";
  let v = value.trim();
  if (!v) return "";
  v = v.replace(/%0d%0a/gi, "");
  v = v.replace(/%0d/gi, "");
  v = v.replace(/%0a/gi, "");
  v = v.replace(/[\r\n]+/g, "");
  return v.trim();
}

export async function GET(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId =
      req.cookies.get("carbon_gen_user_id")?.value?.trim() ||
      req.cookies.get("carbon_gen_username")?.value?.trim() ||
      DEFAULT_SESSION_USER_ID;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("models")
      .select("model_id,name,gender,ref_image_urls,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const cleaned = (data || []).map((row: any) => ({
      ...row,
      ref_image_urls: Array.isArray(row?.ref_image_urls)
        ? row.ref_image_urls
            .map((v: unknown) => sanitizeReferenceUrl(v))
            .filter((v: string) => v.length > 0)
        : [],
    }));
    return NextResponse.json({ models: cleaned });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load models" }, { status: 500 });
  }
}

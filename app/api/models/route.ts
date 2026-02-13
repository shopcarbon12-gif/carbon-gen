import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const DEFAULT_SESSION_USER_ID = "00000000-0000-0000-0000-000000000001";

function normalizeModelName(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

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

function isTemporaryReferenceUrl(raw: string) {
  const v = String(raw || "").toLowerCase();
  if (!v) return false;
  if (v.includes("/storage/v1/object/sign/")) return true;
  if (v.includes("token=") || v.includes("x-amz-signature=") || v.includes("x-amz-security-token="))
    return true;
  if (v.includes("dl.dropboxusercontent.com")) return true;
  return false;
}

async function modelNameExistsForUser(userId: string, candidateName: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("models")
    .select("name")
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  const normalizedCandidate = normalizeModelName(candidateName);
  return (data || []).some((row: any) => normalizeModelName(row?.name || "") === normalizedCandidate);
}

export async function POST(req: NextRequest) {
  try {
    const isAuthed =
      (process.env.AUTH_BYPASS || "true").trim().toLowerCase() === "true" ||
      req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId =
      req.cookies.get("carbon_gen_user_id")?.value?.trim() ||
      req.cookies.get("carbon_gen_username")?.value?.trim() ||
      DEFAULT_SESSION_USER_ID;

    const contentType = req.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    let name = "";
    let gender = "";
    let urls: string[] = [];

    if (isJson) {
      const body = await req.json();
      name = String(body?.name || "").trim();
      gender = String(body?.gender || "").trim().toLowerCase();
      urls = Array.isArray(body?.urls)
        ? body.urls
            .map((v: unknown) => sanitizeReferenceUrl(v))
            .filter((v: string) => v.length > 0)
        : [];

      if (urls.some((u) => isTemporaryReferenceUrl(u))) {
        return NextResponse.json(
          {
            error:
              "Some model reference images are temporary links and expired. Re-add the model from current uploads.",
          },
          { status: 400 }
        );
      }
    } else {
      const form = await req.formData();
      name = String(form.get("name") || "").trim();
      gender = String(form.get("gender") || "").trim().toLowerCase();
      const files = form.getAll("files").filter(Boolean) as File[];

      if (!name || !gender || !files.length) {
        return NextResponse.json(
          { error: "Missing name, gender, or files." },
          { status: 400 }
        );
      }
      if (gender !== "male" && gender !== "female") {
        return NextResponse.json({ error: "Gender must be male or female." }, { status: 400 });
      }
      if (files.length < 3) {
        return NextResponse.json(
          { error: "At least 3 model reference images are required." },
          { status: 400 }
        );
      }

      const duplicateExists = await modelNameExistsForUser(userId, name);
      if (duplicateExists) {
        return NextResponse.json(
          { error: "A model with this name already exists. Please choose a different name." },
          { status: 409 }
        );
      }

      const bucket = (process.env.SUPABASE_STORAGE_BUCKET_ITEMS || "").trim();
      if (!bucket) {
        return NextResponse.json(
          { error: "Missing SUPABASE_STORAGE_BUCKET_ITEMS" },
          { status: 500 }
        );
      }

      const supabase = getSupabaseAdmin();
      const tempId = crypto.randomUUID();
      const uploadJobs = files.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const path = `models/${tempId}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, bytes, { contentType: file.type || "application/octet-stream" });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      });

      urls = (await Promise.all(uploadJobs))
        .map((v) => sanitizeReferenceUrl(v))
        .filter((v) => v.length > 0);
    }

    if (!name || !gender || !urls.length) {
      return NextResponse.json(
        { error: "Missing name, gender, or urls." },
        { status: 400 }
      );
    }
    if (gender !== "male" && gender !== "female") {
      return NextResponse.json({ error: "Gender must be male or female." }, { status: 400 });
    }
    if (urls.length < 3) {
      return NextResponse.json(
        { error: "At least 3 model reference images are required." },
        { status: 400 }
      );
    }

    const duplicateExists = await modelNameExistsForUser(userId, name);
    if (duplicateExists) {
      return NextResponse.json(
        { error: "A model with this name already exists. Please choose a different name." },
        { status: 409 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("models")
      .insert({
        model_id: crypto.randomUUID(),
        user_id: userId,
        name,
        gender,
        ref_image_urls: urls,
      })
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ model: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Model upload failed" }, { status: 500 });
  }
}

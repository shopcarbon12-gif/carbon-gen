import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = req.cookies.get("carbon_gen_user_id")?.value?.trim();
    if (!userId) {
      return NextResponse.json({ error: "Missing user session" }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") || "";
    let name = "";
    let gender = "";
    let urls: string[] = [];

    if (contentType.includes("application/json")) {
      const body = await req.json();
      name = String(body?.name || "").trim();
      gender = String(body?.gender || "").trim().toLowerCase();
      urls = Array.isArray(body?.urls) ? body.urls : [];
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

      urls = await Promise.all(uploadJobs);
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

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { uploadBytesToStorage } from "@/lib/storageProvider";

export async function POST(req: NextRequest) {
  try {
    const isAuthed =
      (process.env.NODE_ENV !== "production" &&
        (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true") ||
      req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const batchId = String(form.get("batchId") || "").trim() || crypto.randomUUID();

    if (!file) {
      return NextResponse.json({ error: "Missing file." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `models/${batchId}/${Date.now()}-${safeName}`;

    const uploaded = await uploadBytesToStorage({
      path,
      bytes,
      contentType: file.type || "application/octet-stream",
    });
    return NextResponse.json({ url: uploaded.url, path: uploaded.path });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}

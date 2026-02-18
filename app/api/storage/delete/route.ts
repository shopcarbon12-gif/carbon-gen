import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deleteStorageObjects } from "@/lib/storageProvider";

export async function POST(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const path = String(body?.path || "").trim();
    if (!path) {
      return NextResponse.json({ error: "Missing path." }, { status: 400 });
    }

    await deleteStorageObjects([path]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 });
  }
}

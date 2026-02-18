import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deleteStorageObjects, listStorageFiles } from "@/lib/storageProvider";

export async function POST(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const prefix = String(body?.prefix || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

    const targetPrefixes = prefix
      ? [prefix]
      : ["models", "items"];
    const listedGroups = await Promise.all(
      targetPrefixes.map((p) => listStorageFiles(p))
    );
    const all = Array.from(new Set(listedGroups.flat().map((file) => file.path)));

    if (!all.length) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const result = await deleteStorageObjects(all);

    return NextResponse.json({ ok: true, deleted: result.deleted });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to empty bucket" }, { status: 500 });
  }
}

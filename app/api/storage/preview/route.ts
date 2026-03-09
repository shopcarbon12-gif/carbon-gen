import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { downloadStorageObject, tryGetStoragePathFromUrl } from "@/lib/storageProvider";

export async function GET(req: NextRequest) {
  try {
    const isAuthed =
      (process.env.NODE_ENV !== "production" &&
        (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true") ||
      req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const path = String(req.nextUrl.searchParams.get("path") || "").trim();
    const rawUrl = String(req.nextUrl.searchParams.get("url") || "").trim();
    const resolvedPath = path || (rawUrl ? tryGetStoragePathFromUrl(rawUrl) : "");
    if (!resolvedPath) {
      return NextResponse.json({ error: "Missing or unsupported storage path/url." }, { status: 400 });
    }

    const { body, contentType } = await downloadStorageObject(resolvedPath);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load storage preview." },
      { status: 500 }
    );
  }
}

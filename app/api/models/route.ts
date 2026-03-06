import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { uploadBytesToStorage } from "@/lib/storageProvider";
import { insertModelRow, modelNameExistsForUser } from "@/lib/modelsRepository";
import { getStoragePublicUrl } from "@/lib/storageProvider";

const DEFAULT_SESSION_USER_ID = "00000000-0000-0000-0000-000000000001";
const modelSaveInFlight = new Set<string>();

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

function extractPathFromStorageUrl(url: string) {
  try {
    const u = new URL(url);
    const markers = [
      "/storage/v1/object/public/",
      "/storage/v1/object/sign/",
      "/storage/v1/object/authenticated/",
    ];
    for (const marker of markers) {
      const idx = u.pathname.indexOf(marker);
      if (idx < 0) continue;
      const rest = u.pathname.slice(idx + marker.length);
      const slash = rest.indexOf("/");
      if (slash < 0) continue;
      return decodeURIComponent(rest.slice(slash + 1));
    }
    return "";
  } catch {
    return "";
  }
}

function extractPathFromR2StorageUrl(url: string) {
  try {
    const u = new URL(url);
    const host = String(u.hostname || "").toLowerCase();
    const configuredBucket = String(process.env.R2_BUCKET || "").trim();
    const configuredPublicBase = String(process.env.R2_PUBLIC_URL_BASE || "").trim();
    const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));

    if (host.includes("r2.cloudflarestorage.com")) {
      if (parts.length >= 2) return parts.slice(1).join("/");
      if (configuredBucket && parts.length >= 1) return parts.join("/");
      return "";
    }
    if (host.endsWith(".r2.dev")) return parts.join("/");
    if (configuredPublicBase) {
      try {
        const base = new URL(configuredPublicBase);
        if (host !== String(base.hostname || "").toLowerCase()) return "";
        const baseParts = base.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
        let objectParts = parts;
        if (baseParts.length && parts.length >= baseParts.length) {
          const isPrefix = baseParts.every((seg, idx) => parts[idx] === seg);
          if (isPrefix) objectParts = parts.slice(baseParts.length);
        }
        return objectParts.join("/");
      } catch {
        return "";
      }
    }
    return "";
  } catch {
    return "";
  }
}

function normalizeReferenceUrl(raw: string) {
  const objectPath = extractPathFromStorageUrl(raw) || extractPathFromR2StorageUrl(raw);
  if (!objectPath) return sanitizeReferenceUrl(raw);
  try {
    return getStoragePublicUrl(objectPath);
  } catch {
    return sanitizeReferenceUrl(raw);
  }
}

export async function POST(req: NextRequest) {
  let inFlightKey = "";
  try {
    const isAuthed =
      (process.env.NODE_ENV !== "production" &&
        (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true") ||
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

    let alreadyCheckedDuplicate = false;
    if (isJson) {
      const body = await req.json();
      name = String(body?.name || "").trim();
      gender = String(body?.gender || "").trim().toLowerCase();
      urls = Array.isArray(body?.urls)
        ? body.urls
            .map((v: unknown) => sanitizeReferenceUrl(v))
            .filter((v: string) => v.length > 0)
            .map((url: string) =>
              isTemporaryReferenceUrl(url) ? normalizeReferenceUrl(url) : sanitizeReferenceUrl(url)
            )
            .filter((v: string) => v.length > 0)
        : [];
      urls = Array.from(new Set(urls));

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
      alreadyCheckedDuplicate = true;

      const tempId = crypto.randomUUID();
      const uploadJobs = files.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const path = `models/${tempId}/${Date.now()}-${safeName}`;

        const uploaded = await uploadBytesToStorage({
          path,
          bytes,
          contentType: file.type || "application/octet-stream",
        });
        return uploaded.url;
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

    inFlightKey = `${userId}::${normalizeModelName(name)}`;
    if (modelSaveInFlight.has(inFlightKey)) {
      return NextResponse.json(
        { error: "This model is already being saved. Please wait a moment." },
        { status: 409 }
      );
    }
    modelSaveInFlight.add(inFlightKey);

    if (!alreadyCheckedDuplicate) {
      const duplicateExists = await modelNameExistsForUser(userId, name);
      if (duplicateExists) {
        return NextResponse.json(
          { error: "A model with this name already exists. Please choose a different name." },
          { status: 409 }
        );
      }
    }

    const data = await insertModelRow({
      model_id: crypto.randomUUID(),
      user_id: userId,
      name,
      gender,
      ref_image_urls: urls,
    });
    return NextResponse.json({ model: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Model upload failed" }, { status: 500 });
  } finally {
    if (inFlightKey) {
      modelSaveInFlight.delete(inFlightKey);
    }
  }
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toTitleCase(input: string) {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const prompt = normalizeText(body?.prompt);
  const itemType = normalizeText(body?.itemType) || "product";
  const brand = normalizeText(body?.brand) || "Carbon";

  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const seed = toTitleCase(`${brand} ${itemType}`.trim());
  const metadata = {
    title: `${seed} | Studio Product Image`,
    description: `${brand} ${itemType} imagery optimized for ecommerce listings and social placements.`,
    altText: `${brand} ${itemType} product image on neutral background`,
    keywords: [brand, itemType, "ecommerce", "product photo", "studio"],
  };

  return NextResponse.json({
    metadata,
    source: "local-metadata",
  });
}

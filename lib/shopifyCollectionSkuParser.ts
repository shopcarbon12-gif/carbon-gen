export type CollectionParserType = "NEW" | "LEGACY" | "UNKNOWN";

export type ParsedSkuRoute = {
  parserType: CollectionParserType;
  routeKey: string;
  digit: string;
  barcodeLabel: string;
  normalizedSku: string;
  normalizedUpc: string;
  normalizedTokens: string[];
};

const ROUTE_KEY_LABELS: Record<string, string> = {
  "11": "Men Summer",
  "12": "Men Winter",
  "21": "Women Summer",
  "22": "Women Winter",
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function normalizeCandidateText(value: unknown) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return "";
  return raw
    .replace(/[\\/_]+/g, " ")
    .replace(/\s*:\s*/g, ":")
    .replace(/\b(t[\s\-_]*shirts?)\b/g, "t-shirt")
    .replace(/\b(tee[\s\-_]*shirts?)\b/g, "t-shirt")
    .replace(/\b(tops?)\b/g, "tops")
    .replace(/[()]+/g, " ")
    .replace(/[^a-z0-9:+&\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeCandidateText(value: unknown) {
  const normalized = normalizeCandidateText(value);
  if (!normalized) return [];
  const parts = normalized
    .split(/[\s>]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const token of parts) {
    out.push(token);
    if (token === "t-shirt") {
      out.push("tshirt");
      out.push("tee");
    }
    if (token === "jeans") out.push("jean");
  }
  return dedupe(out);
}

export function normalizeMenuPath(value: unknown) {
  const text = normalizeText(value);
  if (!text) return "";
  return text
    .replace(/[\\/_]+/g, " ")
    .replace(/\s*>\s*/g, " > ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function toBarcodeLabel(routeKey: string, digit: string) {
  const routeLabel = ROUTE_KEY_LABELS[routeKey] || "";
  if (!routeLabel && !digit) return "Unknown route";
  if (!routeLabel) return `Digit ${digit}`;
  if (!digit) return routeLabel;
  return `${routeLabel} / Digit ${digit}`;
}

function parseRouteFromDigits(rawDigits: string) {
  const digits = rawDigits.replace(/[^0-9]/g, "");
  if (digits.length < 3) return { routeKey: "", digit: "" };
  const routeKey = digits.slice(0, 2);
  const digit = digits.slice(2, 3);
  return { routeKey, digit };
}

export function parseSkuRouteInfo(input: {
  sku: string;
  upc?: string;
  title?: string;
  itemType?: string;
}): ParsedSkuRoute {
  const normalizedSku = normalizeText(input.sku).toUpperCase();
  const normalizedUpc = normalizeText(input.upc || "");
  const skuCompact = normalizedSku.replace(/[\s\-_]+/g, "");
  const upcDigits = normalizedUpc.replace(/[^0-9]/g, "");
  const parserType: CollectionParserType =
    skuCompact.startsWith("1") || skuCompact.startsWith("2")
      ? "NEW"
      : skuCompact.startsWith("C")
        ? "LEGACY"
        : "UNKNOWN";

  let routeKey = "";
  let digit = "";
  if (parserType === "NEW") {
    const parsed = parseRouteFromDigits(skuCompact);
    routeKey = parsed.routeKey;
    digit = parsed.digit;
  } else if (parserType === "LEGACY") {
    const parsed = parseRouteFromDigits(skuCompact.slice(1));
    routeKey = parsed.routeKey;
    digit = parsed.digit;
  }

  if (!routeKey || !digit) {
    const fallback = parseRouteFromDigits(upcDigits);
    if (fallback.routeKey && fallback.digit) {
      routeKey = fallback.routeKey;
      digit = fallback.digit;
    }
  }

  const normalizedTokens = dedupe([
    ...tokenizeCandidateText(input.title || ""),
    ...tokenizeCandidateText(input.itemType || ""),
    ...tokenizeCandidateText(normalizedSku),
  ]);

  return {
    parserType,
    routeKey,
    digit,
    barcodeLabel: toBarcodeLabel(routeKey, digit),
    normalizedSku: skuCompact,
    normalizedUpc: upcDigits,
    normalizedTokens,
  };
}

// Carbon RFID hang-tag stock at 12 dpmm (300 DPI). The ZD500R's media is
// 812 dots wide (ezpl.print_width=812) — PW780 left blank padding on the
// right. Height bumped to 624 to fit the final box grid (see
// project_zd500r_font_and_calibration_2026_06_01).
export const LABEL_WIDTH_DOTS = 812;
export const LABEL_HEIGHT_DOTS = 624;
export const PRINTER_DPI = 300;

export type RfidSettings = {
  companyPrefix: number;
  companyPrefixBits: number;
  itemNumberBits: number;
  serialBits: number;
  printerIp: string;
  printerPort: number;
  labelWidthDots: number;
  labelHeightDots: number;
  labelShiftX: number;
  labelShiftY: number;
};

export const DEFAULT_RFID_SETTINGS: RfidSettings = {
  companyPrefix: 1044991,
  companyPrefixBits: 20,
  itemNumberBits: 40,
  serialBits: 36,
  printerIp: "192.168.1.3",
  // Browser print flow uses Zebra web print endpoint (/pstprnt), typically on HTTP port 80.
  printerPort: 80,
  labelWidthDots: LABEL_WIDTH_DOTS,
  labelHeightDots: LABEL_HEIGHT_DOTS,
  // Whole-label registration tuned on-printer 2026-06-01: ^LS-32 shifts
  // content right, ^LT24 nudges it down so the grid sits on the stock.
  labelShiftX: -32,
  labelShiftY: 24,
};

export type LabelInput = {
  lightspeedSystemId: string;
  itemName: string;
  color: string;
  size: string;
  upc: string;
  customSku: string;
  retailPrice: string;
  countryCode: string;
  qty: number;
  printNow: boolean;
  printerIp: string;
  printerPort: string;
};

export type GeneratedLabel = {
  epc: string;
  epcDecimal: string;
  serialNumber: number;
  zpl: string;
};

export type LabelMapping = {
  id: number;
  epc: string;
  lightspeedSystemId: string;
  itemNumber: number;
  serialNumber: number;
  itemName: string;
  upc: string;
  customSku: string;
  color: string;
  size: string;
  retailPrice: string;
  countryCode: string;
  printedAt: string;
  zpl: string;
};

export type CatalogItem = {
  itemId: string;
  systemSku: string;
  customSku: string;
  upc: string;
  ean: string;
  manufacturerSku: string;
  description: string;
  retailPrice: string;
  color: string;
  size: string;
};

const COMMON_SIZES = new Set([
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
]);

const MULTI_WORD_COLORS = new Set([
  "OFF WHITE",
  "DARK BLUE",
  "LIGHT BLUE",
  "ROYAL BLUE",
  "NAVY BLUE",
  "SKY BLUE",
  "ROSE GOLD",
  "OLIVE GREEN",
  "ARMY GREEN",
  "LIGHT GREY",
  "DARK GREY",
  "HEATHER GREY",
]);

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function toBoolean(value: unknown) {
  return value === true || value === "true" || value === "on" || value === "1" || value === 1;
}

export function normalizeEpc(epc: unknown) {
  return String(epc || "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

export function sanitizeZpl(value: unknown) {
  return String(value || "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[\^~]/g, "-")
    .trim();
}

export function epcBitTotal(settings: RfidSettings) {
  return settings.companyPrefixBits + settings.itemNumberBits + settings.serialBits;
}

export function coerceRfidSettings(value: Partial<Record<keyof RfidSettings, unknown>>) {
  return {
    companyPrefix: clampInt(value.companyPrefix, DEFAULT_RFID_SETTINGS.companyPrefix, 1, 1_048_575),
    companyPrefixBits: clampInt(
      value.companyPrefixBits,
      DEFAULT_RFID_SETTINGS.companyPrefixBits,
      1,
      48
    ),
    itemNumberBits: clampInt(value.itemNumberBits, DEFAULT_RFID_SETTINGS.itemNumberBits, 1, 60),
    serialBits: clampInt(value.serialBits, DEFAULT_RFID_SETTINGS.serialBits, 1, 60),
    printerIp: String(value.printerIp ?? DEFAULT_RFID_SETTINGS.printerIp).trim(),
    printerPort: clampInt(value.printerPort, DEFAULT_RFID_SETTINGS.printerPort, 1, 65535),
    labelWidthDots: clampInt(value.labelWidthDots, DEFAULT_RFID_SETTINGS.labelWidthDots, 400, 1600),
    labelHeightDots: clampInt(
      value.labelHeightDots,
      DEFAULT_RFID_SETTINGS.labelHeightDots,
      250,
      1600
    ),
    labelShiftX: clampInt(value.labelShiftX, DEFAULT_RFID_SETTINGS.labelShiftX, -500, 500),
    labelShiftY: clampInt(value.labelShiftY, DEFAULT_RFID_SETTINGS.labelShiftY, -500, 500),
  } satisfies RfidSettings;
}

export function validateRfidSettings(settings: RfidSettings) {
  if (epcBitTotal(settings) !== 96) {
    throw new Error(`EPC bits must total 96 (currently ${epcBitTotal(settings)}).`);
  }
  if (!settings.printerIp.trim()) {
    throw new Error("Default printer IP is required.");
  }
}

export function normalizeLabelInput(value: Record<string, unknown>) {
  const qty = clampInt(value.qty, 1, 1, 500);
  return {
    lightspeedSystemId: String(
      value.lightspeedSystemId ?? value.lightspeed_system_id ?? ""
    ).trim(),
    itemName: String(value.itemName ?? value.item_name ?? "").trim(),
    color: String(value.color ?? "").trim(),
    size: String(value.size ?? "").trim(),
    upc: String(value.upc ?? "").trim(),
    customSku: String(value.customSku ?? value.custom_sku ?? "").trim(),
    retailPrice: String(value.retailPrice ?? value.retail_price ?? "0").trim(),
    countryCode: String(value.countryCode ?? value.country_code ?? "").trim(),
    qty,
    printNow: toBoolean(value.printNow),
    printerIp: String(value.printerIp ?? "").trim(),
    printerPort: String(value.printerPort ?? "").trim(),
  } satisfies LabelInput;
}

function mask(bits: number) {
  const one = BigInt(1);
  return (one << BigInt(bits)) - one;
}

function fnv1a64(input: string) {
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const max64 = BigInt("0xffffffffffffffff");
  const bytes = new TextEncoder().encode(String(input));

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & max64;
  }

  return hash;
}

export function deriveItemNumber(systemId: string, bits = 40) {
  const normalized = String(systemId || "").trim();
  if (!normalized) {
    throw new Error("Lightspeed System ID is required.");
  }

  if (/^\d+$/.test(normalized)) {
    return BigInt(normalized) & mask(bits);
  }

  return fnv1a64(normalized) & mask(bits);
}

function toPaddedHex(value: bigint, totalBits = 96) {
  const hexChars = Math.ceil(totalBits / 4);
  return value.toString(16).toUpperCase().padStart(hexChars, "0");
}

export function buildEpc({
  companyPrefix,
  companyPrefixBits = 20,
  itemNumber,
  itemNumberBits = 40,
  serialNumber,
  serialBits = 36,
}: {
  companyPrefix: number;
  companyPrefixBits?: number;
  itemNumber: bigint;
  itemNumberBits?: number;
  serialNumber: number;
  serialBits?: number;
}) {
  const cp = BigInt(companyPrefix);
  const item = BigInt(itemNumber);
  const serial = BigInt(serialNumber);

  if (cp > mask(companyPrefixBits)) {
    throw new Error(`Company prefix exceeds ${companyPrefixBits} bits.`);
  }
  if (item > mask(itemNumberBits)) {
    throw new Error(`Item number exceeds ${itemNumberBits} bits.`);
  }
  if (serial > mask(serialBits)) {
    throw new Error(`Serial number exceeds ${serialBits} bits.`);
  }

  const epcValue =
    (cp << BigInt(itemNumberBits + serialBits)) |
    (item << BigInt(serialBits)) |
    serial;

  return {
    epcHex: toPaddedHex(epcValue, 96),
    epcDecimal: epcValue.toString(10),
  };
}

export function inferSizeFromDescription(description: string) {
  const tokens = sanitizeZpl(description).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  const tail = tokens[tokens.length - 1].toUpperCase();
  if (COMMON_SIZES.has(tail)) return tail;
  if (/^\d{1,3}(\.\d+)?$/.test(tail)) return tail;
  return "";
}

export function inferColorFromDescription(description: string, inferredSize: string) {
  const tokens = sanitizeZpl(description).split(/\s+/).filter(Boolean);
  if (tokens.length < 1) return "";

  const upper = tokens.map((token) => token.toUpperCase());
  const inferredSizeUpper = String(inferredSize || "").toUpperCase();
  const lastIdx = upper.length - 1;
  const last = upper[lastIdx];
  const secondLast = upper[lastIdx - 1] || "";

  if (inferredSizeUpper && last === inferredSizeUpper) {
    if (secondLast && upper.length >= 3) {
      const thirdLast = upper[lastIdx - 2] || "";
      const pair = `${thirdLast} ${secondLast}`.trim();
      if (MULTI_WORD_COLORS.has(pair)) {
        return tokens[lastIdx - 2] && tokens[lastIdx - 1]
          ? `${tokens[lastIdx - 2]} ${tokens[lastIdx - 1]}`
          : tokens[lastIdx - 1] || "";
      }
    }
    return tokens[lastIdx - 1] || "";
  }

  if (secondLast) {
    const pair = `${secondLast} ${last}`.trim();
    if (MULTI_WORD_COLORS.has(pair)) {
      return `${tokens[lastIdx - 1]} ${tokens[lastIdx]}`;
    }
  }

  return tokens[lastIdx] || "";
}

function greedyWrap(words: string[], max: number): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const w of words) {
    const cand = [...cur, w].join(" ");
    if (cur.length && cand.length > max) {
      out.push(cur.join(" "));
      cur = [w];
    } else {
      cur.push(w);
    }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

/**
 * Box-4 item-name layout (tuned on-printer 2026-06-01). Strips color/size
 * words from the name, then fits on ONE centered row (font 40) when ≤16
 * chars (x324); else greedy-wraps to TWO rows (font 40, ≤16 each) at
 * x294/354; else drops to font 36 and THREE rows (≤18 each) at x284/324/364.
 */
function layoutItemName(
  name: string,
  color: string,
  size: string
): { rows: string[]; font: number; xs: number[] } {
  const remove = new Set(
    [sanitizeZpl(color), sanitizeZpl(size)].join(" ").toUpperCase().split(/\s+/).filter(Boolean)
  );
  const words = sanitizeZpl(name)
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !remove.has(w));
  if (words.length === 0) return { rows: ["ITEM"], font: 40, xs: [324] };
  const full = words.join(" ");
  if (full.length <= 16) return { rows: [full], font: 40, xs: [324] };
  const r2 = greedyWrap(words, 16);
  if (r2.length <= 2) return { rows: r2, font: 40, xs: [294, 354] };
  const r3 = greedyWrap(words, 18);
  const rows = r3.length <= 3 ? r3 : [r3[0], r3[1], r3.slice(2).join(" ")];
  return { rows, font: 36, xs: [284, 324, 364] };
}

/** Box-8 size-run auto-shrink: largest font ≤48 whose estimated Arial width
 *  fits the ^FB550 block (~530 usable), nudging x up as the glyph shrinks. */
function box8Layout(text: string): { font: number; x: number } {
  const em = [...text].reduce((a, c) => a + (c === " " ? 0.278 : 0.556), 0);
  const font = Math.min(48, Math.max(20, Math.floor(530 / Math.max(em, 1))));
  const x = Math.round(756 - (48 - font) * 0.5);
  return { font, x };
}

/** Box-6 barcode is Code 93 at ^BY3 — length grows with the SKU. Center it
 *  in the content height (y64..541) so short/long SKUs stay balanced. */
function barcodeStartY(sku: string): number {
  const lengthDots = (9 * sku.length + 37) * 3; // Code 93 module count × ^BY3
  return Math.max(30, Math.round(64 + (477 - lengthDots) / 2));
}

function formatDisplayPrice(value: string) {
  const raw = sanitizeZpl(value);
  const num = Number.parseFloat(raw);
  if (Number.isFinite(num)) {
    if (Number.isInteger(num)) return String(num);
    return num.toFixed(2).replace(/\.00$/, "");
  }
  return raw || "0";
}

function normalizeSizesColumn(value: string) {
  const tokens = sanitizeZpl(value)
    .toUpperCase()
    .split(/[,/| ]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
  }

  if (unique.length === 0) return "XS S M L";
  return unique.join(" ");
}

export function generateLabelZpl({
  input,
  settings,
  epcConfig,
  epcWrite,
}: {
  input: Pick<
    LabelInput,
    "itemName" | "color" | "size" | "upc" | "customSku" | "retailPrice" | "countryCode"
  >;
  settings: RfidSettings;
  epcConfig: {
    epcLength: number;
    companyPrefixBits: number;
    itemNumberBits: number;
    serialBits: number;
  };
  epcWrite: {
    companyPrefix: number;
    itemNumber: number;
    serialNumber: number;
  };
}) {
  const safeColor = sanitizeZpl(input.color).toUpperCase();
  const inferredSize = inferSizeFromDescription(input.itemName);
  const safeSize = (sanitizeZpl(input.size) || inferredSize || "").toUpperCase();
  const safeColorResolved = (safeColor || inferColorFromDescription(input.itemName, safeSize)).toUpperCase();
  const safeUpc = sanitizeZpl(input.upc).toUpperCase();
  const safeSku = sanitizeZpl(input.customSku).toUpperCase();
  const safePrice = formatDisplayPrice(input.retailPrice);
  const safeCountry = normalizeSizesColumn(input.countryCode);
  const name = layoutItemName(input.itemName, safeColorResolved, safeSize);
  const nameLines = name.rows
    .map((r, i) => `^FT${name.xs[i]},575^AKB,${name.font}^FB550,1,0,C^FD${r}^FS`)
    .join("\n");
  const b8 = box8Layout(safeCountry);
  const bcY = barcodeStartY(safeSku || safeUpc);

  // Carbon RFID price-tag — final layout dialed in on-printer 2026-06-01
  // (see project_zd500r_font_and_calibration_2026_06_01). Fonts: K=Arial,
  // B=Arial heavy bold (ARI000), M=Liberation Sans Bold uploaded as
  // E:LSB3.TTF via BINARY ~DY (ASCII-hex stores but won't render). ^PR2
  // slows the print so the thin Code 93 bars come out crisp. Box 6 barcode
  // = Code 93 (^BAB) of the FULL SKU incl. letters (laser/red-light
  // scannable), centered by length. EPC via ^RB + ^RFW,E decimal triplet.
  // REQUIRES E:LSB3.TTF on the target printer, else box 3 (UPC) and box 7
  // (price) render blank.
  return `^XA
^CI28
^PON
^FWN
^MNY
^PW${settings.labelWidthDots}
^LL${settings.labelHeightDots}
^MD20
^PR2
^LH0,0
^LS${settings.labelShiftX}
^LT${settings.labelShiftY}
^CWK,E:ARIAL.TTF
^CWB,E:ARI000.TTF
^CWM,E:LSB3.TTF
^FO15,86^GB410,427,2^FS
^FO64,84^GB0,423,3^FS
^FO188,87^GB0,425,3^FS
^FO247,87^GB0,425,3^FS
^FO368,87^GB0,425,3^FS
^FO593,86^GB107,426,3^FS
^FO775,64^GB0,477,3^FS
^FT54,497^AKB,38,^FDTALLA/SIZE^FS
^FT161,529^AKB,100^FB515,1,0,C^FD${safeSize || "M"}^FS
^FT232,575^AMB,44^FB550,1,0,C^FD${safeUpc || safeSku || "-"}^FS
${nameLines}
^FT413,559^AKB,36^FB550,1,0,C^FD${safeColorResolved || "COLOR"}^FS
^FO436,${bcY}^BY3,2^BAB,112,N,N^FD${safeSku || safeUpc}^FS
^FT581,559^AKB,38^FB550,1,0,C^FD${safeSku || safeUpc}^FS
^FT662,559^AMB,58^FB550,1,0,C^FD$${safePrice}^FS
^FT${b8.x},567^AKB,${b8.font}^FB550,1,0,C^FD${safeCountry}^FS
^RB${epcConfig.epcLength},${epcConfig.companyPrefixBits},${epcConfig.itemNumberBits},${epcConfig.serialBits}^FS
^RFW,E^FD${epcWrite.companyPrefix},${epcWrite.itemNumber},${epcWrite.serialNumber}^FS
^PQ1,0,1,Y
^XZ`;
}

export function generateBatchZpl(labels: GeneratedLabel[]) {
  return labels.map((label) => label.zpl).join("\n");
}

export function generateLabels({
  input,
  settings,
  serialNumbers,
}: {
  input: LabelInput;
  settings: RfidSettings;
  serialNumbers: number[];
}) {
  validateRfidSettings(settings);
  if (!input.lightspeedSystemId.trim()) {
    throw new Error("Lightspeed System ID is required.");
  }
  if (serialNumbers.length === 0) {
    throw new Error("No serial numbers reserved.");
  }

  const itemNumberBig = deriveItemNumber(input.lightspeedSystemId, settings.itemNumberBits);
  const itemNumber = Number(itemNumberBig.toString());
  const epcLength = epcBitTotal(settings);

  const labels = serialNumbers.map((serialNumber) => {
    const epc = buildEpc({
      companyPrefix: settings.companyPrefix,
      companyPrefixBits: settings.companyPrefixBits,
      itemNumber: itemNumberBig,
      itemNumberBits: settings.itemNumberBits,
      serialNumber,
      serialBits: settings.serialBits,
    });

    const zpl = generateLabelZpl({
      input,
      settings,
      epcConfig: {
        epcLength,
        companyPrefixBits: settings.companyPrefixBits,
        itemNumberBits: settings.itemNumberBits,
        serialBits: settings.serialBits,
      },
      epcWrite: {
        companyPrefix: settings.companyPrefix,
        itemNumber,
        serialNumber,
      },
    });

    return {
      epc: epc.epcHex,
      epcDecimal: epc.epcDecimal,
      serialNumber,
      zpl,
    } satisfies GeneratedLabel;
  });

  return {
    labels,
    itemNumber,
    batchZpl: generateBatchZpl(labels),
  };
}

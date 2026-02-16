export const LABEL_WIDTH_DOTS = 812;
export const LABEL_HEIGHT_DOTS = 594;
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
  printerPort: 9100,
  labelWidthDots: LABEL_WIDTH_DOTS,
  labelHeightDots: LABEL_HEIGHT_DOTS,
  labelShiftX: 0,
  labelShiftY: 0,
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

function splitVerticalColumns(description: string, color: string, size: string) {
  const words = sanitizeZpl(description)
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);
  const excluded = [sanitizeZpl(color), sanitizeZpl(size)]
    .join(" ")
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);

  const filteredWords = words.filter((word) => !excluded.includes(word));

  if (filteredWords.length === 0) return ["ITEM", ""] as const;
  if (filteredWords.length === 1) return [sanitizeZpl(filteredWords[0]), ""] as const;
  if (filteredWords.length === 2) {
    return [sanitizeZpl(filteredWords[0]), sanitizeZpl(filteredWords[1])] as const;
  }

  const half = Math.ceil(filteredWords.length / 2);
  const line1 = sanitizeZpl(filteredWords.slice(0, half).join(" "));
  const line2 = sanitizeZpl(filteredWords.slice(half).join(" "));
  return [line1, line2] as const;
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

  if (unique.length === 0) return "XS, S, M, L";
  return unique.join(", ");
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
  const [line1, line2] = splitVerticalColumns(input.itemName, safeColorResolved, safeSize);
  const barcodeY = safeSku.length === 13 ? 95 : 125;

  return `^XA
^CI28
^PON
^FWN
^MNY
^PW${settings.labelWidthDots}
^LL${settings.labelHeightDots}
^MD20
^LH0,0
^LS${settings.labelShiftX}
^LT${settings.labelShiftY}
^CWK,E:ARIAL.TTF

^FO34,79^GB410,427,2^FS
^FO83,77^GB0,423,3^FS
^FO207,80^GB0,425,3^FS
^FO266,80^GB0,425,3^FS
^FO325,80^GB0,425,3^FS
^FO387,80^GB0,425,3^FS
^FO612,79^GB107,426,3^FS
^FO783,57^GB0,477,3^FS

^FT73,490^AKB,38,^FDTALLA/SIZE^FS
^FT194,522^AKB,134^FB515,1,0,C^FD${safeSize}^FS
^FT253,590^AKB,36^FB600,1,0,C^FD${safeUpc}^FS
^FT313,552^AKB,36^FB550,1,0,C^FD${line1}^FS
^FT373,552^AKB,36^FB550,1,0,C^FD${line2}^FS
^FT432,552^AKB,36^FB550,1,0,C^FD${safeColorResolved}^FS

^FO455,${barcodeY}^BY2,2^BCB,110,N,N,N^FD${safeSku}^FS
^FT600,552^AKB,32^FB550,1,0,C^FD${safeSku}^FS
^FT687,552^AKB,60^FB550,1,0,C^FD$${safePrice}^FS
^FT765,552^AKB,38^FB550,1,0,C^FD${safeCountry}^FS

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

import type { LabelMapping, RfidSettings } from "@/lib/rfid";
import { DEFAULT_RFID_SETTINGS, coerceRfidSettings, normalizeEpc } from "@/lib/rfid";

type RfidStoreState = {
  settings: RfidSettings;
  lastSerial: number;
  mappingSeq: number;
  mappings: LabelMapping[];
};

const MAX_MAPPINGS = 8_000;

declare global {
  var __carbonRfidStoreState: RfidStoreState | undefined;
}

function initStore(): RfidStoreState {
  return {
    settings: { ...DEFAULT_RFID_SETTINGS },
    lastSerial: 0,
    mappingSeq: 0,
    mappings: [],
  };
}

function getStore() {
  if (!globalThis.__carbonRfidStoreState) {
    globalThis.__carbonRfidStoreState = initStore();
  }
  return globalThis.__carbonRfidStoreState;
}

export function getRfidSettings() {
  return { ...getStore().settings };
}

export function setRfidSettings(next: RfidSettings) {
  const store = getStore();
  store.settings = coerceRfidSettings(next);
  return { ...store.settings };
}

export function reserveSerialNumbers(qty: number) {
  const store = getStore();
  const safeQty = Math.max(1, Math.min(500, Math.trunc(qty)));
  const start = store.lastSerial + 1;
  const end = store.lastSerial + safeQty;
  store.lastSerial = end;
  return Array.from({ length: safeQty }, (_, idx) => start + idx);
}

type InsertMappingInput = Omit<LabelMapping, "id" | "printedAt" | "epc"> & {
  epc: string;
  printedAt?: string;
};

export function insertMappings(mappings: InsertMappingInput[]) {
  const store = getStore();
  const inserted: LabelMapping[] = [];

  for (const row of mappings) {
    store.mappingSeq += 1;
    inserted.push({
      id: store.mappingSeq,
      epc: normalizeEpc(row.epc),
      lightspeedSystemId: String(row.lightspeedSystemId || "").trim(),
      itemNumber: Number(row.itemNumber) || 0,
      serialNumber: Number(row.serialNumber) || 0,
      itemName: String(row.itemName || "").trim(),
      upc: String(row.upc || "").trim(),
      customSku: String(row.customSku || "").trim(),
      color: String(row.color || "").trim(),
      size: String(row.size || "").trim(),
      retailPrice: String(row.retailPrice || "").trim(),
      countryCode: String(row.countryCode || "").trim(),
      printedAt: String(row.printedAt || new Date().toISOString()),
      zpl: String(row.zpl || ""),
    });
  }

  if (inserted.length > 0) {
    const normalizedSet = new Set(inserted.map((row) => row.epc));
    store.mappings = store.mappings.filter((row) => !normalizedSet.has(row.epc));
    store.mappings.push(...inserted);
    if (store.mappings.length > MAX_MAPPINGS) {
      store.mappings = store.mappings.slice(store.mappings.length - MAX_MAPPINGS);
    }
  }

  return inserted;
}

export function findMappingByEpc(epc: string) {
  const normalized = normalizeEpc(epc);
  if (!normalized) return null;
  const store = getStore();
  const row = store.mappings.find((item) => item.epc === normalized);
  return row ? { ...row } : null;
}

export function getRecentMappings(limit = 50) {
  const store = getStore();
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  return [...store.mappings]
    .sort((a, b) => b.id - a.id)
    .slice(0, safeLimit)
    .map((row) => ({ ...row }));
}

function normalizeSkuKey(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function stripLeadingC(value: string) {
  return value.startsWith("c") ? value.slice(1) : value;
}

function skuMatches(left: unknown, right: unknown) {
  const leftKey = normalizeSkuKey(left);
  const rightKey = normalizeSkuKey(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  // Keep lookup tolerant for catalogs where one side drops leading "C".
  return stripLeadingC(leftKey) === stripLeadingC(rightKey);
}

export function getMappingsByCustomSku(customSku: string, limit = 500) {
  const needle = String(customSku ?? "").trim();
  if (!needle) return [];

  const store = getStore();
  const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
  return [...store.mappings]
    .filter((row) => skuMatches(row.customSku, needle))
    .sort((a, b) => b.id - a.id)
    .slice(0, safeLimit)
    .map((row) => ({ ...row }));
}

function toTimestamp(value: string | undefined) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function getMappingLogsPage({
  page = 1,
  pageSize = 20,
  from,
  to,
  details,
}: {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  details?: string;
}) {
  const store = getStore();
  const safePageSize = Math.max(1, Math.min(20, Math.trunc(pageSize || 20)));
  const safePage = Math.max(1, Math.trunc(page || 1));
  const fromTs = toTimestamp(from);
  const toTs = toTimestamp(to);
  const detailsQuery = String(details || "")
    .trim()
    .toLowerCase();

  const filtered = [...store.mappings]
    .sort((a, b) => b.id - a.id)
    .filter((row) => {
      const printedTs = toTimestamp(row.printedAt);
      if (fromTs !== null && (printedTs === null || printedTs < fromTs)) return false;
      if (toTs !== null && (printedTs === null || printedTs > toTs)) return false;
      if (!detailsQuery) return true;
      const haystack = [
        row.epc,
        row.lightspeedSystemId,
        row.itemName,
        row.customSku,
        row.upc,
        row.color,
        row.size,
        row.countryCode,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(detailsQuery);
    });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const start = (currentPage - 1) * safePageSize;
  const mappings = filtered.slice(start, start + safePageSize).map((row) => ({ ...row }));

  return {
    page: currentPage,
    pageSize: safePageSize,
    total,
    totalPages,
    mappings,
  };
}

"use client";

import { useEffect, useMemo, useState } from "react";

type BuilderRow = {
  id: string;
  barcodeNumber: string;
  systemId: string;
  styleNumber: string;
  description: string;
  fabric: string;
  sizeRatio: string;
  color: string;
  srp: string;
  size: string;
  poQty: string;
  extraLabels: string;
};

type PurchaseOrderRow = {
  codeNumber: string;
  styleNumber: string;
  description: string;
  fabric: string;
  sizeRatio: string;
  color: string;
  poQty: number;
  extraLabels: number;
  labelQty: number;
};

type EpcRow = {
  codeNumber: string;
  barcodeNumber: string;
  systemId: string;
  styleNumber: string;
  description: string;
  fabric: string;
  sizeRatio: string;
  color: string;
  srp: string;
  size: string;
  epc: string;
  serialNumber: number;
};

type EpcConfig = {
  companyPrefixHex: string;
  companyPrefixBits: string;
  itemNumberBits: string;
  serialBits: string;
  startSerial: string;
};

type MatrixItemRowResult = {
  barcodeNumber: string;
  systemId: string;
  itemId: string;
  matrixId: string;
  status: "created" | "updated" | "existing" | "failed";
  message: string;
};

type MatrixItemsResponse = {
  ok: boolean;
  createdMatrices: number;
  createdItems: number;
  updatedItems: number;
  existingItems: number;
  failures: number;
  rows: MatrixItemRowResult[];
  error?: string;
};

const STORAGE_ROWS_KEY = "create_items_rows_v1";
const STORAGE_CONFIG_KEY = "create_items_config_v1";

const DEFAULT_CONFIG: EpcConfig = {
  companyPrefixHex: "F0A0B",
  companyPrefixBits: "20",
  itemNumberBits: "40",
  serialBits: "36",
  startSerial: "100000",
};

const EMPTY_ROW: BuilderRow = {
  id: "",
  barcodeNumber: "",
  systemId: "",
  styleNumber: "",
  description: "",
  fabric: "",
  sizeRatio: "",
  color: "",
  srp: "",
  size: "",
  poQty: "0",
  extraLabels: "0",
};

function newRow(seed?: Partial<BuilderRow>): BuilderRow {
  return {
    ...EMPTY_ROW,
    ...seed,
    id: crypto.randomUUID(),
  };
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: string) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ");
}

function toNonNegativeInt(value: unknown) {
  const parsed = Number.parseInt(normalizeText(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function toCsvCell(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, headers: string[], rows: Array<Array<unknown>>) {
  const lines = [headers.join(","), ...rows.map((row) => row.map((cell) => toCsvCell(cell)).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function deriveCodeNumber(barcodeNumber: string) {
  return normalizeText(barcodeNumber).slice(0, 7);
}

function mask(bits: number) {
  const one = BigInt(1);
  return (one << BigInt(bits)) - one;
}

function fnv1a64(input: string) {
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const max64 = BigInt("0xffffffffffffffff");
  const bytes = new TextEncoder().encode(input);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & max64;
  }
  return hash;
}

function deriveItemNumber(systemId: string, bits: number) {
  const normalized = normalizeText(systemId);
  if (!normalized) throw new Error("System ID is required.");
  if (/^\d+$/.test(normalized)) return BigInt(normalized) & mask(bits);
  return fnv1a64(normalized) & mask(bits);
}

function parseCompanyPrefixHex(hexValue: string) {
  const clean = normalizeText(hexValue).replace(/^0x/i, "").replace(/[^0-9a-fA-F]/g, "");
  if (!clean) throw new Error("Company prefix (hex) is required.");
  return BigInt(`0x${clean}`);
}

function buildEpcHex({
  companyPrefix,
  companyPrefixBits,
  itemNumber,
  itemNumberBits,
  serialNumber,
  serialBits,
}: {
  companyPrefix: bigint;
  companyPrefixBits: number;
  itemNumber: bigint;
  itemNumberBits: number;
  serialNumber: number;
  serialBits: number;
}) {
  const serial = BigInt(serialNumber);
  if (companyPrefix > mask(companyPrefixBits)) throw new Error(`Company prefix exceeds ${companyPrefixBits} bits.`);
  if (itemNumber > mask(itemNumberBits)) throw new Error(`System ID exceeds ${itemNumberBits} bits.`);
  if (serial > mask(serialBits)) throw new Error(`Serial number exceeds ${serialBits} bits.`);

  const value =
    (companyPrefix << BigInt(itemNumberBits + serialBits)) |
    ((itemNumber & mask(itemNumberBits)) << BigInt(serialBits)) |
    (serial & mask(serialBits));

  const hexChars = Math.ceil((companyPrefixBits + itemNumberBits + serialBits) / 4);
  return value.toString(16).toUpperCase().padStart(hexChars, "0");
}

function parseDelimitedLine(line: string, delimiter: string) {
  if (delimiter !== ",") return line.split(delimiter).map((cell) => cell.trim());

  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function findColumnIndex(headers: string[], aliases: string[]) {
  const aliasSet = new Set(aliases.map((alias) => normalizeHeader(alias)));
  return headers.findIndex((header) => aliasSet.has(normalizeHeader(header)));
}

function parsePastedRows(input: string) {
  const lines = String(input || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const matrix = lines.map((line) => parseDelimitedLine(line, delimiter));
  if (!matrix.length) return [];

  const headerRow = matrix[0];
  const col = {
    barcodeNumber: findColumnIndex(headerRow, ["barcode", "barcode number", "custom sku", "sku"]),
    systemId: findColumnIndex(headerRow, ["system id", "lightspeed system id", "systemid"]),
    styleNumber: findColumnIndex(headerRow, ["style", "style number"]),
    description: findColumnIndex(headerRow, ["description", "item name"]),
    fabric: findColumnIndex(headerRow, ["fabric"]),
    sizeRatio: findColumnIndex(headerRow, ["size ratio", "size ratio per pack"]),
    color: findColumnIndex(headerRow, ["color"]),
    srp: findColumnIndex(headerRow, ["srp", "retail price", "price"]),
    size: findColumnIndex(headerRow, ["size"]),
    poQty: findColumnIndex(headerRow, ["po qty", "purchase qty", "qty", "quantity"]),
    extraLabels: findColumnIndex(headerRow, ["extra labels", "extra", "buffer", "buffer labels"]),
  };

  const hasHeaders = Object.values(col).some((idx) => idx >= 0);
  const startAt = hasHeaders ? 1 : 0;

  const fallback = {
    barcodeNumber: 0,
    systemId: 1,
    styleNumber: 2,
    description: 3,
    fabric: 4,
    sizeRatio: 5,
    color: 6,
    srp: 7,
    size: 8,
    poQty: 9,
    extraLabels: 10,
  };

  function pick(row: string[], index: number, fallbackIndex: number) {
    const finalIndex = index >= 0 ? index : fallbackIndex;
    return normalizeText(row[finalIndex] || "");
  }

  const rows: BuilderRow[] = [];
  for (let i = startAt; i < matrix.length; i += 1) {
    const source = matrix[i];
    const row = newRow({
      barcodeNumber: pick(source, col.barcodeNumber, fallback.barcodeNumber),
      systemId: pick(source, col.systemId, fallback.systemId),
      styleNumber: pick(source, col.styleNumber, fallback.styleNumber),
      description: pick(source, col.description, fallback.description),
      fabric: pick(source, col.fabric, fallback.fabric),
      sizeRatio: pick(source, col.sizeRatio, fallback.sizeRatio),
      color: pick(source, col.color, fallback.color),
      srp: pick(source, col.srp, fallback.srp),
      size: pick(source, col.size, fallback.size),
      poQty: pick(source, col.poQty, fallback.poQty) || "0",
      extraLabels: pick(source, col.extraLabels, fallback.extraLabels) || "0",
    });

    if (!row.barcodeNumber && !row.systemId && !row.description && !row.color) continue;
    rows.push(row);
  }
  return rows;
}

export default function CreateNewItemsWorkspace() {
  const [rows, setRows] = useState<BuilderRow[]>([newRow()]);
  const [config, setConfig] = useState<EpcConfig>(DEFAULT_CONFIG);
  const [pasteValue, setPasteValue] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [lightspeedBusy, setLightspeedBusy] = useState(false);
  const [lightspeedRows, setLightspeedRows] = useState<MatrixItemRowResult[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [purchaseRows, setPurchaseRows] = useState<PurchaseOrderRow[]>([]);
  const [epcRows, setEpcRows] = useState<EpcRow[]>([]);
  const [serialRange, setSerialRange] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    try {
      const rawRows = window.localStorage.getItem(STORAGE_ROWS_KEY);
      const rawConfig = window.localStorage.getItem(STORAGE_CONFIG_KEY);
      if (rawRows) {
        const parsed = JSON.parse(rawRows) as Array<Partial<BuilderRow>>;
        const normalized = parsed
          .map((row) =>
            newRow({
              barcodeNumber: normalizeText(row.barcodeNumber),
              systemId: normalizeText(row.systemId),
              styleNumber: normalizeText(row.styleNumber),
              description: normalizeText(row.description),
              fabric: normalizeText(row.fabric),
              sizeRatio: normalizeText(row.sizeRatio),
              color: normalizeText(row.color),
              srp: normalizeText(row.srp),
              size: normalizeText(row.size),
              poQty: normalizeText(row.poQty || "0"),
              extraLabels: normalizeText(row.extraLabels || "0"),
            })
          )
          .filter((row) => row.barcodeNumber || row.systemId || row.description);
        if (normalized.length) setRows(normalized);
      }
      if (rawConfig) {
        const parsed = JSON.parse(rawConfig) as Partial<EpcConfig>;
        setConfig({
          companyPrefixHex: normalizeText(parsed.companyPrefixHex || DEFAULT_CONFIG.companyPrefixHex),
          companyPrefixBits: normalizeText(parsed.companyPrefixBits || DEFAULT_CONFIG.companyPrefixBits),
          itemNumberBits: normalizeText(parsed.itemNumberBits || DEFAULT_CONFIG.itemNumberBits),
          serialBits: normalizeText(parsed.serialBits || DEFAULT_CONFIG.serialBits),
          startSerial: normalizeText(parsed.startSerial || DEFAULT_CONFIG.startSerial),
        });
      }
    } catch {
      // Ignore local storage issues.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_ROWS_KEY, JSON.stringify(rows));
      window.localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
    } catch {
      // Ignore local storage issues.
    }
  }, [rows, config, hydrated]);

  const totals = useMemo(() => {
    const variants = rows.filter((row) => normalizeText(row.barcodeNumber)).length;
    const poQtyTotal = rows.reduce((sum, row) => sum + toNonNegativeInt(row.poQty), 0);
    const extraLabelsTotal = rows.reduce((sum, row) => sum + toNonNegativeInt(row.extraLabels), 0);
    return {
      variants,
      poQtyTotal,
      extraLabelsTotal,
      labelQtyTotal: poQtyTotal + extraLabelsTotal,
    };
  }, [rows]);

  function updateRow(rowId: string, field: keyof BuilderRow, value: string) {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(rowId: string) {
    setRows((prev) => {
      const next = prev.filter((row) => row.id !== rowId);
      return next.length ? next : [newRow()];
    });
  }

  function clearRows() {
    setRows([newRow()]);
    setLightspeedRows([]);
    setPurchaseRows([]);
    setEpcRows([]);
    setSerialRange(null);
    setStatus("Rows cleared.");
    setError("");
  }

  function loadPastedRows() {
    try {
      const parsed = parsePastedRows(pasteValue);
      if (!parsed.length) throw new Error("No valid rows found in pasted input.");
      setRows(parsed);
      setLightspeedRows([]);
      setStatus(`Loaded ${parsed.length} rows from pasted text.`);
      setError("");
    } catch (e: any) {
      setStatus("");
      setError(String(e?.message || "Unable to parse pasted rows."));
    }
  }

  async function createInLightspeedMatrix() {
    const payloadRows = rows
      .map((row) => ({
        barcodeNumber: normalizeText(row.barcodeNumber),
        styleNumber: normalizeText(row.styleNumber),
        description: normalizeText(row.description),
        color: normalizeText(row.color),
        size: normalizeText(row.size),
        srp: normalizeText(row.srp),
      }))
      .filter((row) => row.barcodeNumber);

    if (!payloadRows.length) {
      setStatus("");
      setError("Add at least one row with barcode before creating in Lightspeed.");
      return;
    }

    setLightspeedBusy(true);
    setStatus("Creating/updating matrix items in Lightspeed...");
    setError("");
    try {
      const resp = await fetch("/api/lightspeed/matrix-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forceMatrix: true,
          rows: payloadRows,
        }),
      });

      const json = (await resp.json().catch(() => ({}))) as Partial<MatrixItemsResponse>;
      if (!resp.ok || !json || json.ok !== true) {
        throw new Error(
          normalizeText(json?.error) || "Unable to create matrix items in Lightspeed."
        );
      }

      const resultRows = Array.isArray(json.rows) ? json.rows : [];
      setLightspeedRows(resultRows);

      const byBarcode = new Map<string, MatrixItemRowResult>();
      for (const resultRow of resultRows) {
        const key = normalizeText(resultRow.barcodeNumber).toLowerCase();
        if (!key) continue;
        byBarcode.set(key, resultRow);
      }

      setRows((prev) =>
        prev.map((row) => {
          const key = normalizeText(row.barcodeNumber).toLowerCase();
          if (!key) return row;
          const match = byBarcode.get(key);
          if (!match || !normalizeText(match.systemId)) return row;
          return { ...row, systemId: normalizeText(match.systemId) };
        })
      );

      const createdMatrices = Number(json.createdMatrices || 0);
      const createdItems = Number(json.createdItems || 0);
      const updatedItems = Number(json.updatedItems || 0);
      const existingItems = Number(json.existingItems || 0);
      const failures = Number(json.failures || 0);

      const failureMessages = resultRows
        .filter((row) => row.status === "failed" && normalizeText(row.message))
        .slice(0, 3)
        .map((row) => `${row.barcodeNumber}: ${row.message}`);

      setStatus(
        `Lightspeed sync finished. Matrices ${createdMatrices}, created ${createdItems}, updated ${updatedItems}, existing ${existingItems}, failed ${failures}.`
      );
      if (failureMessages.length) {
        setError(failureMessages.join(" | "));
      } else {
        setError("");
      }
    } catch (e: any) {
      setStatus("");
      setError(String(e?.message || "Unable to create matrix items in Lightspeed."));
    } finally {
      setLightspeedBusy(false);
    }
  }

  function generate() {
    setStatus("");
    setError("");
    try {
      const companyPrefixBits = toNonNegativeInt(config.companyPrefixBits);
      const itemNumberBits = toNonNegativeInt(config.itemNumberBits);
      const serialBits = toNonNegativeInt(config.serialBits);
      const startSerial = toNonNegativeInt(config.startSerial);
      const totalBits = companyPrefixBits + itemNumberBits + serialBits;
      if (totalBits !== 96) {
        throw new Error(`EPC bits must total 96 (currently ${totalBits}).`);
      }

      const companyPrefix = parseCompanyPrefixHex(config.companyPrefixHex);
      const nextEpcRows: EpcRow[] = [];
      const issues: string[] = [];
      let serial = startSerial;

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const barcode = normalizeText(row.barcodeNumber);
        const systemId = normalizeText(row.systemId);
        const poQty = toNonNegativeInt(row.poQty);
        const extra = toNonNegativeInt(row.extraLabels);
        const labels = poQty + extra;
        if (!barcode && !systemId && labels <= 0) continue;
        if (!barcode || !systemId) {
          issues.push(`Row ${i + 1}: missing barcode or system ID.`);
          continue;
        }
        if (labels <= 0) continue;

        const codeNumber = deriveCodeNumber(barcode);
        const itemNumber = deriveItemNumber(systemId, itemNumberBits);
        for (let copy = 0; copy < labels; copy += 1) {
          const epc = buildEpcHex({
            companyPrefix,
            companyPrefixBits,
            itemNumber,
            itemNumberBits,
            serialNumber: serial,
            serialBits,
          });
          nextEpcRows.push({
            codeNumber,
            barcodeNumber: barcode,
            systemId,
            styleNumber: normalizeText(row.styleNumber),
            description: normalizeText(row.description),
            fabric: normalizeText(row.fabric),
            sizeRatio: normalizeText(row.sizeRatio),
            color: normalizeText(row.color),
            srp: normalizeText(row.srp),
            size: normalizeText(row.size),
            epc,
            serialNumber: serial,
          });
          serial += 1;
        }
      }

      const grouped = new Map<string, PurchaseOrderRow>();
      for (const row of rows) {
        const poQty = toNonNegativeInt(row.poQty);
        const extra = toNonNegativeInt(row.extraLabels);
        const labels = poQty + extra;
        if (poQty <= 0 && labels <= 0) continue;
        const codeNumber = deriveCodeNumber(row.barcodeNumber);
        const key = [
          codeNumber,
          normalizeText(row.styleNumber),
          normalizeText(row.description),
          normalizeText(row.fabric),
          normalizeText(row.sizeRatio),
          normalizeText(row.color),
        ].join("|");
        const existing = grouped.get(key);
        if (!existing) {
          grouped.set(key, {
            codeNumber,
            styleNumber: normalizeText(row.styleNumber),
            description: normalizeText(row.description),
            fabric: normalizeText(row.fabric),
            sizeRatio: normalizeText(row.sizeRatio),
            color: normalizeText(row.color),
            poQty,
            extraLabels: extra,
            labelQty: labels,
          });
        } else {
          existing.poQty += poQty;
          existing.extraLabels += extra;
          existing.labelQty += labels;
        }
      }

      const nextPurchaseRows = [...grouped.values()].sort((a, b) => {
        const codeDiff = a.codeNumber.localeCompare(b.codeNumber);
        if (codeDiff !== 0) return codeDiff;
        return a.color.localeCompare(b.color);
      });

      setPurchaseRows(nextPurchaseRows);
      setEpcRows(nextEpcRows);
      setSerialRange(
        nextEpcRows.length
          ? { start: nextEpcRows[0].serialNumber, end: nextEpcRows[nextEpcRows.length - 1].serialNumber }
          : null
      );
      if (issues.length) {
        setError(`${issues.slice(0, 4).join(" ")}${issues.length > 4 ? " ..." : ""}`);
      }
      setStatus(
        `Generated ${nextPurchaseRows.length} purchase rows and ${nextEpcRows.length} EPC rows.`
      );
    } catch (e: any) {
      setError(String(e?.message || "Unable to generate sheets."));
    }
  }

  function exportPurchaseOrderCsv() {
    if (!purchaseRows.length) return;
    downloadCsv(
      `purchase-order-simplified-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`,
      [
        "Code Number",
        "Style Number",
        "Description",
        "Fabric",
        "Size Ratio",
        "Color",
        "PO Qty",
        "Extra Labels",
        "Label Qty",
      ],
      purchaseRows.map((row) => [
        row.codeNumber,
        row.styleNumber,
        row.description,
        row.fabric,
        row.sizeRatio,
        row.color,
        row.poQty,
        row.extraLabels,
        row.labelQty,
      ])
    );
  }

  function exportEpcCsv() {
    if (!epcRows.length) return;
    downloadCsv(
      `epc-sheet-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`,
      [
        "CODE NUMBER",
        "BARCODE NUMBER",
        "SYSTEM ID",
        "STYLE NUMBER",
        "DESCRIPTION",
        "FABRIC",
        "SIZE RATIO",
        "COLOR",
        "SRP",
        "SIZE",
        "EPC",
      ],
      epcRows.map((row) => [
        row.codeNumber,
        row.barcodeNumber,
        row.systemId,
        row.styleNumber,
        row.description,
        row.fabric,
        row.sizeRatio,
        row.color,
        row.srp,
        row.size,
        row.epc,
      ])
    );
  }

  return (
    <main className="page">
      <section className="glass-panel card paste-card">
        <h3>Paste Rows (Optional)</h3>
        <p className="hint">
          Excel-style tab rows: barcode, system ID, style, description, fabric, size ratio, color,
          SRP, size, PO qty, extra labels.
        </p>
        <textarea
          rows={6}
          value={pasteValue}
          onChange={(e) => setPasteValue(e.target.value)}
          placeholder="112580348S[TAB]210000008455[TAB]03[TAB]TONY PANTS[TAB]100% POLYESTER[TAB]S M L XL[TAB]STONE[TAB]92.5[TAB]S[TAB]3[TAB]1"
        />
        <div className="actions">
          <button className="btn-base btn-primary" onClick={loadPastedRows}>
            Load Pasted Rows
          </button>
          <button className="btn-base btn-outline" onClick={() => setPasteValue("")}>
            Clear Paste
          </button>
        </div>
      </section>

      <section className="glass-panel card data-card">
        <h3>Data</h3>
        <div className="actions">
          <button
            className="btn-base btn-primary"
            onClick={createInLightspeedMatrix}
            disabled={lightspeedBusy}
          >
            {lightspeedBusy ? "Creating Matrix Items..." : "Create in Lightspeed (Matrix)"}
          </button>
          <button className="btn-base btn-outline" onClick={addRow}>
            Add Row
          </button>
          <button className="btn-base btn-outline" onClick={clearRows}>
            Reset Rows
          </button>
        </div>
        <div className="table-wrap data-table-wrap">
          <table className="data-table">
            <colgroup>
              <col className="col-barcode" />
              <col className="col-system" />
              <col className="col-style" />
              <col className="col-description" />
              <col className="col-fabric" />
              <col className="col-ratio" />
              <col className="col-color" />
              <col className="col-srp" />
              <col className="col-size" />
              <col className="col-poqty" />
              <col className="col-extra" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Barcode</th>
                <th>System ID</th>
                <th>Style</th>
                <th>Description</th>
                <th>Fabric</th>
                <th>Size Ratio</th>
                <th>Color</th>
                <th>SRP</th>
                <th>Size</th>
                <th>PO Qty</th>
                <th>Extra</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><input value={row.barcodeNumber} onChange={(e) => updateRow(row.id, "barcodeNumber", e.target.value)} /></td>
                  <td><input value={row.systemId} onChange={(e) => updateRow(row.id, "systemId", e.target.value)} /></td>
                  <td><input value={row.styleNumber} onChange={(e) => updateRow(row.id, "styleNumber", e.target.value)} /></td>
                  <td><input value={row.description} onChange={(e) => updateRow(row.id, "description", e.target.value)} /></td>
                  <td><input value={row.fabric} onChange={(e) => updateRow(row.id, "fabric", e.target.value)} /></td>
                  <td><input value={row.sizeRatio} onChange={(e) => updateRow(row.id, "sizeRatio", e.target.value)} /></td>
                  <td><input value={row.color} onChange={(e) => updateRow(row.id, "color", e.target.value)} /></td>
                  <td><input value={row.srp} onChange={(e) => updateRow(row.id, "srp", e.target.value)} /></td>
                  <td><input value={row.size} onChange={(e) => updateRow(row.id, "size", e.target.value)} /></td>
                  <td><input value={row.poQty} onChange={(e) => updateRow(row.id, "poQty", e.target.value)} /></td>
                  <td><input value={row.extraLabels} onChange={(e) => updateRow(row.id, "extraLabels", e.target.value)} /></td>
                  <td>
                    <button className="btn-base btn-outline mini row-remove-btn" onClick={() => removeRow(row.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-panel card epc-card">
        <h3>EPC Settings</h3>
        <div className="grid">
          <label>
            <span className="control-label">Company Prefix (Hex)</span>
            <input
              value={config.companyPrefixHex}
              onChange={(e) => setConfig((prev) => ({ ...prev, companyPrefixHex: e.target.value }))}
            />
          </label>
          <label>
            <span className="control-label">Company Prefix Bits</span>
            <input
              value={config.companyPrefixBits}
              onChange={(e) => setConfig((prev) => ({ ...prev, companyPrefixBits: e.target.value }))}
            />
          </label>
          <label>
            <span className="control-label">Item Bits</span>
            <input
              value={config.itemNumberBits}
              onChange={(e) => setConfig((prev) => ({ ...prev, itemNumberBits: e.target.value }))}
            />
          </label>
          <label>
            <span className="control-label">Serial Bits</span>
            <input
              value={config.serialBits}
              onChange={(e) => setConfig((prev) => ({ ...prev, serialBits: e.target.value }))}
            />
          </label>
          <label>
            <span className="control-label">Start Serial</span>
            <input
              value={config.startSerial}
              onChange={(e) => setConfig((prev) => ({ ...prev, startSerial: e.target.value }))}
            />
          </label>
        </div>
        <div className="totals">
          <span>Variants: {totals.variants}</span>
          <span>PO Qty: {totals.poQtyTotal}</span>
          <span>Extra Labels: {totals.extraLabelsTotal}</span>
          <span>Total Labels: {totals.labelQtyTotal}</span>
        </div>
        <div className="actions">
          <button className="btn-base btn-primary" onClick={generate}>
            Generate Sheets
          </button>
        </div>
        {status ? <p className="status">{status}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      {purchaseRows.length ? (
        <section className="glass-panel card results-card">
          <h3>Purchase Order Simplified</h3>
          <div className="actions">
            <button className="btn-base btn-outline" onClick={exportPurchaseOrderCsv}>
              Export Purchase Order CSV
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Style</th>
                  <th>Description</th>
                  <th>Fabric</th>
                  <th>Size Ratio</th>
                  <th>Color</th>
                  <th>PO Qty</th>
                  <th>Extra</th>
                  <th>Labels</th>
                </tr>
              </thead>
              <tbody>
                {purchaseRows.slice(0, 50).map((row, idx) => (
                  <tr key={`${row.codeNumber}-${row.color}-${idx}`}>
                    <td>{row.codeNumber}</td>
                    <td>{row.styleNumber}</td>
                    <td>{row.description}</td>
                    <td>{row.fabric}</td>
                    <td>{row.sizeRatio}</td>
                    <td>{row.color}</td>
                    <td>{row.poQty}</td>
                    <td>{row.extraLabels}</td>
                    <td>{row.labelQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">Preview shows first 50 rows.</p>
        </section>
      ) : null}

      {lightspeedRows.length ? (
        <section className="glass-panel card results-card">
          <h3>Lightspeed Sync Results</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Barcode</th>
                  <th>System ID</th>
                  <th>Item ID</th>
                  <th>Matrix ID</th>
                  <th>Status</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {lightspeedRows.slice(0, 80).map((row, idx) => (
                  <tr key={`${row.barcodeNumber}-${row.itemId || idx}`}>
                    <td>{row.barcodeNumber}</td>
                    <td>{row.systemId}</td>
                    <td>{row.itemId}</td>
                    <td>{row.matrixId}</td>
                    <td>{row.status}</td>
                    <td>{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">Preview shows first 80 rows.</p>
        </section>
      ) : null}

      {epcRows.length ? (
        <section className="glass-panel card results-card">
          <h3>EPC Sheet</h3>
          <div className="actions">
            <button className="btn-base btn-outline" onClick={exportEpcCsv}>
              Export EPC CSV
            </button>
          </div>
          {serialRange ? (
            <p className="hint">
              Serial range: {serialRange.start} to {serialRange.end}
            </p>
          ) : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Barcode</th>
                  <th>System ID</th>
                  <th>Style</th>
                  <th>Description</th>
                  <th>Color</th>
                  <th>Size</th>
                  <th>EPC</th>
                </tr>
              </thead>
              <tbody>
                {epcRows.slice(0, 60).map((row, idx) => (
                  <tr key={`${row.epc}-${idx}`}>
                    <td>{row.codeNumber}</td>
                    <td>{row.barcodeNumber}</td>
                    <td>{row.systemId}</td>
                    <td>{row.styleNumber}</td>
                    <td>{row.description}</td>
                    <td>{row.color}</td>
                    <td>{row.size}</td>
                    <td className="mono">{row.epc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">Preview shows first 60 rows.</p>
        </section>
      ) : null}

      <style jsx>{`
        .page {
          max-width: 1220px;
          margin: 0 auto;
          padding: 22px 8px 26px;
          display: grid;
          gap: 12px;
          color: #f8fafc;
        }
        .card {
          padding: 18px;
          display: grid;
          gap: 10px;
        }
        h3 {
          margin: 0;
          font-size: 1.95rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          line-height: 1.15;
        }
        .hint {
          margin: 0;
          color: rgba(226, 232, 240, 0.82);
          font-size: 0.94rem;
          line-height: 1.35;
        }
        .paste-card :global(textarea) {
          min-height: 205px;
          margin-top: 0;
        }
        .page :global(input:not([type="checkbox"]):not([type="radio"]):not([type="range"])),
        .page :global(textarea),
        .page :global(select) {
          text-transform: none;
        }
        .page :global(input:not([type="checkbox"]):not([type="radio"]):not([type="range"])::placeholder),
        .page :global(textarea::placeholder) {
          text-transform: none;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .actions :global(.btn-base) {
          min-height: 44px;
          padding: 0 14px;
        }
        .grid {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        }
        label {
          display: grid;
          gap: 4px;
        }
        .control-label {
          margin-bottom: 0;
        }
        .totals {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          font-size: 0.92rem;
          font-weight: 600;
          color: rgba(226, 232, 240, 0.9);
        }
        .table-wrap {
          overflow: auto;
          border-radius: 12px;
        }
        table {
          width: 100%;
          min-width: 1080px;
          border-collapse: collapse;
          font-size: 0.89rem;
        }
        th,
        td {
          padding: 8px 6px;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          vertical-align: middle;
        }
        th {
          font-size: 0.82rem;
          font-weight: 700;
          color: rgba(226, 232, 240, 0.9);
          white-space: nowrap;
        }
        .data-table-wrap {
          margin-top: 2px;
        }
        .data-table {
          min-width: 1240px;
        }
        .data-table :global(input) {
          min-height: 44px;
          padding: 8px 10px;
        }
        .col-barcode {
          width: 138px;
        }
        .col-system {
          width: 128px;
        }
        .col-style {
          width: 122px;
        }
        .col-description {
          width: 160px;
        }
        .col-fabric {
          width: 132px;
        }
        .col-ratio {
          width: 122px;
        }
        .col-color {
          width: 116px;
        }
        .col-srp {
          width: 112px;
        }
        .col-size {
          width: 90px;
        }
        .col-poqty {
          width: 104px;
        }
        .col-extra {
          width: 104px;
        }
        .col-actions {
          width: 94px;
        }
        .mini {
          min-height: 34px;
          padding: 0 10px;
          font-size: 0.8rem;
        }
        .row-remove-btn {
          width: 100%;
        }
        .results-card table {
          min-width: 980px;
        }
        .status,
        .error {
          margin: 0;
          border-radius: 12px;
          padding: 8px 10px;
          border: 1px solid transparent;
          font-size: 0.92rem;
          font-weight: 600;
        }
        .status {
          border-color: rgba(16, 185, 129, 0.32);
          background: rgba(16, 185, 129, 0.14);
          color: #a7f3d0;
        }
        .error {
          border-color: rgba(248, 113, 113, 0.32);
          background: rgba(220, 38, 38, 0.14);
          color: #fecaca;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
            "Courier New", monospace;
        }
        @media (max-width: 980px) {
          .page {
            padding: 20px 6px 22px;
          }
          .card {
            padding: 14px;
          }
          h3 {
            font-size: 1.5rem;
          }
          .grid {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          }
        }
      `}</style>
    </main>
  );
}

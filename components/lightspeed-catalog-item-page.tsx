"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ItemDetails = {
  itemId: string;
  systemId: string;
  name: string;
  image: string;
  upc: string;
  customSku: string;
  category: string;
  brand: string;
  defaultPrice: string;
  msrp: string;
};

type ItemDetailsResponse = {
  ok?: boolean;
  error?: string;
  item?: ItemDetails;
};

type RfidTagStatus = "live" | "killed" | "damaged";

type RfidTag = {
  epc: string;
  status: RfidTagStatus;
  lastSeenAt: string | null;
  lastSeenSource?: string;
};

type ItemRfidResponse = {
  ok?: boolean;
  error?: string;
  tags?: RfidTag[];
  meta?: {
    placeholder?: boolean;
    message?: string;
  };
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function formatPrice(value: string) {
  const raw = normalizeText(value);
  if (!raw) return "-";
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return raw;
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatLastSeen(value: string | null | undefined) {
  const raw = normalizeText(value);
  if (!raw) return "-";
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return raw;
  return new Date(parsed).toLocaleString();
}

export default function LightspeedCatalogItemPage({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<ItemDetails | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [rfidBusy, setRfidBusy] = useState(false);
  const [rfidError, setRfidError] = useState("");
  const [rfidTags, setRfidTags] = useState<RfidTag[]>([]);
  const [rfidNote, setRfidNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setBusy(true);
      setError("");
      try {
        const resp = await fetch(`/api/lightspeed/catalog/item/${encodeURIComponent(itemId)}`, {
          cache: "no-store",
        });
        const json = (await resp.json().catch(() => ({}))) as ItemDetailsResponse;
        if (!resp.ok) throw new Error(normalizeText(json?.error) || "Unable to load item details.");
        if (!cancelled) setItem(json?.item || null);
      } catch (e: any) {
        if (!cancelled) {
          setItem(null);
          setError(String(e?.message || "Unable to load item details."));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  useEffect(() => {
    let cancelled = false;
    const customSku = normalizeText(item?.customSku);
    if (!customSku) {
      setRfidBusy(false);
      setRfidError("");
      setRfidTags([]);
      setRfidNote("No Custom SKU found for this item yet.");
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      setRfidBusy(true);
      setRfidError("");
      setRfidNote("");
      try {
        const params = new URLSearchParams({ customSku });
        const resp = await fetch(
          `/api/lightspeed/catalog/item/${encodeURIComponent(itemId)}/rfid?${params.toString()}`,
          { cache: "no-store" }
        );
        const json = (await resp.json().catch(() => ({}))) as ItemRfidResponse;
        if (!resp.ok) throw new Error(normalizeText(json?.error) || "Unable to load RFID tags.");
        if (!cancelled) {
          setRfidTags(Array.isArray(json?.tags) ? json.tags : []);
          setRfidNote(normalizeText(json?.meta?.message));
        }
      } catch (e: any) {
        if (!cancelled) {
          setRfidTags([]);
          setRfidError(String(e?.message || "Unable to load RFID tags."));
          setRfidNote("");
        }
      } finally {
        if (!cancelled) setRfidBusy(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [itemId, item?.customSku]);

  const title = useMemo(() => normalizeText(item?.name) || "Lightspeed Item", [item?.name]);

  return (
    <main className="page">
      <section className="glass-panel card header-card">
        <div className="header-row">
          <h2>{title}</h2>
          <Link className="btn-base btn-outline back-btn" href="/studio/lightspeed-catalog">
            Back To Catalog
          </Link>
        </div>
      </section>

      {busy ? (
        <section className="glass-panel card">
          <p className="hint">Loading item details...</p>
        </section>
      ) : error ? (
        <section className="glass-panel card">
          <p className="error">{error}</p>
        </section>
      ) : item ? (
        <section className="glass-panel card details-card">
          <div className="media-pane">
            {item.image ? (
              <img src={item.image} alt={item.name || "Lightspeed item"} />
            ) : (
              <div className="image-placeholder">No image</div>
            )}
          </div>

          <div className="details-pane">
            <div className="detail-row">
              <span>Name</span>
              <strong>{item.name || "-"}</strong>
            </div>
            <div className="detail-row">
              <span>System ID</span>
              <strong>{item.systemId || "-"}</strong>
            </div>
            <div className="detail-row">
              <span>UPC</span>
              <strong>{item.upc || "-"}</strong>
            </div>
            <div className="detail-row">
              <span>Custom SKU</span>
              <strong>{item.customSku || "-"}</strong>
            </div>
            <div className="detail-row">
              <span>Category</span>
              <strong>{item.category || "-"}</strong>
            </div>
            <div className="detail-row">
              <span>Brand</span>
              <strong>{item.brand || "-"}</strong>
            </div>
            <div className="detail-row">
              <span>Default</span>
              <strong>{formatPrice(item.defaultPrice)}</strong>
            </div>
            <div className="detail-row">
              <span>MSRP</span>
              <strong>{formatPrice(item.msrp)}</strong>
            </div>
          </div>
        </section>
      ) : (
        <section className="glass-panel card">
          <p className="hint">Item not found.</p>
        </section>
      )}

      {!busy && !error && item ? (
        <section className="glass-panel card rfid-card">
          <div className="rfid-head">
            <h3>RFID / EPC Tags</h3>
            <p className="hint">
              Prepared module for future scan uploads. Table shows current EPC mappings by Custom SKU.
            </p>
          </div>

          {rfidBusy ? (
            <p className="hint">Loading RFID tag rows...</p>
          ) : rfidError ? (
            <p className="error">{rfidError}</p>
          ) : rfidTags.length < 1 ? (
            <p className="hint">No EPC records found for this Custom SKU.</p>
          ) : (
            <div className="rfid-table-wrap">
              <table className="rfid-table">
                <thead>
                  <tr>
                    <th>EPC (RFID)</th>
                    <th>Status</th>
                    <th>Last Seen (Upload Scan Time)</th>
                  </tr>
                </thead>
                <tbody>
                  {rfidTags.map((tag) => (
                    <tr key={tag.epc}>
                      <td className="mono">{tag.epc || "-"}</td>
                      <td>
                        <span className={`status-pill ${tag.status}`}>{tag.status || "live"}</span>
                      </td>
                      <td>{formatLastSeen(tag.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rfidNote ? <p className="hint">{rfidNote}</p> : null}
        </section>
      ) : null}

      <style jsx>{`
        .page {
          max-width: 1180px;
          margin: 0 auto;
          padding: 22px 8px 26px;
          display: grid;
          gap: 14px;
          color: #f8fafc;
        }
        .card {
          padding: 18px;
          display: grid;
          gap: 12px;
        }
        h2 {
          margin: 0;
          font-size: 1.7rem;
          line-height: 1.2;
        }
        h3 {
          margin: 0;
          font-size: 1.15rem;
          line-height: 1.2;
        }
        .header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .back-btn {
          text-decoration: none;
          min-width: 170px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .details-card {
          grid-template-columns: minmax(220px, 360px) minmax(0, 1fr);
          gap: 16px;
          align-items: stretch;
        }
        .media-pane {
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(3, 8, 22, 0.56);
          display: grid;
          place-items: center;
          overflow: hidden;
          min-height: 260px;
        }
        .media-pane img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: rgba(3, 8, 22, 0.72);
        }
        .image-placeholder {
          color: rgba(226, 232, 240, 0.8);
          font-size: 0.95rem;
          letter-spacing: 0.01em;
        }
        .details-pane {
          display: grid;
          gap: 10px;
        }
        .detail-row {
          display: grid;
          grid-template-columns: 150px minmax(0, 1fr);
          gap: 10px;
          align-items: center;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 12px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.05);
        }
        .detail-row span {
          color: rgba(226, 232, 240, 0.82);
          font-size: 0.84rem;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          font-weight: 700;
        }
        .detail-row strong {
          min-width: 0;
          overflow-wrap: anywhere;
          color: #f8fafc;
          font-weight: 700;
        }
        .hint {
          margin: 0;
          color: rgba(226, 232, 240, 0.8);
          font-size: 0.95rem;
        }
        .rfid-card {
          gap: 10px;
        }
        .rfid-head {
          display: grid;
          gap: 6px;
        }
        .rfid-table-wrap {
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 12px;
          overflow: auto;
          background: rgba(3, 8, 22, 0.4);
        }
        .rfid-table {
          width: 100%;
          min-width: 700px;
          border-collapse: collapse;
        }
        .rfid-table th,
        .rfid-table td {
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          text-align: left;
          font-size: 0.92rem;
          color: #f8fafc;
          vertical-align: middle;
        }
        .rfid-table th {
          color: rgba(226, 232, 240, 0.9);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-size: 0.8rem;
          font-weight: 700;
          background: rgba(15, 23, 42, 0.7);
        }
        .rfid-table tbody tr:last-child td {
          border-bottom: none;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
            "Courier New", monospace;
          letter-spacing: 0.01em;
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          padding: 4px 10px;
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 700;
          min-width: 80px;
        }
        .status-pill.live {
          background: rgba(34, 197, 94, 0.2);
          border: 1px solid rgba(74, 222, 128, 0.5);
          color: #bbf7d0;
        }
        .status-pill.killed {
          background: rgba(248, 113, 113, 0.18);
          border: 1px solid rgba(252, 165, 165, 0.5);
          color: #fecaca;
        }
        .status-pill.damaged {
          background: rgba(251, 191, 36, 0.2);
          border: 1px solid rgba(252, 211, 77, 0.5);
          color: #fde68a;
        }
        .error {
          margin: 0;
          border-radius: 12px;
          padding: 8px 10px;
          border: 1px solid rgba(248, 113, 113, 0.32);
          background: rgba(220, 38, 38, 0.14);
          color: #fecaca;
          font-size: 0.92rem;
        }
        @media (max-width: 900px) {
          .details-card {
            grid-template-columns: 1fr;
          }
          .detail-row {
            grid-template-columns: 1fr;
            gap: 4px;
          }
        }
      `}</style>
    </main>
  );
}


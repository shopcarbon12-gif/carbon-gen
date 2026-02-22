"use client";

import { useCallback, useEffect, useState } from "react";

type SyncTogglesState = {
  lsSyncEnabled: boolean;
  shopifySyncEnabled: boolean;
  shopifyAutoSyncEnabled: boolean;
};

type Props = {
  /** Shop domain. If empty, fetches from /api/shopify/status on mount. */
  shop: string;
  onShopResolved?: (shop: string) => void;
  disabled?: boolean;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function SyncTogglesBar({ shop: shopProp, onShopResolved, disabled = false }: Props) {
  const [shop, setShop] = useState(normalizeText(shopProp));
  const [toggles, setToggles] = useState<SyncTogglesState>({ lsSyncEnabled: true, shopifySyncEnabled: true, shopifyAutoSyncEnabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const effectiveShop = shop || shopProp;

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/shopify/status", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { shop?: string | null };
    const s = normalizeText(json?.shop);
    if (s) {
      setShop(s);
      onShopResolved?.(s);
      return s;
    }
    return "";
  }, [onShopResolved]);

  const loadConfig = useCallback(async (targetShop: string) => {
    if (!targetShop) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/shopify/cart-config?shop=${encodeURIComponent(targetShop)}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        config?: { syncToggles?: { lsSyncEnabled?: boolean; shopifySyncEnabled?: boolean; shopifyAutoSyncEnabled?: boolean } };
      };
      const section = json?.config?.syncToggles;
      setToggles({
        lsSyncEnabled: section?.lsSyncEnabled !== false,
        shopifySyncEnabled: section?.shopifySyncEnabled !== false,
        shopifyAutoSyncEnabled: section?.shopifyAutoSyncEnabled !== false,
      });
    } catch (e) {
      setError(normalizeText((e as { message?: string })?.message) || "Failed to load sync settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const saveToggles = useCallback(
    async (next: SyncTogglesState) => {
      const targetShop = effectiveShop || (await fetchStatus());
      if (!targetShop) {
        setError("No shop context. Load the page first.");
        return false;
      }
      setSaving(true);
      setError("");
      try {
        const res = await fetch("/api/shopify/cart-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop: targetShop,
            section: "syncToggles",
            values: next,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || json.ok === false) {
          throw new Error(normalizeText(json?.error) || "Failed to save sync settings.");
        }
        setToggles(next);
        return true;
      } catch (e) {
        setError(normalizeText((e as { message?: string })?.message) || "Failed to save.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [effectiveShop, fetchStatus]
  );

  useEffect(() => {
    if (shopProp) {
      setShop(normalizeText(shopProp));
      void loadConfig(normalizeText(shopProp));
      return;
    }
    let cancelled = false;
    (async () => {
      const s = await fetchStatus();
      if (cancelled || !s) return;
      await loadConfig(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [shopProp, fetchStatus, loadConfig]);

  const handleLsToggle = async (checked: boolean) => {
    const next = { ...toggles, lsSyncEnabled: checked };
    await saveToggles(next);
  };

  const handleShopifyToggle = async (checked: boolean) => {
    const next = { ...toggles, shopifySyncEnabled: checked };
    await saveToggles(next);
  };

  const handleAutoSyncToggle = async (checked: boolean) => {
    const next = { ...toggles, shopifyAutoSyncEnabled: checked };
    await saveToggles(next);
  };

  const isDisabled = disabled || loading || saving || !effectiveShop;

  return (
    <section className="sync-toggles-bar card glass-panel" aria-label="Sync toggles">
      <div className="sync-toggles-inner">
        <span className="sync-toggles-label">Sync control (this module only):</span>
        <label className={`sync-toggle-row ${isDisabled ? "disabled" : ""}`}>
          <input
            type="checkbox"
            checked={toggles.lsSyncEnabled}
            onChange={(e) => void handleLsToggle(e.target.checked)}
            disabled={isDisabled}
            aria-label="Lightspeed sync enabled"
          />
          <span className="sync-toggle-text">LS</span>
        </label>
        <label className={`sync-toggle-row ${isDisabled ? "disabled" : ""}`}>
          <input
            type="checkbox"
            checked={toggles.shopifySyncEnabled}
            onChange={(e) => void handleShopifyToggle(e.target.checked)}
            disabled={isDisabled}
            aria-label="Shopify sync enabled"
          />
          <span className="sync-toggle-text">Shopify</span>
        </label>
        <label className={`sync-toggle-row ${isDisabled ? "disabled" : ""}`} title="When off: 15-min auto sync pauses. Manual push/remove still work.">
          <input
            type="checkbox"
            checked={toggles.shopifyAutoSyncEnabled}
            onChange={(e) => void handleAutoSyncToggle(e.target.checked)}
            disabled={isDisabled || !toggles.shopifySyncEnabled}
            aria-label="15-min auto sync enabled"
          />
          <span className="sync-toggle-text">Auto</span>
        </label>
        {loading && <span className="sync-toggles-meta">Loading…</span>}
        {saving && <span className="sync-toggles-meta">Saving…</span>}
        {error && <span className="sync-toggles-error">{error}</span>}
        {effectiveShop && !loading && !saving && !error && (
          <span className="sync-toggles-meta">Shop: {effectiveShop}</span>
        )}
      </div>
      <style jsx>{`
        .sync-toggles-bar {
          padding: 0.5rem 1rem;
          margin-bottom: 0.75rem;
        }
        .sync-toggles-inner {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 1rem;
        }
        .sync-toggles-label {
          font-size: 0.9rem;
          color: var(--text-muted, #666);
        }
        .sync-toggle-row {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .sync-toggle-row.disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
        .sync-toggle-text {
          font-weight: 500;
        }
        .sync-toggles-meta {
          font-size: 0.8rem;
          color: var(--text-muted, #888);
        }
        .sync-toggles-error {
          font-size: 0.85rem;
          color: var(--error, #c44);
        }
      `}</style>
    </section>
  );
}

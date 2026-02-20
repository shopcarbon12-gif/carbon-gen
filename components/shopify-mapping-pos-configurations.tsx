"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

type BasicSettings = {
  syncStatus: boolean;
  orderSync: boolean;
  completeSync: boolean;
  eComSync: boolean;
  storeWiseInventory: boolean;
};

type ProductMapping = {
  sku: string;
  stockSource: string[];
  price: string;
  costPrice: string;
  msrp: string;
  listPrice: string;
  price1: string;
  price2: string;
  price3: string;
  b2bPrice: string;
  salePrice: string;
};

type DownloadOrderSettings = {
  register: string;
  paymentType: string;
  employee: string;
  shop: string;
};

type ShopOrderConfig = {
  shopId: string;
  shopName: string;
  register: string;
  employee: string;
};

type Option = {
  value: string;
  label: string;
};

const registerOptions: Option[] = [
  { value: "1", label: "Register 1" },
  { value: "3", label: "Register 1" },
  { value: "4", label: "Register1" },
  { value: "5", label: "Register1" },
  { value: "6", label: "Register1" },
  { value: "7", label: "Register1" },
  { value: "8", label: "Register1" },
  { value: "9", label: "Register1" },
  { value: "10", label: "Register1" },
  { value: "11", label: "Register1" },
];

const paymentTypeOptions: Option[] = [
  { value: "8", label: "Adjustment" },
  { value: "1", label: "Cash" },
  { value: "10", label: "CHECK" },
  { value: "4", label: "Credit Account" },
  { value: "3", label: "Credit Card" },
  { value: "6", label: "Debit Card" },
  { value: "7", label: "eCom" },
  { value: "11", label: "eCom - Lightspeed Payments - Credit Card" },
  { value: "9", label: "eCom - Pay at pickup - Cash" },
  { value: "12", label: "eCom - Stripe - Credit Card" },
  { value: "5", label: "Gift Card" },
];

const employeeOptions: Option[] = [
  { value: "", label: "--Select--" },
  { value: "179", label: "Aleks Ospina" },
  { value: "164", label: "Carbon Jeans" },
  { value: "19", label: "Cindy Chowdhury" },
  { value: "8", label: "Dionne Coward" },
  { value: "174", label: "Edgwater Branch" },
  { value: "1", label: "Elior Perez" },
  { value: "181", label: "Emerick Cucalon" },
  { value: "132", label: "Felixx Ortiz" },
  { value: "156", label: "Jesus Navas" },
  { value: "178", label: "Josman Moreno Palma" },
  { value: "100", label: "Juan Rodriguez" },
  { value: "116", label: "Marketing" },
  { value: "180", label: "Michelle Smith" },
  { value: "177", label: "Richy Flores" },
  { value: "153", label: "Sawgrass mills mall" },
  { value: "40", label: "Senitron" },
  { value: "33", label: "Warehouse Warehouse" },
];

const shopOptions: Option[] = [
  { value: "1", label: "CARBON JEANS COMPANY" },
  { value: "9", label: "CARBON SAWGRASS MILLS" },
];

const priceFieldOptions: Option[] = [
  { value: "", label: "--Select--" },
  { value: "Default", label: "Default" },
  { value: "MSRP", label: "MSRP" },
  { value: "Online", label: "Online" },
];

const skuOptions: Option[] = [
  { value: "systemSku", label: "System SKU" },
  { value: "customSku", label: "Custom SKU" },
  { value: "manufacturerSku", label: "Manufacturer SKU" },
];

const stockSourceOptions: Option[] = [
  { value: "1", label: "CARBON JEANS COMPANY" },
  { value: "9", label: "CARBON SAWGRASS MILLS" },
  { value: "0", label: "Company Stock" },
];

function AlertInfo({ id }: { id: string }) {
  return (
    <div className="alert" role="status" aria-live="polite">
      <span>This alert needs your attention, but it's not super important.</span>
      <span id={id} className="alert-note" />
    </div>
  );
}

function FieldRow(props: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="field-row">
      <div className="field-copy">
        <h4>{props.label}</h4>
        <p>{props.hint}</p>
      </div>
      <div className="field-control">{props.children}</div>
    </div>
  );
}

function SelectControl(props: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
      {props.options.map((option) => (
        <option key={`${option.value}-${option.label}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export default function ShopifyMappingPosConfigurations() {
  const [basic, setBasic] = useState<BasicSettings>({
    syncStatus: true,
    orderSync: true,
    completeSync: false,
    eComSync: false,
    storeWiseInventory: true,
  });

  const [productMapping, setProductMapping] = useState<ProductMapping>({
    sku: "customSku",
    stockSource: ["1", "9", "0"],
    price: "Default",
    costPrice: "",
    msrp: "MSRP",
    listPrice: "",
    price1: "Online",
    price2: "",
    price3: "",
    b2bPrice: "",
    salePrice: "",
  });

  const [downloadSettings, setDownloadSettings] = useState<DownloadOrderSettings>({
    register: "1",
    paymentType: "7",
    employee: "1",
    shop: "1",
  });

  const [shopConfigurations, setShopConfigurations] = useState<ShopOrderConfig[]>([
    {
      shopId: "1",
      shopName: "CARBON JEANS COMPANY",
      register: "1",
      employee: "",
    },
    {
      shopId: "9",
      shopName: "CARBON SAWGRASS MILLS",
      register: "10",
      employee: "",
    },
  ]);

  const [status, setStatus] = useState("");
  const [pulling, setPulling] = useState(false);
  const [saving, setSaving] = useState(false);

  function notify(message: string) {
    setStatus(message);
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const resp = await fetch("/api/lightspeed/pos-config", { cache: "no-store" });
      const json = await resp.json().catch(() => ({}));
      if (!json?.config || typeof json.config !== "object") return;
      const cfg = json.config as Record<string, unknown>;

      if (cfg.basicSettings && typeof cfg.basicSettings === "object") {
        const bs = cfg.basicSettings as Partial<BasicSettings>;
        setBasic((prev) => ({ ...prev, ...bs }));
      }
      if (cfg.productMapping && typeof cfg.productMapping === "object") {
        const pm = cfg.productMapping as Partial<ProductMapping>;
        setProductMapping((prev) => ({ ...prev, ...pm }));
      }
      if (cfg.downloadSettings && typeof cfg.downloadSettings === "object") {
        const ds = cfg.downloadSettings as Partial<DownloadOrderSettings>;
        setDownloadSettings((prev) => ({ ...prev, ...ds }));
      }
      const shopRows = Array.isArray(cfg.shopConfigurations)
        ? cfg.shopConfigurations
        : Array.isArray((cfg.shopConfigurations as { rows?: unknown })?.rows)
          ? (cfg.shopConfigurations as { rows: unknown[] }).rows
          : [];
      if (shopRows.length > 0) {
        setShopConfigurations(
          shopRows.map((r: unknown) => {
            const row = (r || {}) as Partial<ShopOrderConfig>;
            return {
              shopId: String(row.shopId ?? ""),
              shopName: String(row.shopName ?? ""),
              register: String(row.register ?? ""),
              employee: String(row.employee ?? ""),
            };
          })
        );
      }
    } catch {
      // Config not loaded — use defaults.
    }
  }

  async function saveSection(section: string, values: Record<string, unknown>) {
    setSaving(true);
    notify(`Saving ${section}...`);
    try {
      const resp = await fetch("/api/lightspeed/pos-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, values }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        notify(`Error: ${json?.error || "Save failed."}`);
        return;
      }
      const msg = `${section} saved.`;
      notify(json?.warning ? `${msg} ${json.warning}` : msg);
    } catch (e: unknown) {
      notify(`Error: ${String((e as { message?: string } | null)?.message || "Save failed.").trim()}`);
    } finally {
      setSaving(false);
    }
  }

  function saveBasic() {
    void saveSection("basicSettings", basic);
  }

  function saveProductMapping() {
    void saveSection("productMapping", productMapping);
  }

  function saveDownloadSettings() {
    void saveSection("downloadSettings", downloadSettings);
  }

  function saveShopConfig() {
    void saveSection("shopConfigurations", { rows: shopConfigurations });
  }

  async function pullMappingData() {
    if (pulling) return;
    setPulling(true);
    notify("Pulling inventory from Lightspeed POS...");
    try {
      const params = new URLSearchParams({
        all: "1",
        pageSize: "20000",
        shops: "all",
        includeNoStock: "1",
        refresh: "1",
      });
      const resp = await fetch(`/api/lightspeed/catalog?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        total?: number;
        rows?: unknown[];
      };
      if (!resp.ok || json.ok === false) {
        notify(`Error: ${json?.error || "Pull failed."}`);
        return;
      }
      const total = Number(json?.total ?? json?.rows?.length ?? 0);
      notify(`Pulled ${total.toLocaleString()} items from Lightspeed. Go to Inventory to view.`);
    } catch (e: unknown) {
      const msg = String((e as { message?: string } | null)?.message || "Pull failed.");
      notify(`Error: ${msg}`);
    } finally {
      setPulling(false);
    }
  }

  return (
    <main className="page pos-config-page">
      <section className="glass-panel hero">
        <div className="hero-copy">
          <p className="eyebrow">Shopify Mapping Inventory</p>
          <h1>POS (Lightspeed - Lightspeed_257323) Configurations</h1>
          <p>
            Do you have any questions or feel setup is complicated?{" "}
            <Link href="/settings" className="inline-link">
              Contact us
            </Link>{" "}
            and get help from support executive.
          </p>
        </div>
      </section>

      <nav className="quick-nav" aria-label="POS configuration sections">
        <Link href="/studio/shopify-mapping-inventory/workset" className="quick-chip">
          Workset
        </Link>
        <Link href="/studio/shopify-mapping-inventory/sales" className="quick-chip">
          Sales
        </Link>
        <Link href="/studio/shopify-mapping-inventory/inventory" className="quick-chip">
          Inventory
        </Link>
        <Link href="/studio/shopify-mapping-inventory/carts-inventory" className="quick-chip">
          Carts Inventory
        </Link>
        <Link href="/studio/shopify-mapping-inventory/configurations" className="quick-chip active">
          Configurations
        </Link>
      </nav>

      <nav className="quick-nav small" aria-label="Configuration categories">
        <Link href="/studio/shopify-mapping-inventory/configurations/pos" className="quick-chip active">
          POS Configurations
        </Link>
        <Link href="/studio/shopify-mapping-inventory/configurations/cart" className="quick-chip">
          Cart Configurations
        </Link>
      </nav>

      <section className="glass-panel pull-card">
        <button
          suppressHydrationWarning
          type="button"
          className="btn-base btn-primary pull-btn"
          onClick={() => void pullMappingData()}
          disabled={pulling}
        >
          {pulling ? "Pulling..." : "Pull Mapping Data from Lightspeed POS"}
        </button>
        <p className="pull-card-note">
          Use once for initial setup. Inventory syncs automatically every 30 minutes.
        </p>
      </section>

      <section className="two-col">
        <section className="glass-panel card">
          <header>
            <h2>Basic Settings</h2>
          </header>
          <AlertInfo id="basic-settings-status" />

          <div className="form-rows">
            <FieldRow label="Sync Status" hint="it shows that sync is active or paused">
              <input
                type="checkbox"
                checked={basic.syncStatus}
                onChange={(e) => setBasic((prev) => ({ ...prev, syncStatus: e.target.checked }))}
              />
            </FieldRow>

            <FieldRow label="Order Sync Status" hint="it shows that order sync is active or paused">
              <input
                type="checkbox"
                checked={basic.orderSync}
                onChange={(e) => setBasic((prev) => ({ ...prev, orderSync: e.target.checked }))}
              />
            </FieldRow>

            <FieldRow
              label="Complete Sync"
              hint="it shows that complete inventory will pull on next sync."
            >
              <input
                type="checkbox"
                checked={basic.completeSync}
                onChange={(e) => setBasic((prev) => ({ ...prev, completeSync: e.target.checked }))}
              />
            </FieldRow>

            <FieldRow label="Sync eCom enabled" hint="System will sync only eCom enabled items.">
              <input
                type="checkbox"
                checked={basic.eComSync}
                onChange={(e) => setBasic((prev) => ({ ...prev, eComSync: e.target.checked }))}
              />
            </FieldRow>

            <FieldRow label="Sync store wise inventory" hint="System will sync store wise inventory.">
              <input
                type="checkbox"
                checked={basic.storeWiseInventory}
                onChange={(e) =>
                  setBasic((prev) => ({ ...prev, storeWiseInventory: e.target.checked }))
                }
              />
            </FieldRow>
          </div>

          <div className="actions">
            <button suppressHydrationWarning type="button" className="btn-base btn-primary" onClick={saveBasic} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </section>

        <section className="glass-panel card">
          <header>
            <h2>Product Related Mapping</h2>
          </header>
          <AlertInfo id="product-mapping-status" />

          <div className="form-rows">
            <FieldRow
              label="SKU"
              hint="Please select SKU, which Lightspeed field you want to use as SKU."
            >
              <SelectControl
                value={productMapping.sku}
                options={skuOptions}
                onChange={(value) => setProductMapping((prev) => ({ ...prev, sku: value }))}
              />
            </FieldRow>

            <FieldRow
              label="Stock Source"
              hint="Please select stock source, which source you want to populate."
            >
              <select
                multiple
                value={productMapping.stockSource}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map((option) => option.value);
                  setProductMapping((prev) => ({ ...prev, stockSource: selected }));
                }}
                className="multi"
              >
                {stockSourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FieldRow>

            <FieldRow
              label="Price"
              hint="Please select Price, which Lightspeed field you want to use as Price."
            >
              <SelectControl
                value={productMapping.price}
                options={priceFieldOptions}
                onChange={(value) => setProductMapping((prev) => ({ ...prev, price: value }))}
              />
            </FieldRow>

            <FieldRow
              label="Cost Price"
              hint="Please select Cost Price, which Lightspeed field you want to use as Cost Price."
            >
              <SelectControl
                value={productMapping.costPrice}
                options={priceFieldOptions}
                onChange={(value) => setProductMapping((prev) => ({ ...prev, costPrice: value }))}
              />
            </FieldRow>

            <FieldRow
              label="MSRP"
              hint="Please select MSRP, which Lightspeed field you want to use as MSRP."
            >
              <SelectControl
                value={productMapping.msrp}
                options={priceFieldOptions}
                onChange={(value) => setProductMapping((prev) => ({ ...prev, msrp: value }))}
              />
            </FieldRow>

            <FieldRow
              label="ListPrice"
              hint="Please select List Price, which Lightspeed field you want to use as List Price."
            >
              <SelectControl
                value={productMapping.listPrice}
                options={priceFieldOptions}
                onChange={(value) => setProductMapping((prev) => ({ ...prev, listPrice: value }))}
              />
            </FieldRow>

            <FieldRow
              label="Price Level 1"
              hint="Please select Price Level 1, which Lightspeed field you want to use as Price Level 1."
            >
              <SelectControl
                value={productMapping.price1}
                options={priceFieldOptions}
                onChange={(value) => setProductMapping((prev) => ({ ...prev, price1: value }))}
              />
            </FieldRow>

            <FieldRow
              label="Price Level 2"
              hint="Please select Price Level 2, which Lightspeed field you want to use as Price Level 2."
            >
              <SelectControl
                value={productMapping.price2}
                options={priceFieldOptions}
                onChange={(value) => setProductMapping((prev) => ({ ...prev, price2: value }))}
              />
            </FieldRow>

            <FieldRow
              label="Price Level 3"
              hint="Please select Price Level 3, which Lightspeed field you want to use as Price Level 3."
            >
              <SelectControl
                value={productMapping.price3}
                options={priceFieldOptions}
                onChange={(value) => setProductMapping((prev) => ({ ...prev, price3: value }))}
              />
            </FieldRow>

            <FieldRow
              label="B2B Price"
              hint="Please select B2B Price, which Lightspeed field you want to use as B2B Price."
            >
              <SelectControl
                value={productMapping.b2bPrice}
                options={priceFieldOptions}
                onChange={(value) => setProductMapping((prev) => ({ ...prev, b2bPrice: value }))}
              />
            </FieldRow>

            <FieldRow
              label="Sale Price"
              hint="Please select Sale Price, which Lightspeed field you want to use as Sale Price."
            >
              <SelectControl
                value={productMapping.salePrice}
                options={priceFieldOptions}
                onChange={(value) => setProductMapping((prev) => ({ ...prev, salePrice: value }))}
              />
            </FieldRow>
          </div>

          <div className="actions">
            <button
              suppressHydrationWarning
              type="button"
              className="btn-base btn-primary"
              onClick={saveProductMapping}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </section>
      </section>

      <section className="glass-panel card">
        <header>
          <h2>Download Orders Settings (Default)</h2>
        </header>
        <AlertInfo id="download-settings-status" />

        <div className="form-rows">
          <FieldRow
            label="Register"
            hint="Please select Register, which Lightspeed register you want to use for Orders."
          >
            <SelectControl
              value={downloadSettings.register}
              options={[{ value: "", label: "--Select--" }, ...registerOptions]}
              onChange={(value) => setDownloadSettings((prev) => ({ ...prev, register: value }))}
            />
          </FieldRow>

          <FieldRow
            label="Payment Type"
            hint="Please select Payment Type, which Lightspeed Payment Type you want to use for Orders."
          >
            <SelectControl
              value={downloadSettings.paymentType}
              options={[{ value: "", label: "--Select--" }, ...paymentTypeOptions]}
              onChange={(value) => setDownloadSettings((prev) => ({ ...prev, paymentType: value }))}
            />
          </FieldRow>

          <FieldRow
            label="Employee"
            hint="Please select Employee, which Lightspeed Employee you want to use for Orders."
          >
            <SelectControl
              value={downloadSettings.employee}
              options={employeeOptions}
              onChange={(value) => setDownloadSettings((prev) => ({ ...prev, employee: value }))}
            />
          </FieldRow>

          <FieldRow
            label="Shop"
            hint="Please select Shop, which Lightspeed Shop you want to use for Orders."
          >
            <SelectControl
              value={downloadSettings.shop}
              options={[{ value: "", label: "--Select--" }, ...shopOptions]}
              onChange={(value) => setDownloadSettings((prev) => ({ ...prev, shop: value }))}
            />
          </FieldRow>
        </div>

        <div className="actions">
          <button
            suppressHydrationWarning
            type="button"
            className="btn-base btn-primary"
            onClick={saveDownloadSettings}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </section>

      {shopConfigurations.map((shopConfig) => (
        <section className="glass-panel card" key={shopConfig.shopId}>
          <header>
            <h2>Order Configurations, Shop - {shopConfig.shopName}</h2>
          </header>
          <AlertInfo id={`shop-${shopConfig.shopId}-status`} />

          <div className="form-rows">
            <FieldRow
              label="Register"
              hint="Please select Register, which Lightspeed register you want to use for Orders."
            >
              <SelectControl
                value={shopConfig.register}
                options={[{ value: "", label: "--Select--" }, ...registerOptions]}
                onChange={(value) => {
                  setShopConfigurations((prev) =>
                    prev.map((row) =>
                      row.shopId === shopConfig.shopId
                        ? { ...row, register: value }
                        : row
                    )
                  );
                }}
              />
            </FieldRow>

            <FieldRow
              label="Employee"
              hint="Please select Employee, which Lightspeed Employee you want to use for Orders."
            >
              <SelectControl
                value={shopConfig.employee}
                options={employeeOptions}
                onChange={(value) => {
                  setShopConfigurations((prev) =>
                    prev.map((row) =>
                      row.shopId === shopConfig.shopId
                        ? { ...row, employee: value }
                        : row
                    )
                  );
                }}
              />
            </FieldRow>
          </div>

          <div className="actions">
            <button
              suppressHydrationWarning
              type="button"
              className="btn-base btn-primary"
              onClick={() => saveShopConfig()}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </section>
      ))}

      {status ? <p className="notice">{status}</p> : null}

      <style jsx>{`
        .pos-config-page {
          max-width: 1320px;
          margin: 0 auto;
          padding: 20px 8px 28px;
          display: grid;
          gap: 12px;
          color: #f8fafc;
        }
        .hero {
          border-radius: 18px;
          padding: 16px;
          display: grid;
          gap: 8px;
        }
        .eyebrow {
          margin: 0;
          color: rgba(226, 232, 240, 0.78);
          font-size: 0.74rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
        }
        .hero h1 {
          margin: 0;
          font-size: clamp(1.4rem, 2.8vw, 2rem);
          line-height: 1.14;
        }
        .hero p {
          margin: 0;
          color: rgba(226, 232, 240, 0.84);
          font-size: 0.9rem;
          line-height: 1.42;
        }
        .inline-link {
          color: #7dd3fc;
          text-decoration: none;
        }
        .inline-link:hover {
          color: #bae6fd;
        }
        .quick-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .quick-nav.small {
          gap: 6px;
        }
        .quick-chip {
          text-decoration: none;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(248, 250, 252, 0.9);
          padding: 8px 12px;
          font-size: 0.78rem;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
        }
        .quick-chip.active {
          color: #fff;
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(255, 255, 255, 0.38);
        }
        .pull-card {
          border-radius: 16px;
          padding: 14px;
          display: grid;
          gap: 8px;
        }
        .pull-card-note {
          margin: 0;
          font-size: 0.82rem;
          color: rgba(226, 232, 240, 0.78);
          line-height: 1.35;
        }
        .pull-btn {
          min-height: 44px;
          padding: 0 14px;
        }
        .two-col {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          align-items: start;
        }
        .card {
          border-radius: 16px;
          padding: 14px;
          display: grid;
          gap: 10px;
        }
        .card header h2 {
          margin: 0;
          font-size: 1rem;
        }
        .alert {
          border: 1px solid rgba(125, 211, 252, 0.4);
          background: rgba(125, 211, 252, 0.2);
          border-radius: 10px;
          padding: 10px 12px;
          color: #bae6fd;
          font-size: 0.79rem;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .alert-note {
          font-size: 0.76rem;
          color: rgba(186, 230, 253, 0.85);
        }
        .form-rows {
          display: grid;
          gap: 0;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 10px;
          overflow: hidden;
        }
        .field-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 200px;
          gap: 12px;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.09);
          background: rgba(255, 255, 255, 0.02);
        }
        .field-row:last-child {
          border-bottom: 0;
        }
        .field-copy h4 {
          margin: 0;
          font-size: 0.97rem;
          font-weight: 600;
        }
        .field-copy p {
          margin: 4px 0 0;
          color: rgba(226, 232, 240, 0.78);
          font-size: 0.82rem;
          line-height: 1.35;
        }
        .field-control {
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        .field-control :global(input[type="checkbox"]) {
          width: 18px;
          height: 18px;
          min-height: 18px;
          border-radius: 4px;
          accent-color: #22c55e;
          cursor: pointer;
        }
        .field-control :global(select) {
          min-height: 38px;
          max-width: 100%;
          width: 100%;
          text-transform: none;
          font-size: 0.88rem;
          background: rgba(255, 255, 255, 0.08);
        }
        .field-control :global(select.multi) {
          min-height: 74px;
        }
        .actions {
          display: flex;
          justify-content: center;
          padding-top: 2px;
        }
        .actions :global(button) {
          min-height: 40px;
          padding: 0 16px;
        }
        .notice {
          margin: 0;
          border-radius: 10px;
          border: 1px solid rgba(16, 185, 129, 0.4);
          background: rgba(16, 185, 129, 0.14);
          color: #a7f3d0;
          padding: 10px 12px;
          font-size: 0.83rem;
        }
        @media (max-width: 1120px) {
          .two-col {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 800px) {
          .field-row {
            grid-template-columns: 1fr;
          }
          .field-control {
            justify-content: flex-start;
          }
          .field-control :global(select) {
            max-width: none;
          }
        }
      `}</style>
    </main>
  );
}


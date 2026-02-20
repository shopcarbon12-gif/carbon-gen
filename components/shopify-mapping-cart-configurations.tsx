"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

type Option = {
  value: string;
  label: string;
};

type BasicSettings = {
  syncStatus: boolean;
  liveUpload: boolean;
  integrationType: string;
};

type NewProductMapping = {
  productName: string;
  description: string;
  urlAndHandle: string;
  price: string;
  comparePrice: string;
  barcode: string;
  vendor: string;
  tags: string[];
  weight: string;
};

type NewProductRules = {
  productStatus: boolean;
  inventoryManagement: boolean;
  postVariantAsIndividual: boolean;
};

type ProductUpdateRules = {
  productName: boolean;
  description: boolean;
  urlHandle: boolean;
  price: boolean;
  comparePrice: boolean;
  costPrice: boolean;
  barcode: boolean;
  productType: boolean;
  vendor: boolean;
  image: boolean;
  weight: boolean;
  tags: boolean;
  styleAttributes: boolean;
};

type OrderStatus = {
  authorized: boolean;
  pending: boolean;
  paid: boolean;
  partiallyPaid: boolean;
  voided: boolean;
};

type StoreMappingRow = {
  shopifyStore: string;
  posStore: string;
};

type ToggleSpec<K extends string> = {
  key: K;
  label: string;
  hint: string;
};

type MappingKey = keyof NewProductMapping;

type MappingRowSpec = {
  key: MappingKey;
  label: string;
  options: Option[];
  multi?: boolean;
};

const INTEGRATION_TYPE_OPTIONS: Option[] = [
  { value: "", label: "Select Integration Type" },
  { value: "CompleteSync", label: "Complete Product Sync" },
  { value: "StockPrice", label: "Stock & Price Sync" },
  { value: "StockPriceWithProduct", label: "Stock & Price with New Product Sync" },
];

const PRODUCT_FIELD_OPTIONS: Option[] = [
  { value: "BIN LOCATION", label: "BIN LOCATION" },
  { value: "Brand", label: "Brand" },
  { value: "Category", label: "Category" },
  { value: "CategoryTags", label: "Category Tags" },
  { value: "Custom1", label: "Custom 1" },
  { value: "Custom2", label: "Custom 2" },
  { value: "Custom3", label: "Custom 3" },
  { value: "Description", label: "Description" },
  { value: "ParentSKU", label: "Group SKU" },
  { value: "SKU", label: "SKU" },
  { value: "Stock", label: "Stock" },
  { value: "Style1", label: "Style 1" },
  { value: "Style2", label: "Style 2" },
  { value: "Style3", label: "Style 3" },
  { value: "SubDescription1", label: "Sub Description 1" },
  { value: "SubDescription2", label: "Sub Description 2" },
  { value: "SubDescription3", label: "Sub Description 3" },
  { value: "Supplier", label: "Supplier" },
  { value: "Tags", label: "Tags" },
  { value: "Title", label: "Title" },
  { value: "UPC", label: "UPC" },
];

const PRICE_FIELD_OPTIONS: Option[] = [
  { value: "Price", label: "Price" },
  { value: "CostPrice", label: "Cost Price" },
  { value: "MSRP", label: "MSRP" },
  { value: "ListPrice", label: "List Price" },
  { value: "SalePrice", label: "Sale Price" },
  { value: "B2BPrice", label: "B2B Price" },
  { value: "Price1", label: "Price 1" },
  { value: "Price2", label: "Price 2" },
  { value: "Price3", label: "Price 3" },
];

const MAP_STORE_OPTIONS: Option[] = [
  { value: "0", label: "Select Store" },
  { value: "3cd7bb24-8631-4c1a-8934-ebfcc7a2c7e1", label: "CARBON SAWGRASS MILLS" },
  { value: "8f19c3bb-e310-4009-b3ca-8c3e95a52bcb", label: "CARBON JEANS COMPANY" },
  { value: "a41b6c5a-cdff-4dd1-b0bd-0f589dc1abfb", label: "Combined stock" },
  { value: "d8706d13-1d05-4c45-b0ab-3e2782dcf807", label: "ELEMENTI FLORIDA MALL" },
];

const NEW_PRODUCT_RULES: Array<ToggleSpec<keyof NewProductRules>> = [
  {
    key: "productStatus",
    label: "Product Status",
    hint: "Do you want to post new products as 'Invisible' on the 30e7d3.myshopify.com?",
  },
  {
    key: "inventoryManagement",
    label: "Inventory Management",
    hint: "Enable this if you do not want to track Inventory by Shopify.",
  },
  {
    key: "postVariantAsIndividual",
    label: "Post Variant As Individual Product",
    hint: "Do you want to post all product variants as individual products on the cart?",
  },
];

const PRODUCT_UPDATE_RULES: Array<ToggleSpec<keyof ProductUpdateRules>> = [
  { key: "productName", label: "Product Name", hint: "Do you want to update Product's Name?" },
  { key: "description", label: "Description", hint: "Do you want to update Product's Description?" },
  { key: "urlHandle", label: "URL & Handle", hint: "Do you want to update Product's URL & Handle?" },
  { key: "price", label: "Price", hint: "Do you want to update Product's Price?" },
  { key: "comparePrice", label: "Compare at price", hint: "Do you want to update Product's compare at price?" },
  { key: "costPrice", label: "Cost price", hint: "Do you want to update Product's cost price?" },
  { key: "barcode", label: "Barcode", hint: "Do you want to update Product's Barcode?" },
  { key: "productType", label: "Product Type", hint: "Do you want to update Product's Product type?" },
  { key: "vendor", label: "Vendor", hint: "Do you want to update Product's Vendor?" },
  { key: "image", label: "Product Image", hint: "Do you want to update Product's Image?" },
  { key: "weight", label: "Product Weight", hint: "Do you want to update Product's Weight?" },
  { key: "tags", label: "Product Tags", hint: "Do you want to update Product's Tags?" },
  { key: "styleAttributes", label: "Style Attributes", hint: "Do you want to update Product's Style attributes?" },
];

const ORDER_STATUS_RULES: Array<ToggleSpec<keyof OrderStatus>> = [
  { key: "authorized", label: "Authorized", hint: "Do you want to download authorized orders?" },
  { key: "pending", label: "Pending", hint: "Do you want to download pending orders?" },
  { key: "paid", label: "Paid", hint: "Do you want to download paid orders?" },
  { key: "partiallyPaid", label: "Partially paid", hint: "Do you want to download partially paid orders?" },
  { key: "voided", label: "Voided", hint: "Do you want to download voided orders?" },
];

const MAPPING_ROWS: MappingRowSpec[] = [
  { key: "productName", label: "Product Name", options: withPlaceholder(PRODUCT_FIELD_OPTIONS, "Select Product Name") },
  { key: "description", label: "Description", options: withPlaceholder(PRODUCT_FIELD_OPTIONS, "Select Description") },
  { key: "urlAndHandle", label: "URL & Handle", options: withPlaceholder(PRODUCT_FIELD_OPTIONS, "Select URL & Handle") },
  { key: "price", label: "Price", options: withPlaceholder(PRICE_FIELD_OPTIONS, "Select Price") },
  { key: "comparePrice", label: "Compare at price", options: withPlaceholder(PRICE_FIELD_OPTIONS, "Select Compare at price") },
  { key: "barcode", label: "Barcode", options: withPlaceholder(PRODUCT_FIELD_OPTIONS, "Select Barcode") },
  { key: "vendor", label: "Vendor", options: withPlaceholder(PRODUCT_FIELD_OPTIONS, "Select Vendor") },
  { key: "tags", label: "Tags", options: PRODUCT_FIELD_OPTIONS, multi: true },
  { key: "weight", label: "Weight", options: withPlaceholder(PRODUCT_FIELD_OPTIONS, "Select Weight") },
];

function withPlaceholder(options: Option[], label: string): Option[] {
  return [{ value: "", label }, ...options];
}

function patchBoolean<T extends Record<string, boolean>, K extends keyof T>(
  setter: Dispatch<SetStateAction<T>>,
  key: K,
  checked: boolean
) {
  setter((prev) => ({ ...prev, [key]: checked }));
}

function AlertInfo({ id }: { id: string }) {
  return (
    <div className="alert" role="status" aria-live="polite">
      <span>This alert needs your attention, but it's not super important.</span>
      <span id={id} className="alert-note" />
    </div>
  );
}

function ToggleFieldRow(props: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="field-row">
      <div className="field-copy">
        <h4>{props.label}</h4>
        <p>{props.hint}</p>
      </div>
      <div className="field-control">
        <input
          type="checkbox"
          checked={props.checked}
          onChange={(e) => props.onChange(e.target.checked)}
          aria-label={props.label}
        />
      </div>
    </div>
  );
}

function SelectControl(props: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value)} aria-label={props.ariaLabel}>
      {props.options.map((option) => (
        <option key={`${option.value}-${option.label}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export default function ShopifyMappingCartConfigurations() {
  const syncApproved = true;
  const [basic, setBasic] = useState<BasicSettings>({
    syncStatus: true,
    liveUpload: true,
    integrationType: "CompleteSync",
  });
  const [newProductMapping, setNewProductMapping] = useState<NewProductMapping>({
    productName: "Title",
    description: "Description",
    urlAndHandle: "",
    price: "Price",
    comparePrice: "",
    barcode: "UPC",
    vendor: "Brand",
    tags: [],
    weight: "",
  });
  const [newProductRules, setNewProductRules] = useState<NewProductRules>({
    productStatus: false,
    inventoryManagement: false,
    postVariantAsIndividual: false,
  });
  const [productUpdateRules, setProductUpdateRules] = useState<ProductUpdateRules>({
    productName: true,
    description: false,
    urlHandle: false,
    price: true,
    comparePrice: false,
    costPrice: true,
    barcode: true,
    productType: true,
    vendor: true,
    image: false,
    weight: false,
    tags: false,
    styleAttributes: false,
  });
  const [orderStatus, setOrderStatus] = useState<OrderStatus>({
    authorized: false,
    pending: false,
    paid: true,
    partiallyPaid: false,
    voided: false,
  });
  const [priceInclusiveTax, setPriceInclusiveTax] = useState(false);
  const [reserveStock, setReserveStock] = useState("0");
  const [storeMapRows, setStoreMapRows] = useState<StoreMappingRow[]>([
    {
      shopifyStore: "6250 Edgewater Drive ste 100",
      posStore: "a41b6c5a-cdff-4dd1-b0bd-0f589dc1abfb",
    },
  ]);
  const [pulling, setPulling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [shop, setShop] = useState<string | null>(null);
  const shopRef = useRef<string | null>(null);
  const [persistenceWarning, setPersistenceWarning] = useState("");

  function patchMapping<K extends MappingKey>(key: K, value: NewProductMapping[K]) {
    setNewProductMapping((prev) => ({ ...prev, [key]: value }));
  }

  function notify(message: string) {
    setStatus(message);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusResp = await fetch("/api/shopify/status", { cache: "no-store" });
        const statusJson = (await statusResp.json().catch(() => ({}))) as { connected?: boolean; shop?: string };
        const resolvedShop =
          statusJson?.connected && typeof statusJson.shop === "string" && statusJson.shop.trim()
            ? statusJson.shop.trim()
            : null;
        if (!cancelled) {
          shopRef.current = resolvedShop;
          setShop(resolvedShop);
          await loadConfig(resolvedShop);
        }
      } catch {
        if (!cancelled) {
          shopRef.current = null;
          await loadConfig(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadConfig(resolvedShop: string | null) {
    try {
      const url =
        resolvedShop && resolvedShop.length > 0
          ? `/api/shopify/cart-config?shop=${encodeURIComponent(resolvedShop)}`
          : "/api/shopify/cart-config";
      const resp = await fetch(url, { cache: "no-store" });
      const json = await resp.json().catch(() => ({}));
      if (!json?.config || typeof json.config !== "object") return;
      const backend = (json as { backend?: string })?.backend;
      const loadWarning = typeof (json as { warning?: string })?.warning === "string" ? (json as { warning?: string }).warning : "";
      if (backend === "memory" && loadWarning) {
        setPersistenceWarning(
          "Config is not persisted. Run scripts/migrations/add_shopify_cart_config.sql in your Supabase SQL editor to enable persistence."
        );
      }
      const cfg = json.config as Record<string, unknown>;

      if (cfg.basicSettings && typeof cfg.basicSettings === "object") {
        const bs = cfg.basicSettings as Partial<BasicSettings>;
        setBasic((prev) => ({ ...prev, ...bs }));
      }
      if (cfg.newProductMapping && typeof cfg.newProductMapping === "object") {
        const npm = cfg.newProductMapping as Partial<NewProductMapping>;
        setNewProductMapping((prev) => ({ ...prev, ...npm }));
      }
      if (cfg.newProductRules && typeof cfg.newProductRules === "object") {
        const npr = cfg.newProductRules as Partial<NewProductRules>;
        setNewProductRules((prev) => ({ ...prev, ...npr }));
      }
      if (cfg.productUpdateRules && typeof cfg.productUpdateRules === "object") {
        const pur = cfg.productUpdateRules as Partial<ProductUpdateRules>;
        setProductUpdateRules((prev) => ({ ...prev, ...pur }));
      }
      if (cfg.orderStatus && typeof cfg.orderStatus === "object") {
        const os = cfg.orderStatus as Partial<OrderStatus>;
        setOrderStatus((prev) => ({ ...prev, ...os }));
      }
      if (cfg.taxSettings && typeof cfg.taxSettings === "object") {
        const ts = cfg.taxSettings as Record<string, unknown>;
        if (typeof ts.priceInclusiveTax === "boolean") setPriceInclusiveTax(ts.priceInclusiveTax);
      }
      if (cfg.reserveStock && typeof cfg.reserveStock === "object") {
        const rs = cfg.reserveStock as Record<string, unknown>;
        if (typeof rs.value === "string") setReserveStock(rs.value);
        else if (typeof rs.value === "number") setReserveStock(String(rs.value));
      }
      if (cfg.storeMapping && typeof cfg.storeMapping === "object") {
        const sm = cfg.storeMapping as Record<string, unknown>;
        if (Array.isArray(sm.rows)) {
          setStoreMapRows(
            sm.rows.map((r: unknown) => {
              const row = (r || {}) as Partial<StoreMappingRow>;
              return {
                shopifyStore: String(row.shopifyStore || ""),
                posStore: String(row.posStore || "0"),
              };
            })
          );
        }
      }
    } catch {
      // Config not loaded yet — use defaults.
    }
  }

  async function saveSection(section: string, values: Record<string, unknown>) {
    setSaving(true);
    setPersistenceWarning("");
    notify(`Saving ${section}...`);
    try {
      const shopToUse = shopRef.current ?? shop;
      const body: Record<string, unknown> = { section, values };
      if (shopToUse) body.shop = shopToUse;
      const resp = await fetch("/api/shopify/cart-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        notify(`Error: ${json?.error || "Save failed."}`);
        return;
      }
      const warning = typeof json?.warning === "string" ? json.warning : "";
      const backend = (json as { backend?: string })?.backend;
      if (backend === "memory" || (warning && /memory|supabase|unavailable/i.test(warning))) {
        setPersistenceWarning(
          "Config was saved to memory only and will not persist across refreshes. Run scripts/supabase_schema.sql in your Supabase SQL editor to create the shopify_cart_config table."
        );
      }
      const msg = `${section} saved.`;
      notify(json?.warning ? `${msg} ${json.warning}` : msg);
    } catch (e: unknown) {
      notify(`Error: ${String((e as { message?: string } | null)?.message || "Save failed.").trim()}`);
    } finally {
      setSaving(false);
    }
  }

  async function pullMappingData() {
    if (!syncApproved) {
      notify("Sync is locked. Waiting for your app approval.");
      return;
    }
    if (pulling) return;
    setPulling(true);
    notify("Pulling catalog from Shopify... This may take a moment.");
    try {
      const resp = await fetch("/api/shopify/pull-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        pulled?: number;
        totalVariants?: number;
        message?: string;
        warning?: string;
      };
      if (!resp.ok || json.ok === false) {
        notify(`Error: ${json.error || "Pull failed."}`);
        return;
      }
      const msg = json.message || `Pulled ${json.pulled ?? 0} products.`;
      notify(json.warning ? `${msg} Warning: ${json.warning}` : msg);
    } catch (e: unknown) {
      const message =
        String((e as { message?: string } | null)?.message || "").trim() ||
        "Pull failed unexpectedly.";
      notify(`Error: ${message}`);
    } finally {
      setPulling(false);
    }
  }

  function saveReserveStock() {
    const value = reserveStock.trim();
    if (!value) {
      setReserveStock("0");
      void saveSection("reserveStock", { value: "0" });
      return;
    }
    if (!/^\d+$/.test(value)) {
      notify("Reserve Stock must be a non-negative whole number.");
      return;
    }
    void saveSection("reserveStock", { value });
  }

  function updateStoreMap(index: number, value: string) {
    const updated = storeMapRows.map((row, i) =>
      i === index ? { ...row, posStore: value } : row
    );
    setStoreMapRows(updated);
    void saveSection("storeMapping", { rows: updated });
  }

  return (
    <main className="page cart-config-page">
      {persistenceWarning ? (
        <div className="glass-panel alert alert-warning" role="alert">
          <strong>Persistence issue:</strong> {persistenceWarning}
        </div>
      ) : null}
      <section className="glass-panel hero">
        <p className="eyebrow">Shopify Mapping Inventory</p>
        <h1>Cart (Shopify - {shop || "30e7d3.myshopify.com"}) Configurations</h1>
        <p>
          Do you have any questions or feel setup is complicated?{" "}
          <Link href="/settings" className="inline-link">
            Contact us
          </Link>{" "}
          and get help from support executive.
        </p>
      </section>

      <nav className="quick-nav" aria-label="Cart configuration sections">
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
        <Link href="/studio/shopify-mapping-inventory/configurations/pos" className="quick-chip">
          POS Configurations
        </Link>
        <Link href="/studio/shopify-mapping-inventory/configurations/cart" className="quick-chip active">
          Cart Configurations
        </Link>
      </nav>

      <section className="glass-panel pull-card">
        <button
          suppressHydrationWarning
          type="button"
          className="btn-base btn-primary pull-btn"
          onClick={() => void pullMappingData()}
          disabled={pulling || !syncApproved}
        >
          {syncApproved
            ? pulling
              ? "Pulling..."
              : "Pull Mapping Data from Shopify"
            : "Pull Mapping Data from Shopify (Approval Required)"}
        </button>
      </section>

      <section className="two-col">
        <section className="column">
          <section className="glass-panel card">
            <header>
              <h2>Basic Settings</h2>
            </header>
            <AlertInfo id="basic-settings-status" />
            <div className="form-rows">
              <ToggleFieldRow
                label="Sync Status"
                hint="it shows that sync is active or paused"
                checked={basic.syncStatus}
                onChange={(checked) => setBasic((prev) => ({ ...prev, syncStatus: checked }))}
              />
              <ToggleFieldRow
                label="Live Upload"
                hint="It means that all the items coming from POS will directly route to Cart."
                checked={basic.liveUpload}
                onChange={(checked) => setBasic((prev) => ({ ...prev, liveUpload: checked }))}
              />
              <div className="field-row">
                <div className="field-copy">
                  <h4>Integration Type</h4>
                </div>
                <div className="field-control">
                  <SelectControl
                    value={basic.integrationType}
                    options={INTEGRATION_TYPE_OPTIONS}
                    onChange={(value) => setBasic((prev) => ({ ...prev, integrationType: value }))}
                    ariaLabel="Integration Type"
                  />
                </div>
              </div>
            </div>
            <div className="actions">
              <button suppressHydrationWarning type="button" className="btn-base btn-primary" disabled={saving} onClick={() => void saveSection("basicSettings", basic)}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </section>

          <section className="glass-panel card">
            <header>
              <h2>Mapping For New Products</h2>
            </header>
            <AlertInfo id="mapping-new-products-status" />
            <div className="form-rows">
              {MAPPING_ROWS.map((row) => {
                if (row.multi) {
                  return (
                    <div className="field-row" key={row.key}>
                      <div className="field-copy">
                        <h4>{row.label}</h4>
                      </div>
                      <div className="field-control">
                        <select
                          multiple
                          className="multi"
                          value={newProductMapping.tags}
                          onChange={(e) => {
                            const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                            patchMapping("tags", selected);
                          }}
                          aria-label={row.label}
                        >
                          {row.options.map((option) => (
                            <option key={`${option.value}-${option.label}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                }

                const value = String(newProductMapping[row.key] ?? "");
                return (
                  <div className="field-row" key={row.key}>
                    <div className="field-copy">
                      <h4>{row.label}</h4>
                    </div>
                    <div className="field-control">
                      <SelectControl
                        value={value}
                        options={row.options}
                        onChange={(next) => patchMapping(row.key, next as NewProductMapping[MappingKey])}
                        ariaLabel={row.label}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="actions">
              <button suppressHydrationWarning type="button" className="btn-base btn-primary" disabled={saving} onClick={() => void saveSection("newProductMapping", newProductMapping)}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </section>

          <section className="glass-panel card">
            <header>
              <h2>Rules for new products</h2>
            </header>
            <AlertInfo id="rules-new-products-status" />
            <div className="form-rows">
              {NEW_PRODUCT_RULES.map((rule) => (
                <ToggleFieldRow
                  key={rule.key}
                  label={rule.label}
                  hint={rule.hint}
                  checked={newProductRules[rule.key]}
                  onChange={(checked) => patchBoolean(setNewProductRules, rule.key, checked)}
                />
              ))}
            </div>
            <div className="actions">
              <button suppressHydrationWarning type="button" className="btn-base btn-primary" disabled={saving} onClick={() => void saveSection("newProductRules", newProductRules)}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </section>

          <section className="glass-panel card">
            <header>
              <h2>Map Stores</h2>
            </header>
            <AlertInfo id="map-stores-status" />
            <div className="store-map-wrap">
              <table className="store-map-table">
                <thead>
                  <tr>
                    <th>Shopify Store</th>
                    <th>POS Store</th>
                  </tr>
                </thead>
                <tbody>
                  {storeMapRows.map((row, index) => (
                    <tr key={`${row.shopifyStore}-${index}`}>
                      <td>{row.shopifyStore}</td>
                      <td>
                        <select
                          value={row.posStore}
                          onChange={(e) => updateStoreMap(index, e.target.value)}
                          aria-label={`POS Store for ${row.shopifyStore}`}
                        >
                          {MAP_STORE_OPTIONS.map((option) => (
                            <option key={`${option.value}-${option.label}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section className="column">
          <section className="glass-panel card">
            <header>
              <h2>Rules for product update</h2>
            </header>
            <AlertInfo id="rules-product-update-status" />
            <p className="section-note">
              Here you can set which fields you want to update in existing products in 30e7d3.myshopify.com.
            </p>
            <div className="form-rows">
              {PRODUCT_UPDATE_RULES.map((rule) => (
                <ToggleFieldRow
                  key={rule.key}
                  label={rule.label}
                  hint={rule.hint}
                  checked={productUpdateRules[rule.key]}
                  onChange={(checked) => patchBoolean(setProductUpdateRules, rule.key, checked)}
                />
              ))}
            </div>
            <div className="actions">
              <button suppressHydrationWarning type="button" className="btn-base btn-primary" disabled={saving} onClick={() => void saveSection("productUpdateRules", productUpdateRules)}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </section>

          <section className="glass-panel card">
            <header>
              <h2>Order status</h2>
            </header>
            <AlertInfo id="order-status-settings" />
            <p className="section-note">Select order statuses which you want to process in your linked POS.</p>
            <div className="form-rows">
              {ORDER_STATUS_RULES.map((rule) => (
                <ToggleFieldRow
                  key={rule.key}
                  label={rule.label}
                  hint={rule.hint}
                  checked={orderStatus[rule.key]}
                  onChange={(checked) => patchBoolean(setOrderStatus, rule.key, checked)}
                />
              ))}
            </div>
            <div className="actions">
              <button suppressHydrationWarning type="button" className="btn-base btn-primary" disabled={saving} onClick={() => void saveSection("orderStatus", orderStatus)}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </section>

          <section className="glass-panel card">
            <header>
              <h2>Tax Settings</h2>
            </header>
            <AlertInfo id="tax-settings-status" />
            <p className="section-note">
              This setting is used for order processing in a connected point of sale system or ERP.
            </p>
            <div className="form-rows">
              <ToggleFieldRow
                label="Price entered with Tax"
                hint="Product's price entered in 30e7d3.myshopify.com is inclusive tax?"
                checked={priceInclusiveTax}
                onChange={setPriceInclusiveTax}
              />
            </div>
            <div className="actions">
              <button suppressHydrationWarning type="button" className="btn-base btn-primary" disabled={saving} onClick={() => void saveSection("taxSettings", { priceInclusiveTax })}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </section>

          <section className="glass-panel card">
            <header>
              <h2>Reserve Stock</h2>
            </header>
            <AlertInfo id="reserve-stock-status" />
            <p className="section-note">Set the inventory that's excluded from selling on Shopify.</p>
            <div className="form-rows">
              <div className="field-row">
                <div className="field-copy">
                  <h4>Enter Reserve Stock</h4>
                </div>
                <div className="field-control">
                  <input
                    type="number"
                    min={0}
                    value={reserveStock}
                    onChange={(e) => setReserveStock(e.target.value)}
                    aria-label="Reserve Stock"
                  />
                </div>
              </div>
            </div>
            <div className="actions">
              <button suppressHydrationWarning type="button" className="btn-base btn-primary" disabled={saving} onClick={saveReserveStock}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </section>
        </section>
      </section>

      {status ? <p className="notice">{status}</p> : null}

      <style jsx>{`
        .cart-config-page {
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
          font-size: clamp(1.35rem, 2.7vw, 2rem);
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
        .column {
          display: grid;
          gap: 12px;
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
        }
        .alert.alert-warning {
          border-color: rgba(251, 191, 36, 0.6);
          background: rgba(251, 191, 36, 0.15);
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
        .section-note {
          margin: 0;
          color: rgba(226, 232, 240, 0.82);
          font-size: 0.82rem;
          line-height: 1.38;
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
          grid-template-columns: minmax(0, 1fr) 220px;
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
        .field-control :global(select),
        .field-control :global(input[type="number"]) {
          min-height: 38px;
          width: 100%;
          max-width: 100%;
          text-transform: none;
          font-size: 0.88rem;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 8px;
          color: #f8fafc;
          padding: 0 10px;
        }
        .field-control :global(select option) {
          color: #111827;
        }
        .field-control :global(select.multi) {
          min-height: 78px;
          padding: 6px 10px;
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
        .store-map-wrap {
          overflow-x: auto;
        }
        .store-map-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 420px;
        }
        .store-map-table th,
        .store-map-table td {
          border-bottom: 1px solid rgba(255, 255, 255, 0.09);
          text-align: left;
          padding: 10px 12px;
          font-size: 0.84rem;
          color: rgba(248, 250, 252, 0.94);
        }
        .store-map-table th {
          font-size: 0.78rem;
          color: rgba(226, 232, 240, 0.78);
          background: rgba(255, 255, 255, 0.04);
        }
        .store-map-table tr:last-child td {
          border-bottom: 0;
        }
        .store-map-table :global(select) {
          min-height: 36px;
          width: 100%;
          text-transform: none;
          font-size: 0.86rem;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 8px;
          color: #f8fafc;
          padding: 0 10px;
        }
        .store-map-table :global(select option) {
          color: #111827;
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
        @media (max-width: 760px) {
          .field-row {
            grid-template-columns: 1fr;
          }
          .field-control {
            justify-content: flex-start;
          }
        }
      `}</style>
    </main>
  );
}


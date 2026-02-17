"use client";

import Link from "next/link";

type ConfigSection = "overview" | "pos" | "cart";

type Props = {
  section?: ConfigSection;
};

function sectionTitle(section: ConfigSection) {
  if (section === "pos") return "POS Configurations";
  if (section === "cart") return "Cart Configurations";
  return "Configurations";
}

function sectionHint(section: ConfigSection) {
  if (section === "pos") {
    return "Configure source-side behavior for Lightspeed/POS synchronization.";
  }
  if (section === "cart") {
    return "Configure cart-side behavior for Shopify sync and publish rules.";
  }
  return "Choose a configuration group to manage mapping and sync settings.";
}

export default function ShopifyMappingConfigurations({ section = "overview" }: Props) {
  const title = sectionTitle(section);
  const hint = sectionHint(section);

  return (
    <main className="page configurations-page">
      <section className="glass-panel hero">
        <div className="hero-copy">
          <p className="eyebrow">Shopify Mapping Inventory</p>
          <h1>{title}</h1>
          <p>{hint}</p>
        </div>
      </section>

      <nav className="quick-nav" aria-label="Configuration sections">
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

      {section === "overview" ? (
        <section className="grid two">
          <article className="glass-panel card">
            <h2>POS Configurations</h2>
            <p>Manage source/POS-specific sync settings used before inventory is pushed to cart.</p>
            <Link href="/studio/shopify-mapping-inventory/configurations/pos" className="btn-base btn-outline action">
              Open POS Configurations
            </Link>
          </article>
          <article className="glass-panel card">
            <h2>Cart Configurations</h2>
            <p>Manage Shopify/cart-specific settings used while publishing and reconciling items.</p>
            <Link href="/studio/shopify-mapping-inventory/configurations/cart" className="btn-base btn-outline action">
              Open Cart Configurations
            </Link>
          </article>
        </section>
      ) : null}

      {section === "pos" ? (
        <section className="glass-panel card">
          <h2>POS Configurations</h2>
          <div className="fields">
            <label className="field">
              <span>Default Source Shop</span>
              <input type="text" value="CARBON JEANS COMPANY" readOnly />
            </label>
            <label className="field">
              <span>SKU Matching Strategy</span>
              <input type="text" value="customSku -> systemSku -> itemID" readOnly />
            </label>
            <label className="field">
              <span>Stock Aggregation</span>
              <input type="text" value="Sum all POS locations" readOnly />
            </label>
          </div>
          <p className="note">
            This section is wired and routable. If you want, I can connect these controls to persisted settings next.
          </p>
        </section>
      ) : null}

      {section === "cart" ? (
        <section className="glass-panel card">
          <h2>Cart Configurations</h2>
          <div className="fields">
            <label className="field">
              <span>Shopify Product Scope</span>
              <input type="text" value="status:active" readOnly />
            </label>
            <label className="field">
              <span>Variant Match Keys</span>
              <input type="text" value="SKU (primary), Barcode (fallback)" readOnly />
            </label>
            <label className="field">
              <span>Default Pending Rule</span>
              <input type="text" value="Missing Shopify variant => Pending" readOnly />
            </label>
          </div>
          <p className="note">
            This section is wired and routable. If you want, I can connect these controls to persisted settings next.
          </p>
        </section>
      ) : null}

      <style jsx>{`
        .configurations-page {
          max-width: 1240px;
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
        h1 {
          margin: 0;
          font-size: clamp(1.45rem, 2.8vw, 2rem);
          line-height: 1.14;
        }
        .hero p {
          margin: 0;
          color: rgba(226, 232, 240, 0.84);
          font-size: 0.9rem;
          line-height: 1.42;
          max-width: 800px;
        }
        .quick-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
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
        .grid.two {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .card {
          border-radius: 16px;
          padding: 14px;
          display: grid;
          gap: 10px;
        }
        .card h2 {
          margin: 0;
          font-size: 1rem;
        }
        .card p {
          margin: 0;
          color: rgba(226, 232, 240, 0.86);
          font-size: 0.84rem;
          line-height: 1.45;
        }
        .action {
          width: fit-content;
          min-height: 40px;
          padding: 0 12px;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .fields {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .field {
          display: grid;
          gap: 6px;
        }
        .field span {
          color: rgba(226, 232, 240, 0.8);
          font-size: 0.78rem;
        }
        .field input {
          min-height: 40px;
          font-size: 0.83rem;
          text-transform: none;
        }
        .note {
          margin: 0;
          color: #bfdbfe;
          border: 1px solid rgba(96, 165, 250, 0.32);
          background: rgba(30, 64, 175, 0.18);
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 0.82rem;
        }
        @media (max-width: 900px) {
          .grid.two {
            grid-template-columns: 1fr;
          }
          .fields {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}


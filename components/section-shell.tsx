"use client";

import Link from "next/link";

const links = [
  { href: "/studio/images", label: "Image Studio" },
  { href: "/studio/seo", label: "SEO Manager" },
  { href: "/studio/rfid-price-tag", label: "RFID Price Tag" },
  { href: "/studio/lightspeed-catalog", label: "Lightspeed Catalog" },
  { href: "/studio/shopify-mapping-inventory", label: "Shopify Mapping Inventory" },
  { href: "/studio/video", label: "Motion Studio" },
  { href: "/studio/social", label: "Ad Generator" },
  { href: "/ops/inventory", label: "Collection Mapper" },
  { href: "/dashboard", label: "Workspace Dashboard" },
  { href: "/settings", label: "Settings & APIs" },
];

export function SectionShell() {
  return (
    <main className="section-page">
      <section className="glass-panel links">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className="nav-chip">
            {item.label}
          </Link>
        ))}
      </section>

      <section className="glass-panel body">
        <p>
          Route scaffold is ready. Feature logic for this workspace can be implemented here while
          keeping the same shared Carbon UI system.
        </p>
      </section>

      <style jsx>{`
        .section-page {
          max-width: 1180px;
          margin: 0 auto;
          padding: 22px 8px 26px;
          display: grid;
          gap: 14px;
          color: #f8fafc;
        }
        .links,
        .body {
          padding: 18px;
        }
        p {
          margin: 10px 0 0;
          color: rgba(226, 232, 240, 0.82);
          font-size: 1rem;
          line-height: 1.45;
        }
        .links {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .nav-chip {
          text-decoration: none;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.04);
          color: #f8fafc;
          padding: 9px 14px;
          font-size: 0.84rem;
          font-weight: 700;
          white-space: nowrap;
          transition: 150ms ease;
        }
        .nav-chip:hover {
          border-color: rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </main>
  );
}

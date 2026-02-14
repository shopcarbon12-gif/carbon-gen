import Link from "next/link";

type SectionShellProps = {
  title: string;
  description: string;
};

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/studio/images", label: "Image Studio" },
  { href: "/studio/video", label: "Motion Studio" },
  { href: "/studio/social", label: "Ad Generator" },
  { href: "/ops/seo", label: "Content & SEO" },
  { href: "/ops/inventory", label: "Collection Mapper" },
  { href: "/generate", label: "Generate" },
  { href: "/vault", label: "Vault" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export function SectionShell({ title, description }: SectionShellProps) {
  return (
    <main style={{ maxWidth: 960, margin: "48px auto", padding: 24, fontFamily: "system-ui" }}>
      <header style={{ display: "grid", gap: 8 }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        <p style={{ margin: 0, color: "#555" }}>{description}</p>
      </header>

      <nav
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 16,
          padding: 12,
          borderRadius: 10,
          border: "1px solid #e6e6e6",
          background: "#fafafa",
        }}
      >
        {links.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>

      <section
        style={{
          marginTop: 16,
          border: "1px solid #e6e6e6",
          borderRadius: 10,
          padding: 16,
          background: "white",
        }}
      >
        <p style={{ margin: 0 }}>
          This route is now active and protected. Build feature logic here without touching auth
          or middleware.
        </p>
      </section>
    </main>
  );
}

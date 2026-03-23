import Link from "next/link";

export default function InstagramWidgetPostPage() {
  return (
    <main style={{ padding: "22px 16px", color: "#f8fafc", maxWidth: 720 }}>
      <p style={{ marginBottom: 12 }}>
        <Link href="/studio/instagram-widget/layout" style={{ color: "rgba(148, 163, 184, 0.95)" }}>
          ← Layout
        </Link>
      </p>
      <h1 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Post</h1>
      <p style={{ color: "rgba(226, 232, 240, 0.85)", lineHeight: 1.5 }}>
        Post card behavior and icons (Phase 2/3).
      </p>
    </main>
  );
}

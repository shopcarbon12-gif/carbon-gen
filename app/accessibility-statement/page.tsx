import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accessibility Statement | Carbon",
  description:
    "Carbon’s commitment to digital accessibility, assistive features, and how to request support.",
};

export default function AccessibilityStatementPage() {
  return (
    <main
      className="mx-auto max-w-3xl px-5 py-12 text-zinc-100"
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0c0a12 0%, #12101c 40%, #0a0814 100%)",
      }}
    >
      <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        Accessibility statement
      </h1>
      <p className="mt-3 text-base text-zinc-400">
        Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
      </p>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-zinc-300">
        <h2 className="text-lg font-semibold text-white">Our commitment</h2>
        <p>
          CARBON is committed to making our website usable for people with disabilities. We strive to align with the
          Web Content Accessibility Guidelines (WCAG) 2.1 Level AA and to improve our store over time.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-zinc-300">
        <h2 className="text-lg font-semibold text-white">Assistive tools</h2>
        <p>
          Our site includes <strong className="text-zinc-200">Carbon Assist</strong>, an accessibility menu. Use the
          accessibility icon on the screen to adjust text size, contrast, motion, reading tools, and more.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-zinc-300">
        <h2 className="text-lg font-semibold text-white">Third-party content</h2>
        <p>
          Some embedded content (videos, maps, checkout or payment experiences from partners) may not be fully
          controlled by us. If something is hard to use, please contact us and we will help or provide an
          alternative where possible.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-zinc-300">
        <h2 className="text-lg font-semibold text-white">Feedback</h2>
        <p>
          If you experience difficulty accessing any part of our store, contact us at{" "}
          <a
            className="text-violet-300 underline decoration-violet-500/50 underline-offset-2 hover:text-violet-200"
            href="mailto:support@shopcarbon.com"
          >
            support@shopcarbon.com
          </a>{" "}
          or through our{" "}
          <a
            className="text-violet-300 underline decoration-violet-500/50 underline-offset-2 hover:text-violet-200"
            href="https://www.shopcarbon.com/pages/contact-us"
          >
            contact page
          </a>
          . We aim to respond within two business days.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-zinc-300">
        <h2 className="text-lg font-semibold text-white">Formal complaints</h2>
        <p>
          If you are not satisfied with our response, you may contact a local disability rights organization or the
          relevant authority in your region.
        </p>
      </section>

      <p className="mt-14 text-sm text-zinc-500">
        This page may be hosted on{" "}
        <a className="text-zinc-400 underline underline-offset-2" href="https://www.shopcarbon.com">
          shopcarbon.com
        </a>{" "}
        or linked from your storefront footer and the Carbon Assist widget.
      </p>
    </main>
  );
}

"use client";

export type PremiumSegmentedTabId = "docs" | "tickets" | "log-history" | "widget";

const TABS: { id: PremiumSegmentedTabId; label: string }[] = [
  { id: "docs", label: "Docs" },
  { id: "tickets", label: "Tickets" },
  { id: "log-history", label: "Log History" },
  { id: "widget", label: "Widget" },
];

export type PremiumSegmentedNavProps = {
  activeTab: PremiumSegmentedTabId;
  onTabChange: (id: PremiumSegmentedTabId) => void;
  onPublish: () => void;
  publishDisabled?: boolean;
  publishPending?: boolean;
  className?: string;
};

/**
 * Premium dark sci-fi segmented control + publish — glass shell, lavender active glow, minimal chevron.
 * Visuals: layered gradients / inset depth / low-contrast borders (not flat SaaS header).
 */
export function PremiumSegmentedNav({
  activeTab,
  onTabChange,
  onPublish,
  publishDisabled,
  publishPending,
  className,
}: PremiumSegmentedNavProps) {
  return (
    <div
      className={[
        "relative mx-auto w-full max-w-[min(680px,92vw)]",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Soft atmospheric wash behind the glass shell */}
      <div
        className="pointer-events-none absolute -inset-[3px] rounded-[18px] opacity-[0.95]"
        style={{
          background:
            "radial-gradient(ellipse 88% 72% at 16% 108%, rgba(150, 95, 165, 0.2) 0%, transparent 54%), radial-gradient(ellipse 72% 52% at 90% -8%, rgba(110, 85, 170, 0.16) 0%, transparent 48%)",
        }}
        aria-hidden
      />

      {/* Outer frame: floating centered glass panel — plum / aubergine, not crushed black */}
      <div
        className={[
          "relative flex min-h-[50px] w-full items-center justify-between gap-6 rounded-[16px] border px-3 py-2 sm:min-h-[52px] sm:gap-8 sm:px-4 sm:py-2.5",
          "border-[color-mix(in_srgb,rgba(210,190,240,0.22)_42%,rgba(90,70,125,0.38))]",
          "bg-[linear-gradient(168deg,rgba(255,255,255,0.1)_0%,transparent_44%),linear-gradient(180deg,rgba(58,46,88,0.48)_0%,rgba(38,30,62,0.72)_50%,rgba(28,22,48,0.8)_100%)]",
          "shadow-[0_14px_48px_rgba(32,18,52,0.38),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(45,35,72,0.32)]",
          "backdrop-blur-md",
        ].join(" ")}
      >
        {/* Segmented tabs */}
        <div
          className={[
            "flex shrink-0 overflow-hidden rounded-[11px] border p-[2px]",
            "border-[color-mix(in_srgb,rgba(255,255,255,0.12)_48%,rgba(75,58,108,0.42))]",
            "bg-[linear-gradient(180deg,rgba(72,60,102,0.38)_0%,rgba(46,38,72,0.52)_100%)]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(48,38,72,0.28)]",
          ].join(" ")}
        >
          {TABS.map((tab, i) => {
            const active = activeTab === tab.id;
            const isFirst = i === 0;
            const isLast = i === TABS.length - 1;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={[
                  "relative min-h-[36px] px-3.5 py-1.5 text-[13px] font-medium tracking-[0.05em] transition-all duration-200 sm:min-h-[38px] sm:px-[17px] sm:py-2",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,rgba(196,181,250,0.55),transparent)]",
                  isFirst ? "rounded-l-[9px]" : "",
                  isLast ? "rounded-r-[9px]" : "border-r border-[color-mix(in_srgb,rgba(255,255,255,0.1)_55%,transparent)]",
                  active
                    ? [
                        /* Active tab: premium but quieter than Publish */
                        "z-[1] text-white",
                        "bg-[linear-gradient(180deg,rgba(98,80,138,0.58)_0%,rgba(64,52,96,0.74)_100%)]",
                        "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(48,40,78,0.35),0_0_14px_rgba(130,110,185,0.14)]",
                      ].join(" ")
                    : [
                        "text-[color-mix(in_srgb,rgba(255,255,255,0.82)_58%,rgba(200,188,232,0.42))]",
                        "bg-[linear-gradient(180deg,rgba(52,44,78,0.35)_0%,rgba(40,34,62,0.48)_100%)]",
                        "hover:bg-[linear-gradient(180deg,rgba(62,52,90,0.45)_0%,rgba(48,40,72,0.58)_100%)]",
                        "hover:text-white/92",
                      ].join(" "),
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Publish — strongest action in the bar (above active tab) */}
        <button
          type="button"
          onClick={onPublish}
          disabled={publishDisabled || publishPending}
          className={[
            "group relative inline-flex shrink-0 overflow-hidden",
            "min-h-[46px] items-stretch rounded-[15px] border pl-5 pr-2 py-2",
            "border-[color-mix(in_srgb,rgba(238,218,255,0.48)_42%,rgba(85,65,125,0.52))]",
            "bg-[linear-gradient(168deg,rgba(255,255,255,0.19)_0%,rgba(255,255,255,0.05)_30%,transparent_58%),linear-gradient(180deg,rgba(92,74,138,0.72)_0%,rgba(52,42,92,0.86)_50%,rgba(26,20,48,0.96)_100%)]",
            "shadow-[0_24px_58px_rgba(5,0,22,0.62),0_0_0_1px_rgba(255,255,255,0.11)_inset,0_1px_0_rgba(255,255,255,0.22)_inset,0_-1px_0_rgba(0,0,0,0.38)_inset,0_0_46px_color-mix(in_srgb,rgba(175,140,230,0.24),transparent)]",
            "text-[13px] font-semibold tracking-[0.075em] text-white",
            "transition-[box-shadow,transform,filter] duration-200",
            "hover:shadow-[0_28px_64px_rgba(8,2,30,0.64),0_0_0_1px_rgba(255,255,255,0.13)_inset,0_1px_0_rgba(255,255,255,0.26)_inset,0_0_52px_color-mix(in_srgb,rgba(185,150,235,0.28),transparent)]",
            "hover:-translate-y-px",
            "active:translate-y-0 active:shadow-[0_14px_40px_rgba(0,0,0,0.45)]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,rgba(210,195,250,0.6),transparent)]",
            "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:shadow-[0_24px_58px_rgba(5,0,22,0.62)]",
          ].join(" ")}
        >
          <span
            className="pointer-events-none absolute inset-0 opacity-100"
            style={{
              background:
                "linear-gradient(102deg, transparent 0%, transparent 32%, rgba(95, 70, 130, 0.08) 58%, rgba(175, 135, 210, 0.2) 100%)",
            }}
            aria-hidden
          />
          <span
            className="pointer-events-none absolute right-0 top-0 h-full w-[46%] rounded-r-[14px] opacity-95"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(120, 85, 165, 0.12) 35%, rgba(165, 125, 210, 0.2) 100%)",
            }}
            aria-hidden
          />
          <span className="relative z-[1] flex min-w-0 flex-1 items-center justify-between gap-3 pl-0.5">
            <span className="min-w-0 truncate pr-1">
              {publishPending ? "Saving…" : "Publish Changes"}
            </span>
            <span
              className={[
                "inline-flex h-10 min-w-[2.75rem] shrink-0 items-center justify-center rounded-[11px]",
                "border border-[color-mix(in_srgb,rgba(255,255,255,0.26)_48%,rgba(150,120,200,0.5))]",
                "bg-[linear-gradient(155deg,rgba(255,255,255,0.22)_0%,rgba(175,145,215,0.14)_42%,rgba(42,32,78,0.72)_100%)]",
                "shadow-[inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-1px_0_rgba(0,0,0,0.25),0_0_26px_color-mix(in_srgb,rgba(170,135,220,0.28),transparent)]",
                "text-[color-mix(in_srgb,rgba(255,255,255,0.98)_92%,rgba(225,210,255,0.5))]",
                "transition-[box-shadow,transform] duration-200",
                "group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_0_32px_color-mix(in_srgb,rgba(190,155,235,0.32),transparent)]",
              ].join(" ")}
              aria-hidden
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M10.5 7.5L15 12l-4.5 4.5"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

export { TABS as premiumSegmentedNavTabs };

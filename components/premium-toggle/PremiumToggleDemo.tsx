"use client";

import { PremiumSettingsRow } from "./PremiumSettingsRow";

/**
 * Drop-in preview: Tailwind sets scene + frame; toggle chrome is bespoke CSS.
 */
export function PremiumToggleDemo() {
  return (
    <div
      className="min-h-[240px] w-full max-w-md rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#12151f] via-[#0a0c12] to-[#05060a] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      style={{
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.04), 0 24px 80px rgba(0,0,0,0.55)",
      }}
    >
      <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        Accessibility · motion
      </p>
      <PremiumSettingsRow
        titleId="premium-toggle-demo-pause"
        title="Pause animations"
        hint="Stops decorative motion for this session. Pair with your motion policy in the panel footer."
        toggleProps={{ defaultChecked: false }}
      />
    </div>
  );
}

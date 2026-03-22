"use client";

import type { ReactNode } from "react";
import { PremiumToggle, type PremiumToggleProps } from "./PremiumToggle";
import "./premium-toggle.css";

type PremiumSettingsRowProps = {
  title: string;
  hint?: string;
  titleId: string;
  children?: ReactNode;
  toggleProps?: Omit<PremiumToggleProps, "aria-labelledby">;
  className?: string;
};

/**
 * Example settings row: bespoke panel chrome from CSS + Tailwind for outer spacing only.
 */
export function PremiumSettingsRow({
  title,
  hint,
  titleId,
  children,
  toggleProps,
  className,
}: PremiumSettingsRowProps) {
  return (
    <div
      className={["pt-settings-row", className].filter(Boolean).join(" ")}
    >
      <div className="pt-settings-row__text">
        <p className="pt-settings-row__title" id={titleId}>
          {title}
        </p>
        {hint ? <p className="pt-settings-row__hint">{hint}</p> : null}
      </div>
      <div className="pt-settings-row__control">
        {children ?? (
          <PremiumToggle aria-labelledby={titleId} {...toggleProps} />
        )}
      </div>
    </div>
  );
}

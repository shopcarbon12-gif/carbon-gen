"use client";

import { useCallback, useId, useState, type ReactNode } from "react";
import styles from "./profile-mode-strip.module.css";

export type ProfileModeId =
  | "retail"
  | "low-vision"
  | "motor"
  | "blind"
  | "dyslexia"
  | "adhd"
  | "seizure"
  | "new";

const MODES: {
  id: ProfileModeId;
  label: string;
  icon: ReactNode;
  isNew?: boolean;
}[] = [
  {
    id: "retail",
    label: "Retail",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 10.5V20h4v-6h8v6h4V10.5L12 4 4 10.5Z"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinejoin="round"
        />
        <path d="M9 20v-4h6v4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "low-vision",
    label: "Low Vision",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" opacity="0.88" />
      </svg>
    ),
  },
  {
    id: "motor",
    label: "Motor",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3v3M9 6h6M10 9c-1 3-2 6-2 9h8c0-3-1-6-2-9h-4Z"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 21h8" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "blind",
    label: "Screen reader",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6 14a8 8 0 0 1 12 0M9 18h6M12 5v2M8 7l1.5 1.5M16 7l-1.5 1.5"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.45" />
      </svg>
    ),
  },
  {
    id: "dyslexia",
    label: "Dyslexia",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 8h14M5 12h10M5 16h14" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
        <path
          d="M17 10l2 2-2 2"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: "adhd",
    label: "ADHD",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3l1.2 3.2L16.5 8l-3.3.8L12 12l-1.2-3.2L7.5 8l3.3-.8L12 3Z"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinejoin="round"
        />
        <path
          d="M8 17h8M9 20h6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.88"
        />
      </svg>
    ),
  },
  {
    id: "seizure",
    label: "Seizure safe",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 21a9 9 0 1 0-9-9c0 1.2.24 2.34.68 3.38L12 21l8.32-5.62A9 9 0 0 0 12 3Z"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinejoin="round"
        />
        <path
          d="M10.5 8.5L14 12l-3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: "new",
    label: "New",
    isNew: true,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 8.5v7M8.5 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export type ProfileModeStripProps = {
  className?: string;
  /** Initial mode when uncontrolled. */
  defaultMode?: ProfileModeId | null;
  /** Controlled selection; `null` = no segment highlighted (e.g. Screen reader / Seizure from pills). */
  value?: ProfileModeId | null;
  onModeChange?: (id: ProfileModeId) => void;
};

export function ProfileModeStrip({
  className,
  defaultMode = "retail",
  value: valueProp,
  onModeChange,
}: ProfileModeStripProps) {
  const uid = useId();
  const [uncontrolled, setUncontrolled] = useState<ProfileModeId | null>(defaultMode ?? "retail");
  const isControlled = valueProp !== undefined;
  const active: ProfileModeId | null = isControlled ? (valueProp ?? null) : uncontrolled;

  const select = useCallback(
    (id: ProfileModeId) => {
      if (!isControlled) setUncontrolled(id);
      onModeChange?.(id);
    },
    [isControlled, onModeChange]
  );

  return (
    <div
      className={[styles.shell, className].filter(Boolean).join(" ")}
      role="toolbar"
      aria-label="Accessibility profile presets"
    >
      {MODES.map((mode) => {
        const activeSeg = active !== null && active === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            id={`${uid}-${mode.id}`}
            aria-pressed={activeSeg}
            className={[
              styles.segment,
              activeSeg ? styles.segmentActive : "",
              mode.isNew ? styles.segmentNew : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => select(mode.id)}
          >
            <span className={styles.iconWrap}>{mode.icon}</span>
            <span className={styles.label}>{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}

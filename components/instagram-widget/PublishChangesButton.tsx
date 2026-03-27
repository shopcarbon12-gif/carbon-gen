"use client";

import type { ButtonHTMLAttributes } from "react";
import styles from "./publish-changes-button.module.css";

type Props = {
  loading?: boolean;
  label?: string;
  loadingLabel?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">;

function ChevronRightIcon() {
  return (
    <svg
      className={styles.publishChevron}
      width={14}
      height={14}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 6l6 6-6 6" />
    </svg>
  );
}

export function PublishChangesButton({
  loading = false,
  label = "Publish Changes",
  loadingLabel = "Saving...",
  className,
  disabled,
  children,
  ...rest
}: Props) {
  const text = loading ? loadingLabel : children ?? label;
  return (
    <button
      type="button"
      className={[styles.publishBtn, className].filter(Boolean).join(" ")}
      {...rest}
      disabled={disabled || loading}
    >
      <span className={styles.publishMain}>{text}</span>
      <span className={styles.publishChevronCell}>
        <ChevronRightIcon />
      </span>
    </button>
  );
}

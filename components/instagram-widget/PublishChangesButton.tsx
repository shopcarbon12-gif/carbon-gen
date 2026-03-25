"use client";

import type { ButtonHTMLAttributes } from "react";
import btnStyles from "./publish-changes-button.module.css";

type Props = {
  loading?: boolean;
  label?: string;
  loadingLabel?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">;

export function PublishChangesButton({
  loading = false,
  label = "Publish Changes",
  loadingLabel = "Saving...",
  className,
  disabled,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={[btnStyles.publishBtn, className].filter(Boolean).join(" ")}
      {...rest}
      disabled={disabled || loading}
    >
      <span className={btnStyles.buttonLabelWithTriangle}>
        <span>{loading ? loadingLabel : children ?? label}</span>
        <span
          className={`${btnStyles.glossyTriangle} ${btnStyles.glossyTriangleRight}`}
          aria-hidden
        />
      </span>
    </button>
  );
}

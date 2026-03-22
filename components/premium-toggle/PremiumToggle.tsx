"use client";

import {
  forwardRef,
  useCallback,
  useId,
  type ChangeEvent,
  type InputHTMLAttributes,
} from "react";
import "./premium-toggle.css";

export type PremiumToggleProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "className"
> & {
  /** Visually hidden label when not using `aria-labelledby` from a parent row */
  "aria-label"?: string;
  /** ID of element(s) that label this switch (e.g. settings row title) */
  "aria-labelledby"?: string;
  className?: string;
  /** Wrapper class for alignment in toolbars / rows */
  wrapperClassName?: string;
};

/**
 * Bespoke capsule switch — styles live in `premium-toggle.css` (not utility-flat).
 * Use inside a panel row with `aria-labelledby` pointing at the row title, or pass `aria-label`.
 */
export const PremiumToggle = forwardRef<HTMLInputElement, PremiumToggleProps>(
  function PremiumToggle(
    {
      className,
      wrapperClassName,
      defaultChecked,
      checked,
      onChange,
      disabled,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      id: idProp,
      ...rest
    },
    ref
  ) {
    const uid = useId();
    const id = idProp ?? `pt-switch-${uid}`;

    const handleChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        onChange?.(e);
      },
      [onChange]
    );

    return (
      <span
        className={["pt-scope inline-flex", wrapperClassName].filter(Boolean).join(" ")}
      >
        <label className={["pt-switch", className].filter(Boolean).join(" ")}>
          <input
            ref={ref}
            id={id}
            type="checkbox"
            role="switch"
            className="pt-switch__input"
            defaultChecked={defaultChecked}
            checked={checked}
            onChange={handleChange}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            {...rest}
          />
          <span className="pt-switch__face" aria-hidden="true">
            <span className="pt-switch__glow" />
            <span className="pt-switch__track" />
            <span className="pt-switch__thumb" />
          </span>
        </label>
      </span>
    );
  }
);

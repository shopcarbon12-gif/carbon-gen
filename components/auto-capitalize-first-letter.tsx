"use client";

import { useEffect } from "react";

function capitalizeFirstTypedLetter(value: string) {
  return value.replace(/^(\s*)([a-z])/, (_, prefix: string, ch: string) => `${prefix}${ch.toUpperCase()}`);
}

function shouldAutoCapElement(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;

  const type = String(target.type || "text").toLowerCase();
  if (type !== "text" && type !== "search" && type !== "tel") return false;
  return true;
}

export default function AutoCapitalizeFirstLetter() {
  useEffect(() => {
    const onInput = (event: Event) => {
      const target = event.target;
      if (!shouldAutoCapElement(target)) return;
      if (target.disabled || target.readOnly) return;
      if (target.dataset.noAutoCapitalize === "true") return;

      const current = target.value;
      if (!current) return;

      const next = capitalizeFirstTypedLetter(current);
      if (next === current) return;

      const start = target.selectionStart;
      const end = target.selectionEnd;
      const dir = target.selectionDirection;

      target.value = next;

      if (start !== null && end !== null) {
        try {
          target.setSelectionRange(start, end, dir || "none");
        } catch {
          // Ignore controls that do not support restoring selection.
        }
      }
    };

    document.addEventListener("input", onInput, true);
    return () => document.removeEventListener("input", onInput, true);
  }, []);

  return null;
}


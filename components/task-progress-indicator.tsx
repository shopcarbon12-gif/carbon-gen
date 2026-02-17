"use client";

import StudioStatusBar from "@/components/studio-status-bar";
type ProgressTone = "idle" | "running" | "success" | "error";

export default function TaskProgressIndicator(props: {
  label: string;
  progress: number;
  tone: ProgressTone;
}) {
  const safeProgress = Number.isFinite(props.progress)
    ? Math.min(100, Math.max(0, Math.round(props.progress)))
    : 0;
  const tone = props.tone === "running" ? "working" : props.tone;

  return (
    <StudioStatusBar
      tone={tone}
      message={props.label || "Ready."}
      meta={tone === "working" ? `Task progress: ${safeProgress}%` : undefined}
    />
  );
}

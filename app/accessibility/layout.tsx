import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function AccessibilityLayout({ children }: { children: ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}

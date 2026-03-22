import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AccessibilityRightRail } from "./accessibility-right-rail";

export default function AccessibilityLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell rightRailExtra={<AccessibilityRightRail />}>
      {children}
    </WorkspaceShell>
  );
}

import { WorkspaceShell } from "@/components/workspace-shell";
import type { ReactNode } from "react";

export default function ShopifyCollectionMappingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}

import type { ReactNode } from "react";

export default function CartsInventoryLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        .app-bg-top-photo,
        .app-bg-top-fade {
          display: block !important;
          --app-bg-top-cut: 245px;
          clip-path: inset(0 0 calc(100% - var(--app-bg-top-cut)) 0);
        }
      `}</style>
      {children}
    </>
  );
}

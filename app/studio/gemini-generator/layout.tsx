import type { ReactNode } from "react";

export default function GeminiGeneratorLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        .app-bg-top-photo,
        .app-bg-top-fade {
          display: block !important;
          --app-bg-top-cut: 245px;
        }

        .app-bg-top-photo,
        .app-bg-top-fade {
          clip-path: inset(0 0 calc(100% - var(--app-bg-top-cut)) 0);
        }
      `}</style>
      {children}
    </>
  );
}

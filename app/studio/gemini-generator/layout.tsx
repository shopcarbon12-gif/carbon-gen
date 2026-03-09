import type { ReactNode } from "react";

export default function GeminiGeneratorLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        .app-bg-top-photo,
        .app-bg-top-fade {
          display: none !important;
        }
      `}</style>
      {children}
    </>
  );
}

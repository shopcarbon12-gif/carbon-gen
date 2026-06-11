import type { ReactNode } from "react";

export default function StudioOpenAiV2Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        .app-bg-top-photo,
        .app-bg-top-fade {
          display: block !important;
          --app-bg-top-cut: 245px;
          clip-path: inset(0 0 calc(100% - var(--app-bg-top-cut)) 0);
        }
        /* Start the page content right after the 245px background patch, not behind it.
           Route-scoped: this <style> only mounts while the V2 generator page is active. */
        .content {
          padding-top: 245px !important;
        }
      `}</style>
      {children}
    </>
  );
}

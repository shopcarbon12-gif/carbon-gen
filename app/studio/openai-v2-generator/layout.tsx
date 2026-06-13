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
        /* Mobile only: remove the top background patch entirely and pull content
           back to the normal mobile topbar offset (no 245px gap). Desktop keeps
           the patch. Scoped to this route because the <style> only mounts here. */
        @media (max-width: 900px) {
          .app-bg-top-photo,
          .app-bg-top-fade {
            display: none !important;
          }
          .content {
            padding-top: calc(
              var(--shell-mobile-topbar-inner-height) + var(--shell-mobile-topbar-border)
            ) !important;
          }
        }
      `}</style>
      {children}
    </>
  );
}

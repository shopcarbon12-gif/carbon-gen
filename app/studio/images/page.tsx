"use client";

import dynamic from "next/dynamic";

const StudioWorkspace = dynamic(() => import("@/components/studio-workspace"), {
  ssr: false,
});

export default function StudioImagesPage() {
  return <StudioWorkspace mode="images" />;
}

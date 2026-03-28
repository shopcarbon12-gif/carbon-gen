"use client";

import { createContext, useContext } from "react";

export type InstagramToolbarFreezeRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type InstagramStudioPreviewValue = {
  mobilePreview: boolean;
  toolbarFreezeRect: InstagramToolbarFreezeRect | null;
};

const InstagramStudioMobilePreviewContext = createContext<InstagramStudioPreviewValue>({
  mobilePreview: false,
  toolbarFreezeRect: null,
});

export function useInstagramStudioPreview() {
  return useContext(InstagramStudioMobilePreviewContext);
}

export { InstagramStudioMobilePreviewContext };

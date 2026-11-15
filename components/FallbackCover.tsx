"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_COVER } from "@/lib/siteMedia";

const Ctx = createContext<string>(DEFAULT_COVER);

/** Admin'in yüklediği “varsayılan kapak görseli” (home.cover.fallback) — görseli olmayan kartlarda kullanılır. */
export function FallbackCoverProvider({ url, children }: { url?: string | null; children: ReactNode }) {
  return <Ctx.Provider value={url || DEFAULT_COVER}>{children}</Ctx.Provider>;
}

export function useFallbackCover(): string {
  return useContext(Ctx);
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DampingVar | Doğru Parça. Her Yol İçin.", template: "%s | DampingVar" },
  description: "Aracına uygun otomotiv yedek parçasını bul. Orijinal, yan sanayi ve muadil teklifleri mağaza ve fiyatına göre karşılaştır.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="tr"><body><SiteHeader />{children}<SiteFooter /></body></html>;
}

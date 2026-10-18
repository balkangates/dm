import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://dampingvar.com"),
  title: {
    default: "DampingVar — Alışverişten Önce DampingVar'a Bak",
    template: "%s · DampingVar",
  },
  description:
    "DampingVar; online fırsatları ve yakınındaki işletme kampanyalarını keşfettiğin, işletmelerin ise görünürlük, kampanya yönetimi, QR takibi, yönlendirme ve AI pazarlama hizmeti satın aldığı dijital müşteri kazanım platformudur. Alışveriş ve ödeme doğrudan mağaza veya harici satıcı ile müşteri arasındadır.",
  keywords: [
    "kampanya", "indirim", "online fırsat", "affiliate", "yakınımdaki kampanyalar",
    "QR kampanya", "yerel işletme", "dijital pazarlama", "reklam", "DampingVar",
  ],
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "DampingVar",
    title: "DampingVar — Alışverişten Önce DampingVar'a Bak",
    description:
      "Online fırsatları keşfet, yakınındaki işletmelerin kampanyalarını incele ve alışverişine uygun indirimleri bul.",
  },
  twitter: { card: "summary_large_image", title: "DampingVar", description: "Alışverişten Önce DampingVar'a Bak." },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}

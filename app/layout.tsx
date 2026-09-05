import type { Metadata } from 'next';
import { AuthProvider } from '@/components/AuthProvider';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import ReferralCapture from '@/components/ReferralCapture';
import './globals.css';

export const metadata: Metadata = {
  title: 'DampingVar | Sektör Bazlı Canlı Satış Pazaryeri',
  description: 'Tedarikçi, bayi ve müşterileri canlı yayınla buluşturan sektör bazlı pazaryeri.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
        />
      </head>
      <body className="bg-[#0A0E1A] text-[#A3B3D1] flex flex-col min-h-screen">
        <AuthProvider>
          <ReferralCapture />
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}

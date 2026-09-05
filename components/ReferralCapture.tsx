'use client';
import { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { captureReferralFromUrl, applyStoredReferralIfAny } from '@/lib/referral';

/** Görünmez, her sayfada mount olur. Bilinçli olarak useSearchParams
 * KULLANMIYORUZ — Next.js statik sayfalarda Suspense sınırı zorunlu
 * kılıyor ve bu bileşen kök layout'ta (her yerde) olduğu için tüm
 * sayfaları Suspense'e sokmak istemiyoruz. window.location.search
 * okumak, tek seferlik client-only bir iş için yeterli. */
export default function ReferralCapture() {
  const { user } = useAuth();

  useEffect(() => {
    captureReferralFromUrl();
  }, []);

  useEffect(() => {
    if (user) applyStoredReferralIfAny();
  }, [user]);

  return null;
}

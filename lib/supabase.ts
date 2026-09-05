// lib/supabase.ts
// Client Component'ler (CustomerHome, StoreLiveViewer, LiveStream, dealer
// paneli vb.) için tek bir tarayıcı Supabase istemcisi. Vite sürümündeki
// src/lib/supabase.ts'in küçültülmüş hâli — eski genel pazar yeri
// fonksiyonları (createOrder/products tablosu vb.) BİLEREK taşınmadı,
// çünkü o eski sepet/sipariş hattı zaten devre dışı bırakılmıştı
// (bkz. proje geçmişi: "index.html'de eski sepet modülü" düzeltmesi).
import { createClient } from './supabase/client';

export const supabase = createClient();

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  balance: number;
  rating: number;
  avatar_url: string | null;
  company_name: string | null;
  referral_code: string | null;
  phone: string | null;
  address: string | null;
  rumuz: string | null;
  permissions: Record<string, unknown>;
  tax_number: string | null;
  tax_office: string | null;
  national_id: string | null;
  iban: string | null;
  bank_name: string | null;
  // fix_phase9_dual_role.sql — role tek değerli "birincil panel" olarak
  // kalıyor, bu iki bayrak "bu panele de erişimi var mı"yı taşıyor
  // (biri hem bayi hem tedarikçi olabilir).
  is_dealer: boolean;
  is_supplier: boolean;
}

export async function getProfile(userId: string) {
  return supabase.from('profiles').select('*').eq('id', userId).single();
}

// LiveKit izleyici token'ı — bkz. supabase/functions/live-token
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Faz 10: resetPasswordForEmail'in redirectTo'su gibi, tarayıcıdan
// üretilemeyen (SSR/e-posta linki) mutlak URL'ler için.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export interface LiveViewerToken {
  token: string;
  ws_url: string;
  room: string;
}

export async function getLiveViewerToken(storeId: string): Promise<LiveViewerToken> {
  const { data: sessionData } = await supabase.auth.getSession();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/live-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData?.session?.access_token ?? SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ store_id: storeId, role: 'viewer' }),
  });
  const payload = await resp.json();
  if (!resp.ok) throw new Error(payload.error || 'Yayın izleme token\u2019ı alınamadı');
  return payload as LiveViewerToken;
}

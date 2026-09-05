// lib/stores.ts — Faz 8: Whatnot tarzı mağaza keşif sayfası veri katmanı.
// fix_phase8_store_discovery.sql'deki v_store_cards view'ına bağlı.
import { supabase } from './supabase';
import { getCurrentPosition } from './geo';

export interface Sector {
  id: string;
  label: string;
  icon: string;
  color: string;
  color2: string;
  slogan: string | null;
}

export interface StoreCard {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  logo_url: string | null;
  is_live: boolean;
  live_viewer_count: number;
  follower_count: number;
  like_count: number;
  sector_ids: string[];
  distance_km: number | null;
}

export async function loadSectors(): Promise<Sector[]> {
  const { data, error } = await supabase
    .from('sectors')
    .select('id, label, icon, color, color2, slogan')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Konum izni varsa mesafeyi de hesaplar; yoksa distance_km null döner (sessizce). */
export async function loadStoreCards(): Promise<StoreCard[]> {
  const { data, error } = await supabase
    .from('v_store_cards')
    .select('*')
    .order('is_live', { ascending: false })
    .order('follower_count', { ascending: false });
  if (error) throw error;

  let pos: { lat: number; lng: number } | null = null;
  try {
    pos = await getCurrentPosition();
  } catch {
    // konum reddedildi/desteklenmiyor — mesafesiz devam
  }

  return (data ?? []).map((s) => ({
    ...s,
    sector_ids: s.sector_ids ?? [],
    distance_km:
      pos && s.lat != null && s.lng != null ? haversineKm(pos.lat, pos.lng, s.lat, s.lng) : null,
  }));
}

"use client";

/**
 * Konum + yerel işletme araması için küçük istemci deposu.
 * Konum YALNIZCA tarayıcıda tutulur (sessionStorage); sunucuya gönderilmez. Mesafe hesabı tarayıcıda yapılır.
 * Hero arama formu ile "Yerel işletmeler" bölümü bu depoyu paylaşır.
 */
import { useSyncExternalStore } from "react";

export type GeoPos = { lat: number; lng: number };
export type GeoStatus = "idle" | "asking" | "granted" | "denied" | "unsupported";
export type LocalSearch = { q: string; district: string; category: string };
type State = { status: GeoStatus; pos: GeoPos | null; search: LocalSearch; searchSeq: number };

const KEY = "dv-geo";
let state: State = { status: "idle", pos: null, search: { q: "", district: "", category: "" }, searchSeq: 0 };
const listeners = new Set<() => void>();
let booted = false;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function boot() {
  if (booted || typeof window === "undefined") return;
  booted = true;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as GeoPos;
      if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) state = { ...state, status: "granted", pos: p };
    }
  } catch { /* yok say */ }
  if (!navigator.geolocation) { state = { ...state, status: "unsupported" }; return; }
  // İzin daha önce verilmişse (kullanıcı sormadan) konum sessizce alınır; aksi halde kullanıcı düğmeye basar.
  if (state.status !== "granted") {
    (navigator.permissions?.query({ name: "geolocation" as PermissionName }) ?? Promise.reject())
      .then((r) => { if (r.state === "granted") requestGeo(); })
      .catch(() => undefined);
  }
}

export function requestGeo() {
  if (typeof navigator === "undefined" || !navigator.geolocation) { set({ status: "unsupported" }); return; }
  set({ status: "asking" });
  navigator.geolocation.getCurrentPosition(
    (r) => {
      const pos = { lat: r.coords.latitude, lng: r.coords.longitude };
      try { sessionStorage.setItem(KEY, JSON.stringify(pos)); } catch { /* yok say */ }
      set({ status: "granted", pos });
    },
    (err) => set({ status: err.code === 1 ? "denied" : "idle", pos: null }),
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
  );
}

export function clearGeo() {
  try { sessionStorage.removeItem(KEY); } catch { /* yok say */ }
  set({ status: "idle", pos: null, search: { q: "", district: "", category: "" } });
}

/** Hero arama formundan gelen filtre: yerel işletme listesi bunu uygular. */
export function setLocalSearch(search: LocalSearch) {
  set({ search, searchSeq: state.searchSeq + 1 });
}

const subscribe = (cb: () => void) => { boot(); listeners.add(cb); return () => { listeners.delete(cb); }; };
const server: State = { status: "idle", pos: null, search: { q: "", district: "", category: "" }, searchSeq: 0 };
export function useGeo(): State {
  return useSyncExternalStore(subscribe, () => state, () => server);
}

/** İki nokta arası mesafe (km, haversine). */
export function distanceKm(a: GeoPos, b: GeoPos): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.max(50, Math.round(km * 10) * 100)} m` : `${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`;
}

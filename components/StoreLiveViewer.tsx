'use client';

/**
 * StoreLiveViewer.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Müşterinin seçtiği MAĞAZAYA ÖZEL canlı yayın izleyicisi.
 *
 * Önceden App.tsx'in en üstündeki <LiveStream /> tek/sabit bir konuşma
 * (LIVE_CONV_ID) üzerinden platform geneli bir "canlı sohbet" gösteriyordu
 * — hangi bayi seçilirse seçilsin hep aynı şeydi, gerçek kamera görüntüsü
 * de yoktu. Bu bileşen bunun yerine:
 *
 *   1) Seçili mağazanın stores.is_live durumunu GERÇEK ZAMANLI izler
 *      (Supabase Realtime — bayi "Canlıya Geç"e bastığında anında yansır).
 *   2) is_live=true olduğunda, dealer'ın (dashboard.html →
 *      modules/live-sales.js) LiveKit'e yayınladığı "store-<id>" odasına
 *      SADECE İZLEYİCİ olarak bağlanır ve kamera görüntüsünü render eder.
 *   3) is_live=false olduğunda basit bir "şu an canlı değil" durumu
 *      gösterir (ürün bazlı YouTube tanıtım videoları zaten ProductCard
 *      üzerinden ayrıca izlenebiliyor).
 *
 * DIŞ BAĞIMLILIK: supabase/functions/live-token adlı bir Edge Function
 * deploy edilmiş olmalı (bkz. proje köküne eklenen
 * supabase/functions/live-token/index.ts). O olmadan bu bileşen sadece
 * "izleme token'ı alınamadı" hatası gösterir — mağaza seçimi/ürün/sepet
 * akışı etkilenmez.
 */

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { supabase, getLiveViewerToken } from '@/lib/supabase';

export default function StoreLiveViewer({
  storeId,
  storeName,
  initialIsLive,
  logoUrl = null,
}: {
  storeId: string;
  storeName: string;
  initialIsLive: boolean;
  // Yayın KAPALIYKEN arka planda "açık halinin önizlemesi" gibi gösterilen
  // görsel — mağazanın logosu/kapak görseli. Verilmezse şık, nötr bir
  // degrade deseni kullanılır (bkz. aşağıdaki fallback deseni).
  logoUrl?: string | null;
}) {
  const [isLive, setIsLive] = useState(initialIsLive);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);

  // Mağaza değişince state'i sıfırla.
  useEffect(() => {
    setIsLive(initialIsLive);
    setViewerError(null);
  }, [storeId, initialIsLive]);

  // stores.is_live GERÇEK ZAMANLI — bayi yayını açtığı/kapattığı anda yansır.
  useEffect(() => {
    const channel = supabase
      .channel(`store-live-${storeId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stores', filter: `id=eq.${storeId}` },
        (payload) => {
          const live = Boolean((payload.new as { is_live?: boolean })?.is_live);
          setIsLive(live);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId]);

  // is_live true olunca LiveKit odasına izleyici olarak bağlan, false olunca ayrıl.
  useEffect(() => {
    let cancelled = false;

    async function connect() {
      setConnecting(true);
      setViewerError(null);
      try {
        const { token, ws_url } = await getLiveViewerToken(storeId);
        if (cancelled) return;

        const room = new Room();
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Video && videoRef.current) {
            track.attach(videoRef.current);
          } else if (track.kind === Track.Kind.Audio && audioRef.current) {
            track.attach(audioRef.current);
          }
        });
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) setConnected(false);
        });

        await room.connect(ws_url, token);
        if (cancelled) {
          room.disconnect();
          return;
        }
        setConnected(true);
      } catch (err) {
        if (!cancelled) setViewerError((err as Error).message);
      } finally {
        if (!cancelled) setConnecting(false);
      }
    }

    function disconnect() {
      roomRef.current?.disconnect();
      roomRef.current = null;
      setConnected(false);
    }

    if (isLive) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      cancelled = true;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, storeId]);

  return (
    <div
      className="rounded-2xl overflow-hidden relative"
      style={{ background: '#000', border: '1px solid #2A3650' }}
    >
      {/* ── Arka plan katmanı ──────────────────────────────────────────────
          CANLI: gerçek LiveKit video akışı.
          KAPALI: mağazanın logosu/kapak görseli ("açık halinin önizlemesi"
          hissi) — yoksa nötr bir degrade+desen fallback. Container HER
          İKİ durumda da AYNI en-boy oranını korur ki üstteki StoreShopOverlay
          (ürün şeridi, sepet, sohbet) sıçramadan aynı yerde kalsın. ── */}
      {isLive ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full aspect-[4/5] lg:aspect-video object-cover bg-black"
          />
          <audio ref={audioRef} autoPlay />
        </>
      ) : (
        <div className="relative w-full aspect-[4/5] lg:aspect-video overflow-hidden">
          {logoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- mağaza logosu dış/dinamik kaynaktan geliyor */}
              <img
                src={logoUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'blur(2px) brightness(0.55) saturate(1.1)', transform: 'scale(1.08)' }}
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(5,8,15,0.55) 60%, rgba(5,8,15,0.8) 100%)' }} />
            </>
          ) : (
            // Logo yoksa: markanın altın/lacivert paletiyle nötr bir "yayın
            // kapalı" dokusu — düz gri kutu yerine yine de "vitrin" hissi verir.
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 30% 20%, rgba(212,175,55,0.10), transparent 55%), radial-gradient(circle at 80% 80%, rgba(56,189,248,0.08), transparent 50%), #0B1220',
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <i className="fas fa-store text-[#1E2A42] text-6xl lg:text-7xl" />
              </div>
            </div>
          )}

          {/* Açıklama metni — üstte, sabit bir noktadan başlıyor (dikey
              ortalama + pb-24 telafisi YETERSİZ kalıyordu: box yüksekliği
              ekran genişliğine göre değiştiği için bazı boyutlarda hâlâ
              alttaki StoreShopOverlay ürün kart şeridine biniyordu). top-14
              ile üstteki "kapalı" rozetinin (top-3, ~26px) altından net
              başlıyor; içerik kısa olduğu için (~70-80px) 96px+ yükseklikli
              alt ürün şeridine hiçbir boy ekranda değmiyor. */}
          <div className="absolute inset-x-0 top-14 z-[5] flex flex-col items-center text-center px-8 pointer-events-none">
            <i className="fas fa-video-slash text-white/60 text-base lg:text-lg mb-1.5" />
            <p className="text-white/80 text-[10px] lg:text-xs font-mono max-w-[260px]">
              Ürünlerin YouTube tanıtım videolarını kart üzerindeki oynat butonundan izleyebilirsin.
            </p>
          </div>
        </div>
      )}

      {/* ── Üst şerit ──────────────────────────────────────────────────────
          Sadece BİRİ görünür: CANLI iken kırmızı rozet, kapalıyken gri
          "kapalı" bildirim şeridi. isLive değiştiği anda diğeri tamamen
          gizlenir (iki durumda da aynı konumda, sıçrama yok). ── */}
      {isLive ? (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-red-500/90 px-2.5 py-1 rounded-md">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-white text-[10px] font-black font-mono">CANLI · {storeName}</span>
        </div>
      ) : (
        <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-1.5 bg-black/55 backdrop-blur-sm px-2.5 py-1.5 rounded-md border border-white/10">
          <span className="w-1.5 h-1.5 rounded-full bg-[#5E7090]" />
          <span className="text-[#A3B3D1] text-[10px] font-black font-mono truncate">
            {storeName} şu an canlı yayında değil
          </span>
        </div>
      )}

      {isLive && (connecting || (!connected && !viewerError)) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <p className="text-[#A3B3D1] text-xs font-mono">
            <i className="fas fa-spinner fa-spin mr-1.5" /> Yayına bağlanılıyor…
          </p>
        </div>
      )}

      {isLive && viewerError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4">
          <p className="text-amber-400 text-[11px] font-mono text-center">
            Canlı görüntüye şu an bağlanılamıyor: {viewerError}
            <br />
            Mağaza yine de canlı — sipariş verebilirsin.
          </p>
        </div>
      )}
    </div>
  );
}

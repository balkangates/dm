'use client';

/**
 * VideoPopupModal.tsx — canlı satış ürün kartındaki oynat butonuna tıklanınca
 * o KARTIN ÜZERİNDE beliren küçük "resim içinde resim" (PiP) tanıtım videosu
 * penceresi. `anchor` (tetikleyen kartın ekran koordinatları) verilirse tam
 * o kartın üstüne ortalanır; verilmezse ekranın sol üst köşesine sabitlenir
 * (geriye dönük uyumluluk). Kartın/akışın DIŞINDA, videonun ve sohbetin
 * üzerinde yüzer; canlı yayını ve alttaki ürün şeridini kapatmaz. Sağında
 * kalp/alev/alkış reaksiyon ikonları vardır. Video bittiğinde pencere
 * otomatik kapanır.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement | string, opts: Record<string, unknown>) => {
        destroy: () => void;
      };
      PlayerState: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prevReady?.(); resolve(); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

const REACTIONS = [
  { key: 'heart', icon: '❤️' },
  { key: 'fire', icon: '🔥' },
  { key: 'clap', icon: '👏' },
];

// Popup her zaman bu genişlikte — anchor'a göre konum hesaplarken kesin bir
// değere ihtiyacımız var (responsive Tailwind sınıfı yerine sabit px, çünkü
// konumu da biz hesaplıyoruz). Küçük ekranlarda viewport'a göre otomatik
// küçülür (bkz. clampLeft).
const POPUP_W = 260;
const POPUP_HEADER_H = 34;
const GAP = 10; // kart ile popup arası boşluk

export interface VideoPopupAnchor {
  top: number;
  left: number;
  width: number;
}

export interface VideoPopupFrame {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export default function VideoPopupModal({
  videoUrl,
  title,
  anchor = null,
  frame = null,
  onClose,
}: {
  videoUrl: string;
  title?: string;
  // Tetikleyen kartın getBoundingClientRect() değeri (bkz. ProductCard.tsx
  // → openDetail). Verilmezse ekranın sol üst köşesinde açılır.
  anchor?: VideoPopupAnchor | null;
  // LiveStream çerçevesinin (video + overlay kutusu) ekran sınırları —
  // verilirse popup MUTLAKA bu kutunun içinde kalır, sayfanın kenar
  // boşluğuna taşmaz (bkz. app/store/[storeId]/page.tsx → data-live-frame).
  frame?: VideoPopupFrame | null;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<{ destroy: () => void } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({ heart: 0, fire: 0, clap: 0 });
  const [pops, setPops] = useState<{ id: number; key: string }[]>([]);
  const videoId = extractYouTubeId(videoUrl);

  useEffect(() => {
    let cancelled = false;
    if (!videoId || !containerRef.current) return;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onStateChange: (e: { data: number }) => {
            if (window.YT && e.data === window.YT.PlayerState.ENDED) onClose();
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const react = (key: string) => {
    setCounts((c) => ({ ...c, [key]: c[key] + 1 }));
    const id = Date.now() + Math.random();
    setPops((p) => [...p, { id, key }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1200);
  };

  // ProductCard'lar bazı yerlerde transform/overflow uygulayan konteynerlerin
  // (kaydırmalı ürün şeridi, framer-motion animasyonlu sarmalayıcılar) içinde
  // render ediliyor. CSS'te bir ata elemanda transform/filter/will-change
  // varsa, o ata "containing block" haline gelir ve position:fixed çocuklar
  // artık viewport'a değil O ATAYA göre konumlanır — bu yüzden video popup
  // "kart içinde" açılıyormuş gibi görünüyordu. Portal ile doğrudan
  // document.body'ye render ederek bu sorunu kökten çözüyoruz; anchor
  // koordinatını kendimiz hesapladığımız için popup yine de DOĞRU kartın
  // TAM ÜSTÜNDE görünür — sadece CSS containing-block sorununa takılmadan.
  if (typeof document === 'undefined') return null;

  // ── Konum hesabı ──────────────────────────────────────────────────────
  // `frame` verilmişse popup'ı MUTLAKA o kutunun içinde tutuyoruz (sayfa
  // kenar boşluğuna taşmasın diye) — verilmemişse tüm viewport'a göre
  // clamp ediliyor (geriye dönük uyumluluk).
  const bounds = frame
    ? { minX: frame.left + 6, maxX: frame.right - 6, minY: frame.top + 6, maxY: frame.bottom - 6 }
    : { minX: 8, maxX: window.innerWidth - 8, minY: 8, maxY: window.innerHeight - 8 };

  // Çerçeve, popup'ın tam genişliği (+kenar boşlukları) için yeterince
  // geniş değilse (çok dar ekran/çerçeve), popup'ı çerçeveye sığacak
  // şekilde küçültüyoruz.
  const popupW = Math.min(POPUP_W, Math.max(160, bounds.maxX - bounds.minX));
  const popupVideoH = Math.round((popupW * 9) / 16);
  const popupH = POPUP_HEADER_H + popupVideoH;

  let top: number;
  let left: number;

  if (anchor) {
    const centerX = anchor.left + anchor.width / 2;
    left = Math.min(Math.max(centerX - popupW / 2, bounds.minX), bounds.maxX - popupW);

    const spaceAbove = anchor.top - GAP - bounds.minY;
    if (spaceAbove >= popupH) {
      top = anchor.top - GAP - popupH;
    } else {
      top = Math.min(anchor.top + GAP, bounds.maxY - popupH);
    }
    top = Math.max(top, bounds.minY);
  } else {
    top = frame ? frame.top + 12 : 64;
    left = frame ? frame.left + 12 : 12;
  }

  return createPortal(
    <AnimatePresence>
      {/* Kartın/videonun DIŞINDA (portal), ama hesaplanan anchor koordinatı
          sayesinde tam o kartın üstünde/altında beliren orta-boy popup.
          Arkaplana tıklamayı engellemez (video dışında hiçbir yeri
          kaplamaz), tam ekran karartma katmanı yok. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: anchor ? 8 : -12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 6, transition: { duration: 0.2 } }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="fixed z-[100] rounded-2xl overflow-hidden"
        style={{
          top,
          left,
          width: popupW,
          background: '#05070D',
          border: '1.5px solid rgba(212,175,55,0.55)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.3)',
        }}
      >
        {/* Üst bar: başlık + kapat */}
        <div className="flex items-center justify-between px-2.5 py-1.5" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <p className="text-white font-bold text-xs truncate pr-2">{title ?? 'Tanıtım'}</p>
          <button onClick={onClose} className="shrink-0 text-[#5E7090] hover:text-white text-sm leading-none cursor-pointer">✕</button>
        </div>

        {/* Video */}
        <div className="relative aspect-video w-full">
          {videoId ? (
            <div ref={containerRef} className="w-full h-full" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#5E7090] text-[10px] font-mono text-center px-2">
              Video linki okunamadı.
            </div>
          )}

          {/* Reaksiyon ikonları — video karesinin sağ kenarında */}
          <div className="absolute top-1.5 right-1.5 z-10 flex flex-col items-center gap-1.5">
            {REACTIONS.map((r) => (
              <button
                key={r.key}
                onClick={() => react(r.key)}
                className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs sm:text-sm cursor-pointer hover:scale-110 transition-transform"
                style={{ background: 'rgba(9,13,22,0.65)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                {r.icon}
                <AnimatePresence>
                  {pops.filter((p) => p.key === r.key).map((p) => (
                    <motion.span
                      key={p.id}
                      initial={{ opacity: 1, y: 0, scale: 1 }}
                      animate={{ opacity: 0, y: -26, scale: 1.3 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.1 }}
                      className="absolute -top-1 text-[10px] pointer-events-none"
                    >
                      {r.icon}
                    </motion.span>
                  ))}
                </AnimatePresence>
                <span className="absolute -bottom-1 -right-1 text-[7px] font-mono font-bold text-[#D4AF37] bg-black/70 rounded-full px-0.5">
                  {counts[r.key]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

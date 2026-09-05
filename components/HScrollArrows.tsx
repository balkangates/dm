'use client';
// components/HScrollArrows.tsx — yatay kaydırılan herhangi bir şeridi
// (ürün kartları, filtre/kategori butonları vb.) sarmalayıp SAĞ ve SOL
// kenarlara tıklanabilir ok butonları ekler. Şeridin başında sol ok,
// sonunda sağ ok otomatik gizlenir (daha kaydıracak yer yoksa buton
// gösterilmez). İçerik hâlâ parmakla/touch ile de kaydırılabilir —
// oklar sadece ek bir kolaylık, mevcut scroll davranışını değiştirmez.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export default function HScrollArrows({
  children,
  scrollClassName = '',
  scrollStyle,
  arrowOffset = 'inset-y-1/2 -translate-y-1/2',
  arrowSize = 'w-6 h-6 lg:w-7 lg:h-7',
  step,
}: {
  children: ReactNode;
  /** Kaydırılan iç konteynere eklenecek ekstra class (ör. gap, snap, mask). */
  scrollClassName?: string;
  scrollStyle?: React.CSSProperties;
  /** Ok butonlarının dikey konumu — varsayılan tam ortada. */
  arrowOffset?: string;
  arrowSize?: string;
  /** Her tıklamada kaç px kaydırılacağı — verilmezse konteyner genişliğinin %70'i. */
  step?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * (step ?? el.clientWidth * 0.7), behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <div ref={ref} className={scrollClassName} style={scrollStyle}>
        {children}
      </div>

      {canLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Sola kaydır"
          className={`absolute left-0 ${arrowOffset} ${arrowSize} z-40 rounded-full flex items-center justify-center backdrop-blur-sm cursor-pointer`}
          style={{ background: 'rgba(5,8,15,0.75)', border: '1px solid rgba(255,255,255,0.16)', color: '#D4AF37' }}
        >
          <i className="fas fa-chevron-left text-[9px] lg:text-[10px]" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Sağa kaydır"
          className={`absolute right-0 ${arrowOffset} ${arrowSize} z-40 rounded-full flex items-center justify-center backdrop-blur-sm cursor-pointer`}
          style={{ background: 'rgba(5,8,15,0.75)', border: '1px solid rgba(255,255,255,0.16)', color: '#D4AF37' }}
        >
          <i className="fas fa-chevron-right text-[9px] lg:text-[10px]" />
        </button>
      )}
    </div>
  );
}

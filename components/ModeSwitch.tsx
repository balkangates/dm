"use client";

import { usePathname, useRouter } from "next/navigation";
import { hrefForMode, type ViewMode } from "@/lib/viewMode";

/** Anasayfa bölüm kimlikleri — modun "akış başı" (kart tıklamasında kaydırılan hedef). */
export const FLOW_START_ID: Record<ViewMode, string> = {
  musteri: "kesfet",
  isletme: "isletme-akisi",
};

function useSwitchMode(search: string) {
  const router = useRouter();
  const pathname = usePathname();
  // push: geri tuşu önceki modu geri getirir; URL paylaşılabilir.
  return (mode: ViewMode) => router.push(hrefForMode(pathname, search, mode), { scroll: false });
}

/**
 * Header altındaki ince görünüm çubuğunda yer alan Müşteri | İşletme anahtarı.
 * `search`: geçerli sayfanın sorgu dizesi (diğer parametreler korunur, yalnızca `mod` değişir).
 */
export function ModeSwitch({
  mode,
  search,
  labels,
  groupLabel,
}: {
  mode: ViewMode;
  search: string;
  labels: { musteri: string; isletme: string };
  groupLabel: string;
}) {
  const go = useSwitchMode(search);
  const items: { id: ViewMode; icon: string; label: string }[] = [
    { id: "musteri", icon: "👤", label: labels.musteri },
    { id: "isletme", icon: "🏢", label: labels.isletme },
  ];
  return (
    <div role="group" aria-label={groupLabel} className="inline-flex shrink-0 rounded-[3px] border border-line bg-canvas p-0.5">
      {items.map((it) => {
        const on = it.id === mode;
        return (
          <button
            key={it.id}
            type="button"
            aria-pressed={on}
            onClick={() => (on ? undefined : go(it.id))}
            className={`inline-flex h-7 items-center gap-1.5 rounded-[2px] px-3 text-[0.78rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
              on ? "bg-ink text-white" : "text-ink-700 hover:bg-surface hover:text-ink"
            }`}
          >
            <span aria-hidden="true">{it.icon}</span>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Hero altındaki iki büyük seçim kartı.
 *  - Pasif karta tık  → ilgili moda geç (?mod=…).
 *  - Aktif karta tık  → kendi akışının başına kaydır.
 */
export function ModeCards({
  mode,
  search,
  cards,
  activeLabel,
}: {
  mode: ViewMode;
  search: string;
  cards: Record<ViewMode, { title: string; desc: string; icon: string }>;
  activeLabel: string;
}) {
  const go = useSwitchMode(search);

  function onPick(target: ViewMode) {
    if (target !== mode) return go(target);
    const el = document.getElementById(FLOW_START_ID[target]);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["musteri", "isletme"] as const).map((id) => {
        const on = id === mode;
        const c = cards[id];
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(id)}
            className={`group flex items-center gap-4 rounded-[4px] border-2 p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              on
                ? "border-accent bg-accent/15 text-white"
                : "border-white/15 bg-white/[0.04] text-white/75 hover:border-white/40 hover:bg-white/[0.08]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[3px] text-[1.4rem] ${
                on ? "bg-accent" : "bg-white/10"
              }`}
            >
              {c.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-display text-[1.15rem] font-bold leading-tight">{c.title}</span>
                {on ? (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[0.66rem] font-bold text-white">{activeLabel}</span>
                ) : null}
              </span>
              <span className="mt-1 block text-[0.88rem] leading-snug">{c.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

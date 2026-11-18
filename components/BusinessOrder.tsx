"use client";

/**
 * "Sipariş ver" — işletme kartlarından açılan sipariş POPUP'ı.
 * İçinde: Sesli Asistan (değiştirilmemiş bileşen; işletmenin menüsü/kampanyalarıyla) + görsel sipariş modülü (MenuCart).
 * Sayfadan çıkılmaz; menü verisi /api/order-menu'den yüklenir.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import MenuCart, { type MenuProduct } from "@/components/MenuCart";
import VoiceAssistant from "@/components/voice";
import { Button } from "@/components/ds";
import { Icon } from "@/components/icons";
import type { VoiceCampaign } from "@/lib/voice";
import type { Currency, HourRow, Lang } from "@/lib/money";

type Ctx = {
  slug: string;
  currency: Currency;
  lang: Lang;
  business: {
    id: string; name: string; district: string;
    modes?: { gelAl?: boolean; rezerve?: boolean; paketServis?: boolean };
    acceptingOrders?: boolean; kdvRate?: number; deliveryRadiusKm?: number | null; openNow?: boolean; timeZone?: string; hours?: HourRow[];
  };
  products: MenuProduct[];
  campaigns: VoiceCampaign[];
  user: { name: string; phone?: string | null; address?: string | null } | null;
};

function OrderPopup({ slug, name, onClose }: { slug: string; name: string; onClose: () => void }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/order-menu?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.ok) setCtx(j as Ctx); else setErr(String(j.error ?? "Menü yüklenemedi.")); })
      .catch(() => alive && setErr("Menü yüklenemedi; bağlantını kontrol edip tekrar dene."));
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // İçerideki bir pencere (ürün/sepet) açıksa önce o kapanır; popup yalnız en üstteyse kapanır.
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs.length && dialogs[dialogs.length - 1] !== panelRef.current) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden"; // body'yi MenuCart kullanır; çakışmasın
    panelRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.documentElement.style.overflow = ""; };
  }, [onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90] flex items-stretch justify-center sm:items-center sm:p-6" role="presentation">
        <button type="button" aria-label="Kapat" onClick={onClose} className="absolute inset-0 bg-ink/70" />
        <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${name} sipariş`}
          className="relative flex h-full w-full flex-col overflow-hidden bg-canvas shadow-2xl outline-none sm:h-[90vh] sm:max-w-[1080px] sm:rounded-[14px]">
          <div className="flex items-center justify-between gap-3 border-b-2 border-line bg-surface px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-accent">Sipariş ver</p>
              <p className="truncate font-display text-[1.15rem] font-extrabold leading-tight">{name}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href={`/isletme/${slug}`} className="hidden text-[0.8rem] font-semibold text-ink-700 hover:text-accent sm:inline">İşletme sayfası</Link>
              <button type="button" onClick={onClose} aria-label="Kapat"
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-line text-ink hover:border-ink-500">✕</button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {!ctx && !err ? (
              <div className="space-y-3" aria-busy="true" aria-label="Menü yükleniyor">
                <div className="h-24 animate-pulse rounded-[10px] bg-line" />
                <div className="h-28 animate-pulse rounded-[10px] bg-line" />
                <div className="h-28 animate-pulse rounded-[10px] bg-line" />
              </div>
            ) : null}
            {err ? (
              <div className="py-12 text-center">
                <p className="text-[0.95rem] text-muted">{err}</p>
                <Link href={`/isletme/${slug}`} className="mt-4 inline-block"><Button variant="secondary">İşletme sayfasına git</Button></Link>
              </div>
            ) : null}
            {ctx && ctx.products.length === 0 ? (
              <div className="py-12 text-center">
                <p className="font-display text-[1.05rem] font-bold">Bu işletme henüz sipariş menüsü eklememiş</p>
                <p className="mt-1 text-[0.88rem] text-muted">Kampanyaları ve iletişim bilgilerini işletme sayfasında görebilirsin.</p>
                <Link href={`/isletme/${slug}`} className="mt-4 inline-block"><Button>İşletme sayfasına git</Button></Link>
              </div>
            ) : null}
            {ctx && ctx.products.length > 0 ? (
              <MenuCart embedded business={ctx.business} products={ctx.products} campaigns={ctx.campaigns} user={ctx.user} currency={ctx.currency} lang={ctx.lang} />
            ) : null}
          </div>
        </div>
      </div>

      {/* Sesli asistan (değiştirilmemiş): popup'ın ÜSTÜNDE görünsün diye kendi yığın bağlamında. */}
      {ctx && ctx.products.length > 0 ? (
        <div className="relative z-[100]">
          <VoiceAssistant
            business={ctx.business}
            products={ctx.products.map((p) => ({ name: p.name, priceCents: p.priceCents, discountPriceCents: p.discountPriceCents, deliveryPriceCents: p.deliveryPriceCents, options: p.options, kdvRate: p.kdvRate }))}
            campaigns={ctx.campaigns}
            user={ctx.user}
          />
        </div>
      ) : null}
    </>,
    document.body,
  );
}

/** İşletme kartlarındaki "Sipariş ver" düğmesi; popup'ı açar. */
export function OrderButton({ slug, name, className = "", size = "sm", variant = "primary" }: {
  slug: string; name: string; className?: string; size?: "sm" | "md"; variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)} icon={<Icon.arrowRight size={14} />}>
        Sipariş ver
      </Button>
      {open ? <OrderPopup slug={slug} name={name} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

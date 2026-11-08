"use client";

import { useState } from "react";
import { Button, Card, Field, Icon, Input, Notice, Progress } from "@/components/ds";
import { canTakeOrder, topupAmountCents, topupChoices, validTopupQty, type OrderQuotaState } from "@/lib/orderQuota";
import { money, num, type Currency, type Lang } from "@/lib/money";

/**
 * Panel: sipariş kotası + bakiye.
 * Müşterinin işletme sayfasından verdiği her sipariş (gel-al, paket servis, rezerve) önce paketin dönem
 * kotasından, kota bitince bakiyeden düşer. Bakiye ekleme yalnızca paketin tanımlı minimum adedi ve
 * katları olarak, tanımlı birim fiyatla yapılır; yetki (OWNER) ve adet doğrulaması sunucuda tekrar edilir.
 */
export default function OrderQuotaPanel({
  quota, currency, lang, post,
}: {
  quota: OrderQuotaState;
  currency: Currency;
  lang: Lang;
  post: (route: string, body: Record<string, unknown>, ok: string) => Promise<unknown>;
}) {
  const min = quota.topupMinQty;
  const [qty, setQty] = useState<number>(min);
  const [busy, setBusy] = useState(false);

  const limit = quota.quota ?? 0;
  const pctUsed = limit > 0 ? Math.min(100, Math.round((quota.used / limit) * 100)) : 0;
  const open = canTakeOrder(quota);
  const canTopup = !quota.unlimited && quota.unitPriceCents != null;
  const valid = validTopupQty(qty, min);
  const amount = canTopup && valid ? topupAmountCents(qty, quota.unitPriceCents as number) : 0;

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-[1.1rem] font-bold">Sipariş kotası</p>
          <p className="mt-0.5 text-[0.82rem] text-muted">
            {quota.packageName} paketi · dönem {quota.period} · gel-al, paket servis ve rezerve siparişlerin tümü sayılır
          </p>
        </div>
      </div>

      {quota.unlimited ? (
        <Notice tone="info" icon={<Icon.info size={16} />} className="mt-4">
          Bu paket için sipariş kotası tanımlı değil; sipariş sayısı sınırlanmıyor.
        </Notice>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[0.74rem] text-muted">Dönem kotası</p>
              <p className="tabular text-[1.4rem] font-semibold">{num(quota.used, lang)} / {num(limit, lang)}</p>
              <div className="mt-2"><Progress value={pctUsed} tone={pctUsed >= 100 ? "ink" : "accent"} /></div>
              <p className="mt-1.5 text-[0.76rem] text-muted">Kalan: {num(quota.quotaRemaining ?? 0, lang)} · paket yenilenince sıfırlanır</p>
            </div>
            <div>
              <p className="text-[0.74rem] text-muted">Sipariş bakiyesi</p>
              <p className="tabular text-[1.4rem] font-semibold">{num(quota.balance, lang)}</p>
              <p className="mt-1.5 text-[0.76rem] text-muted">Kota bittikten sonra kullanılır; dönem sonunda silinmez.</p>
            </div>
            <div>
              <p className="text-[0.74rem] text-muted">Sipariş alma durumu</p>
              <p className={`text-[1.1rem] font-semibold ${open ? "text-positive" : "text-danger"}`}>{open ? "Açık" : "Kapalı"}</p>
              <p className="mt-1.5 text-[0.76rem] text-muted">{open ? "Yeni siparişler kabul ediliyor." : "Kota ve bakiye bitti; yeni sipariş alınmıyor."}</p>
            </div>
          </div>

          {!open ? (
            <Notice tone="danger" icon={<Icon.alert size={16} />} className="mt-4">
              Sipariş kotan ve bakiyen bitti, müşteriler şu an sipariş veremiyor.
              {canTopup ? " Aşağıdan bakiye ekleyerek siparişleri hemen yeniden açabilirsin." : " Paket değiştirmek için DampingVar ile iletişime geç."}
            </Notice>
          ) : null}

          {canTopup ? (
            <form
              className="mt-5 grid gap-3 border-t border-line-soft pt-5"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!valid) return;
                setBusy(true);
                await post("/api/business", { action: "order_topup", qty }, `${num(qty, lang)} sipariş bakiyesi eklendi`);
                setBusy(false);
              }}
            >
              <p className="text-[0.9rem] font-semibold">Bakiye ekle</p>
              <p className="text-[0.8rem] text-muted">
                Birim fiyat {money(quota.unitPriceCents as number, currency, lang)} · en az {num(min, lang)} adet ve katları
              </p>
              <div className="flex flex-wrap gap-2">
                {topupChoices(min).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setQty(c)}
                    className={`tabular rounded-full border px-3 py-1.5 text-[0.8rem] font-medium ${qty === c ? "border-ink bg-ink text-white" : "border-line text-ink-700 hover:border-ink-500"}`}
                  >
                    {num(c, lang)}
                  </button>
                ))}
              </div>
              <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
                <Field label="Adet" error={valid ? undefined : `${num(min, lang)} adet ve katları girilmelidir.`}>
                  <Input type="number" min={min} step={min} value={qty} onChange={(e) => setQty(Math.trunc(Number(e.target.value)) || 0)} />
                </Field>
                <p className="tabular pb-2 text-[0.95rem] font-semibold">{valid ? money(amount, currency, lang) : "—"}</p>
                <Button type="submit" disabled={!valid || busy} loading={busy}>Bakiye ekle</Button>
              </div>
              <p className="text-[0.76rem] leading-relaxed text-muted">
                Tutar, DampingVar&apos;ın işletmeye sunduğu platform hizmet bedelidir ve sözleşmene göre faturalandırılır.
                Müşteri ödemesiyle ilgisi yoktur; müşteri ödemesi işletmeye yapılmaya devam eder. Bakiye eklemek yalnızca işletme sahibi (OWNER) tarafından yapılabilir.
              </p>
            </form>
          ) : (
            <p className="mt-4 text-[0.8rem] text-muted">Bu paket için ek bakiye birim fiyatı tanımlı değil.</p>
          )}
        </>
      )}
    </Card>
  );
}

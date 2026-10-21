/**
 * FAZ 12A/12B/12C — Sesli Asistan sipariş aktarımı (POST).
 *
 * Sipariş yalnızca İŞLETMEYE iletilir; DampingVar ödeme almaz ve tahsil
 * etmez (kapıda/iş yerinde nakit veya kart, müşteri ile işletme arasında).
 *
 * FAZ 12C (21.10.2026):
 *   * Oturum ZORUNLU — oturumsuz (misafir) sipariş alınmaz (suistimal
 *     önlemi; RLS insert politikasıyla da örtüşür). 401 döner.
 *   * İşletmenin AÇIK modları kontrol edilir (gel-al/rezerve/paket servis);
 *     "sipariş alıyorum" anahtarı kapalıysa sipariş alınmaz.
 *   * Fiyat SUNUCUDA teslimat tipine göre çözülür + KAMPANYA İNDİRİMİ ve
 *     KDV dökümü sunucuda hesaplanır (matrah − indirim + KDV = ödenecek).
 *
 * Not: istemciye güvenilmez; toplam sunucu dökümünden gelir.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/authz";
import { logAudit, trackEvent } from "@/lib/queries";
import { bestCampaign, computeTotals, type OrderMode, type PriceCampaign, type PriceItem } from "@/lib/order-price";

type Row = Record<string, unknown>;

const DELIVERY_TYPES = ["GEL_AL", "REZERVE", "PAKET_SERVIS"] as const;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Row;
    const businessId = String(body.businessId ?? "");
    const items = Array.isArray(body.items) ? (body.items as Row[]) : [];
    const paymentMethod = String(body.paymentMethod ?? "CASH_DOOR");
    const deliveryType = String(body.deliveryType ?? "") as OrderMode;
    const customerName = String(body.customerName ?? "").trim().slice(0, 80);
    const customerPhoneDigits = String(body.customerPhone ?? "").replace(/\D/g, "");
    const customerPhone = String(body.customerPhone ?? "").trim().slice(0, 20);
    const customerDistrict = body.customerDistrict ? String(body.customerDistrict).slice(0, 80) : null;
    const address = body.address ? String(body.address).trim().slice(0, 300) : null;
    const note = body.note ? String(body.note).trim().slice(0, 300) : null;
    // FAZ 12C-3 — rezervasyon saati (masa planı için; REZERVE'de zorunlu).
    const reservedAtRaw = body.reservedAt ? String(body.reservedAt) : "";

    if (!businessId) return NextResponse.json({ ok: false, error: "İşletme bulunamadı." }, { status: 400 });
    if (!DELIVERY_TYPES.includes(deliveryType))
      return NextResponse.json({ ok: false, error: "Teslimat tipi gerekli: gel-al, rezerve veya adrese teslim." }, { status: 400 });
    if (!customerName || customerPhoneDigits.length < 10)
      return NextResponse.json({ ok: false, error: "Ad ve geçerli bir telefon numarası gerekli." }, { status: 400 });
    if (!["CASH_DOOR", "CARD_DOOR"].includes(paymentMethod))
      return NextResponse.json({ ok: false, error: "Geçersiz ödeme yöntemi (kapıda/iş yerinde nakit veya kart)." }, { status: 400 });

    let reservedAt: Date | null = null;
    if (deliveryType === "REZERVE") {
      if (!reservedAtRaw)
        return NextResponse.json(
          { ok: false, error: "Rezerve sipariş için saat gerekli — işletme masa planını saate göre yapar. Örnek: 19:30." },
          { status: 400 },
        );
      const rt = new Date(reservedAtRaw);
      // Geçmişte veya çok ileride olamaz: 30 dk esneklik − 30 gün üst sınır.
      if (Number.isNaN(rt.getTime()) || rt.getTime() < Date.now() - 30 * 60_000 || rt.getTime() > Date.now() + 30 * 86_400_000)
        return NextResponse.json({ ok: false, error: "Rezerve saat geçersiz — en fazla 30 gün sonrası ve geçmiş olmayan bir saat seç." }, { status: 400 });
      reservedAt = rt;
    }

    const clean: Array<{ name: string; qty: number; unitPriceCents: number; options?: Array<{ name: string; wanted: boolean }> }> = [];
    for (const raw of items.slice(0, 25)) {
      const name = String(raw.name ?? "").trim().slice(0, 120);
      const qty = Math.max(1, Math.min(99, Math.round(Number(raw.qty ?? 1))));
      const unit = Math.max(0, Math.min(10_000_000, Math.round(Number(raw.unitPriceCents ?? 0))));
      const opts = Array.isArray(raw.options)
        ? (raw.options as Row[])
            .slice(0, 20)
            .map((o) => ({ name: String(o?.name ?? "").trim().slice(0, 40), wanted: o?.wanted !== false }))
            .filter((o) => o.name)
        : [];
      if (name) clean.push({ name, qty, unitPriceCents: unit, ...(opts.length ? { options: opts } : {}) });
    }
    if (!clean.length) return NextResponse.json({ ok: false, error: "Sepet boş." }, { status: 400 });
    // Adres yalnız adrese teslim siparişte zorunludur; gel-al/rezerve siparişte istenmez.
    if (deliveryType === "PAKET_SERVIS" && !address)
      return NextResponse.json({ ok: false, error: "Adrese teslim sipariş için teslimat adresi gerekli." }, { status: 400 });

    // FAZ 12C — OTURUM ZORUNLU (misafir sipariş alınmaz; suistimal önlemi).
    const user = await getSessionUser().catch(() => null);
    if (!user) {
      return NextResponse.json(
        { ok: false, needLogin: true, error: "Sipariş vermek için giriş yapmalısın. Giriş yaptıktan sonra siparişini tekrar gönderebilirsin." },
        { status: 401 },
      );
    }
    const client = await createClient();

    const { data: biz } = await client
      .from("businesses")
      .select("id, name, suspended_at, mode_gel_al, mode_paket_servis, mode_rezerve, accepting_orders, kdv_rate")
      .eq("id", businessId)
      .is("suspended_at", null)
      .maybeSingle();
    if (!biz) return NextResponse.json({ ok: false, error: "İşletme bulunamadı veya askıya alınmış." }, { status: 404 });

    // FAZ 12C — işletme sipariş alıyor mu + bu mod açık mı?
    if (biz.accepting_orders === false)
      return NextResponse.json(
        { ok: false, paused: true, error: `${biz.name} şu an sipariş almıyor (yoğunluk). Lütfen daha sonra tekrar dene.` },
        { status: 409 },
      );
    const modeOn =
      deliveryType === "GEL_AL" ? biz.mode_gel_al === true
      : deliveryType === "REZERVE" ? biz.mode_rezerve === true
      : biz.mode_paket_servis === true;
    if (!modeOn)
      return NextResponse.json(
        { ok: false, error: `${biz.name} şu an ${deliveryType === "REZERVE" ? "rezerve" : deliveryType === "GEL_AL" ? "gel-al" : "adrese teslim"} siparişi almıyor.` },
        { status: 409 },
      );

    // FİYAT SUNUCUDA çözülür: teslimat tipine göre (adrese teslim fiyatı
    // tanımlıysa o; yoksa indirimli/temel fiyat). Eşleşmeyen satırlarda
    // istemci fiyatına düşülür; tutar yine sunucuda toplanır.
    const { data: prodRows } = await client
      .from("products")
      .select("name, price_cents, discount_price_cents, delivery_price_cents, kdv_rate")
      .eq("business_id", businessId)
      .eq("active", true);
    const priceMap = new Map<string, { unit: number; kdvRate: number | null }>();
    for (const p of prodRows ?? []) {
      const key = String(p.name ?? "").trim().toLocaleLowerCase("tr-TR");
      const base = p.discount_price_cents ?? p.price_cents ?? 0;
      const unit = deliveryType === "PAKET_SERVIS" && p.delivery_price_cents != null ? p.delivery_price_cents : base;
      priceMap.set(key, {
        unit: Math.max(0, Math.min(10_000_000, Math.round(Number(unit)))),
        kdvRate: p.kdv_rate == null ? null : Number(p.kdv_rate),
      });
    }
    const priceItems: PriceItem[] = clean.map((line) => {
      const hit = priceMap.get(line.name.toLocaleLowerCase("tr-TR"));
      if (hit) line.unitPriceCents = hit.unit;
      return { name: line.name, qty: line.qty, unitPriceCents: line.unitPriceCents, kdvRate: hit?.kdvRate ?? null };
    });

    // FAZ 12C — kampanya indirimi + KDV dökümü (matrah − indirim + KDV).
    const businessKdvRate = Number(biz.kdv_rate ?? 20);
    const { data: campRows } = await client
      .from("campaigns")
      // FAZ 12C-3 — çoklu sipariş tipi kapsamı + ödeme kapsamı da seçilir.
      .select("title, discount_percent, discount_amount_cents, min_basket_cents, service_mode, service_modes, payment_scope, starts_at, ends_at")
      .eq("business_id", businessId)
      .eq("status", "PUBLISHED");
    const camps: PriceCampaign[] = (campRows ?? []).map((c) => ({
      title: String(c.title ?? "Kampanya"),
      discountPercent: c.discount_percent == null ? null : Number(c.discount_percent),
      discountAmountCents: c.discount_amount_cents == null ? null : Number(c.discount_amount_cents),
      minBasketCents: c.min_basket_cents == null ? null : Number(c.min_basket_cents),
      serviceMode: c.service_mode == null ? null : String(c.service_mode),
      serviceModes: Array.isArray(c.service_modes) && c.service_modes.length ? (c.service_modes as unknown[]).map(String) : null,
      paymentScope: Array.isArray(c.payment_scope) && c.payment_scope.length ? (c.payment_scope as unknown[]).map(String) : null,
      startsAt: c.starts_at ? String(c.starts_at) : null,
      endsAt: c.ends_at ? String(c.ends_at) : null,
    }));
    // FAZ 12C-3 — ödeme bilgisi de verilir: nakite özel kampanya yalnız nakitte indirir.
    const campaign = bestCampaign(priceItems, camps, deliveryType, new Date(), paymentMethod);
    const totals = computeTotals({ items: priceItems, businessKdvRate, campaign, mode: deliveryType, payment: paymentMethod });
    const totalCents = totals.totalCents;

    // Yinelenen gönderim engeli (çift dokunuş / iki kez seslendirme).
    // Misafirde RLS select karşı satırı görmediği için dedupe önce
    // security definer RPC ile denenir; RPC yoksa (migration öncesi) eski
    // select yolu korunur.
    const since = new Date(Date.now() - 3 * 60_000).toISOString();
    let dup = false;
    const rpc = await client.rpc("dv_order_recent_exists", {
      p_business_id: businessId,
      p_phone: customerPhone,
      p_since: since,
    });
    if (rpc.error) {
      const { data: dupRows } = await client
        .from("orders")
        .select("id")
        .eq("business_id", businessId)
        .eq("customer_phone", customerPhone)
        .gte("created_at", since)
        .limit(1);
      dup = (dupRows ?? []).length > 0;
    } else {
      dup = rpc.data === true;
    }
    if (dup) return NextResponse.json({ ok: true, duplicate: true });

    const { data: row, error } = await client
      .from("orders")
      .insert({
        business_id: businessId,
        // FAZ 12C: oturum zorunlu → sipariş her zaman kullanıcıya bağlı.
        customer_id: user.id,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_district: customerDistrict,
        address,
        note,
        items: clean,
        total_cents: totalCents,
        subtotal_cents: totals.subtotalCents,
        discount_cents: totals.discountCents,
        kdv_cents: totals.kdvCents,
        campaign_title: totals.campaignTitle,
        payment_method: paymentMethod,
        delivery_type: deliveryType,
        // FAZ 12C-3 — rezerve saati (masa planı); yalnız REZERVE'de dolu.
        reserved_at: reservedAt ? reservedAt.toISOString() : null,
        source: "VOICE",
        status: "NEW",
      })
      .select("id, status, total_cents")
      .maybeSingle();
    if (error || !row) {
      return NextResponse.json({ ok: false, error: "Sipariş kaydedilemedi. Lütfen tekrar deneyin." }, { status: 500 });
    }

    await trackEvent("order_created", {
      businessId,
      userId: user.id,
      meta: { source: "VOICE", totalCents, deliveryType, discountCents: totals.discountCents, kdvCents: totals.kdvCents },
    });
    await logAudit(user.email, user.role, "ORDER_CREATED_VOICE", "orders", String(row.id), {
      totalCents,
      items: clean.length,
      deliveryType,
    });

    return NextResponse.json({
      ok: true,
      orderId: String(row.id),
      status: String(row.status),
      totalCents,
      breakdown: {
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        kdvCents: totals.kdvCents,
        totalCents: totals.totalCents,
        campaignTitle: totals.campaignTitle,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Sipariş gönderilemedi. Lütfen tekrar deneyin." }, { status: 500 });
  }
}

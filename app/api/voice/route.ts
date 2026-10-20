/**
 * FAZ 12A — Sesli Asistan sipariş aktarımı (POST).
 *
 * Sipariş yalnızca İŞLETMEYE iletilir; DampingVar ödeme almaz ve tahsil
 * etmez (kapıda nakit/kart, müşteri ile işletme arasında). Bu route sipariş
 * TALEBİNİ kaydeder:
 *   * Oturum varsa müşteri adına (customer_id) bağlanır; yoksa misafir
 *     (telefon zorunlu).
 *   * Tutar SUNUCUDA yeniden hesaplanır (istemcideki toplama güvenilmez).
 *   * Aynı telefon+işletme için 3 dakika içinde tekrar gönderim engellenir.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/authz";
import { logAudit, trackEvent } from "@/lib/queries";

type Row = Record<string, unknown>;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Row;
    const businessId = String(body.businessId ?? "");
    const items = Array.isArray(body.items) ? (body.items as Row[]) : [];
    const paymentMethod = String(body.paymentMethod ?? "CASH_DOOR");
    // FAZ 12B — teslimat tipi ZORUNLU: gel-al (işletme içi) veya adrese teslim (paket servis).
    const deliveryType = String(body.deliveryType ?? "");
    const customerName = String(body.customerName ?? "").trim().slice(0, 80);
    const customerPhoneDigits = String(body.customerPhone ?? "").replace(/\D/g, "");
    const customerPhone = String(body.customerPhone ?? "").trim().slice(0, 20);
    const customerDistrict = body.customerDistrict ? String(body.customerDistrict).slice(0, 80) : null;
    const address = body.address ? String(body.address).trim().slice(0, 300) : null;
    const note = body.note ? String(body.note).trim().slice(0, 300) : null;

    if (!businessId) return NextResponse.json({ ok: false, error: "İşletme bulunamadı." }, { status: 400 });
    if (!["GEL_AL", "PAKET_SERVIS"].includes(deliveryType))
      return NextResponse.json({ ok: false, error: "Teslimat tipi gerekli: gel-al veya adrese teslim." }, { status: 400 });
    if (!customerName || customerPhoneDigits.length < 10)
      return NextResponse.json({ ok: false, error: "Ad ve geçerli bir telefon numarası gerekli." }, { status: 400 });
    if (!["CASH_DOOR", "CARD_DOOR"].includes(paymentMethod))
      return NextResponse.json({ ok: false, error: "Geçersiz ödeme yöntemi (kapıda nakit/kart)." }, { status: 400 });

    const clean: Array<{ name: string; qty: number; unitPriceCents: number }> = [];
    for (const raw of items.slice(0, 25)) {
      const name = String(raw.name ?? "").trim().slice(0, 120);
      const qty = Math.max(1, Math.min(99, Math.round(Number(raw.qty ?? 1))));
      const unit = Math.max(0, Math.min(10_000_000, Math.round(Number(raw.unitPriceCents ?? 0))));
      if (name) clean.push({ name, qty, unitPriceCents: unit });
    }
    if (!clean.length) return NextResponse.json({ ok: false, error: "Sepet boş." }, { status: 400 });
    // Adres yalnız adrese teslim siparişte zorunludur; gel-al siparişte istenmez.
    if (deliveryType === "PAKET_SERVIS" && !address)
      return NextResponse.json({ ok: false, error: "Adrese teslim sipariş için teslimat adresi gerekli." }, { status: 400 });

    const user = await getSessionUser().catch(() => null);
    const client = await createClient();

    const { data: biz } = await client
      .from("businesses")
      .select("id, name, suspended_at")
      .eq("id", businessId)
      .is("suspended_at", null)
      .maybeSingle();
    if (!biz) return NextResponse.json({ ok: false, error: "İşletme bulunamadı veya askıya alınmış." }, { status: 404 });

    // FAZ 12B — FİYAT SUNUCUDA çözülür: teslimat tipine göre (adrese teslim fiyatı
    // tanımlıysa o; yoksa indirimli/temel fiyat). Eşleşmeyen satırlarda istemci
    // fiyatına düşülür; tutar yine sunucuda toplanır.
    const { data: prodRows } = await client
      .from("products")
      .select("name, price_cents, discount_price_cents, delivery_price_cents")
      .eq("business_id", businessId)
      .eq("active", true);
    const priceMap = new Map<string, number>();
    for (const p of prodRows ?? []) {
      const key = String(p.name ?? "").trim().toLocaleLowerCase("tr-TR");
      const base = p.discount_price_cents ?? p.price_cents ?? 0;
      const unit = deliveryType === "PAKET_SERVIS" && p.delivery_price_cents != null ? p.delivery_price_cents : base;
      priceMap.set(key, Math.max(0, Math.min(10_000_000, Math.round(Number(unit)))));
    }
    for (const line of clean) {
      const unit = priceMap.get(line.name.toLocaleLowerCase("tr-TR"));
      if (unit !== undefined) line.unitPriceCents = unit;
    }
    const totalCents = clean.reduce((s, l) => s + l.qty * l.unitPriceCents, 0);

    // Yinelenen gönderim engeli (çift dokunuş / iki kez seslendirme).
    const since = new Date(Date.now() - 3 * 60_000).toISOString();
    const { data: dup } = await client
      .from("orders")
      .select("id")
      .eq("business_id", businessId)
      .eq("customer_phone", customerPhone)
      .gte("created_at", since)
      .limit(1);
    if ((dup ?? []).length) return NextResponse.json({ ok: true, duplicate: true });

    const { data: row, error } = await client
      .from("orders")
      .insert({
        business_id: businessId,
        customer_id: user?.role === "CUSTOMER" ? user.id : null,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_district: customerDistrict,
        address,
        note,
        items: clean,
        total_cents: totalCents,
        payment_method: paymentMethod,
        delivery_type: deliveryType,
        source: "VOICE",
        status: "NEW",
      })
      .select("id, status, total_cents")
      .maybeSingle();
    if (error || !row) {
      return NextResponse.json({ ok: false, error: "Sipariş kaydedilemedi. Lütfen tekrar deneyin." }, { status: 500 });
    }

    await trackEvent("order_created", { businessId, userId: user?.id ?? null, meta: { source: "VOICE", totalCents, deliveryType } });
    await logAudit(user?.email ?? "guest", user?.role ?? "CUSTOMER", "ORDER_CREATED_VOICE", "orders", String(row.id), {
      totalCents,
      items: clean.length,
      deliveryType,
    });

    return NextResponse.json({ ok: true, orderId: String(row.id), status: String(row.status), totalCents });
  } catch {
    return NextResponse.json({ ok: false, error: "Sipariş gönderilemedi. Lütfen tekrar deneyin." }, { status: 500 });
  }
}

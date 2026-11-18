/**
 * Sipariş popup'ı için işletme menü/sipariş bağlamı (GET ?slug=).
 * İşletme sayfasının sesli asistana verdiği verinin aynısı: ürünler, kampanyalar, sipariş modları, çalışma saatleri.
 * Yalnızca herkese açık veri + oturumdaki kullanıcının kendi iletişim bilgisi döner.
 */
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { getBusinessBySlug, orderCapacityAvailable } from "@/lib/queries";
import { getLocale } from "@/lib/locale";
import { businessZone, isOpenNow } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!/^[a-z0-9-]{1,120}$/i.test(slug)) return NextResponse.json({ ok: false, error: "Geçersiz işletme." }, { status: 400 });
  const d = await getBusinessBySlug(slug);
  if (!d) return NextResponse.json({ ok: false, error: "İşletme bulunamadı." }, { status: 404 });
  const [user, locale, hasCapacity] = await Promise.all([currentUser(), getLocale(), orderCapacityAvailable(d.biz.id)]);
  const b = d.biz;
  const tz = businessZone(b.country);
  return NextResponse.json({
    ok: true,
    slug: b.slug,
    currency: b.currency ?? "TRY",
    lang: locale.lang,
    business: {
      id: b.id,
      name: b.name,
      district: b.district,
      modes: { gelAl: b.modeGelAl, rezerve: b.modeRezerve, paketServis: b.modePaketServis },
      acceptingOrders: b.acceptingOrders && hasCapacity,
      kdvRate: b.kdvRate,
      deliveryRadiusKm: b.deliveryRadiusKm,
      openNow: isOpenNow(d.hours, new Date(), tz),
      timeZone: tz,
      hours: d.hours.map((h) => ({ dayOfWeek: h.dayOfWeek, opensAt: h.opensAt, closesAt: h.closesAt, closed: h.closed })),
    },
    products: d.products.filter((p) => p.active).map((p) => ({
      id: p.id, name: p.name, description: p.description, priceCents: p.priceCents,
      discountPriceCents: p.discountPriceCents, deliveryPriceCents: p.deliveryPriceCents,
      options: p.options, kdvRate: p.kdvRate, category: p.category, imageUrl: p.imageUrl,
    })),
    campaigns: d.campaigns.map((c) => ({
      title: c.title, discountPercent: c.discountPercent, discountAmountCents: c.discountAmountCents,
      minBasketCents: c.minBasketCents, startsAt: c.startsAt, endsAt: c.endsAt,
      serviceMode: c.serviceMode, serviceModes: c.serviceModes, paymentScope: c.paymentScope,
    })),
    user: user ? { name: user.name, phone: user.phone, address: user.address } : null,
  });
}

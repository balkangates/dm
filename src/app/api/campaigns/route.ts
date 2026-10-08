import { createClient } from "@/lib/supabase/server";
import { resolveActor, can, deny } from "@/lib/auth";
import { logAudit } from "@/lib/finance";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("businessId");
  const supabase = await createClient();

  let query = supabase.from("campaigns").select("*");
  if (businessId) {
    query = query.eq("business_id", businessId);
  } else {
    query = query.order("created_at", { ascending: false }).limit(40);
  }

  const { data: rows, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, campaigns: rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  const businessId: string = body.businessId;
  const actor = await resolveActor(businessId, body.actorEmail ?? "");
  if (!actor) return Response.json({ ok: false, error: "Yetkili personel bulunamadı." }, { status: 401 });
  if (!can(actor.role, "campaign.write")) return deny(actor.role, "campaign.write");

  const title = String(body.title ?? "").trim();
  if (title.length < 3) return Response.json({ ok: false, error: "Kampanya başlığı en az 3 karakter olmalı." }, { status: 400 });

  // Finansal oranlar sunucuda sınırlandırılır (frontend'e güvenilmez)
  const discountPercent = Math.max(0, Math.min(60, Number(body.discountPercent ?? 0)));
  const discountAmountCents = Math.max(0, Math.min(500000, Math.round(Number(body.discountAmountCents ?? 0))));
  const minBasketCents = Math.max(0, Math.round(Number(body.minBasketCents ?? 0)));
  const maxDiscountCents = Math.max(0, Math.round(Number(body.maxDiscountCents ?? 0)));

  const code = `DMP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const supabase = await createClient();
  const { data: row, error: insertError } = await supabase
    .from("campaigns")
    .insert({
      business_id: businessId,
      code,
      title,
      description: String(body.description ?? ""),
      type: String(body.type ?? "PERCENT"),
      discount_percent: discountPercent,
      discount_amount_cents: discountAmountCents,
      min_basket_cents: minBasketCents,
      max_discount_cents: maxDiscountCents,
      usage_limit: body.usageLimit ? Math.max(1, Math.round(Number(body.usageLimit))) : null,
      per_customer_limit: Math.max(1, Math.round(Number(body.perCustomerLimit ?? 1))),
      starts_at: body.startsAt ? new Date(body.startsAt) : new Date(),
      ends_at: body.endsAt ? new Date(body.endsAt) : null,
      time_start: body.timeStart || null,
      time_end: body.timeEnd || null,
      days: Array.isArray(body.days) ? body.days.map(Number) : [],
      status: "PUBLISHED",
      qr_enabled: body.qrEnabled !== false,
    })
    .select()
    .single();

  if (insertError) return Response.json({ ok: false, error: insertError.message }, { status: 500 });

  // Kampanya QR'ı
  const { error: qrError } = await supabase.from("qr_codes").insert({
    code: `QR-${code}`,
    business_id: businessId,
    campaign_id: row.id,
    customer_id: null,
    status: "ACTIVE",
  });

  if (qrError) return Response.json({ ok: false, error: qrError.message }, { status: 500 });

  await logAudit(actor.email, actor.role, "CAMPAIGN_CREATED", "campaigns", row.id, { title, discountPercent });

  return Response.json({ ok: true, campaign: row });
}

/** Kasada kod / QR çözümleme — işletme, kampanya, müşteri doğrulaması */
export async function PUT(req: Request) {
  const body = await req.json();
  const code = String(body.code ?? "").trim();
  if (!code) return Response.json({ ok: false, error: "Kod gerekli." }, { status: 400 });

  const supabase = await createClient();

  const { data: qrRows, error: qrError } = await supabase
    .from("qr_codes")
    .select("*")
    .eq("code", code)
    .limit(1);

  if (qrError) return Response.json({ ok: false, error: qrError.message }, { status: 500 });

  const qr = qrRows?.[0] ?? null;

  const campaignCode = qr?.campaign_id ? undefined : code;
  let campaign = null;
  if (qr?.campaign_id) {
    const { data: campaignData } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", qr.campaign_id)
      .limit(1);
    campaign = campaignData?.[0] ?? null;
  } else if (campaignCode) {
    const { data: campaignData } = await supabase
      .from("campaigns")
      .select("*")
      .eq("code", campaignCode)
      .limit(1);
    campaign = campaignData?.[0] ?? null;
  }

  if (!qr && !campaign) {
    return Response.json({ ok: false, error: "Geçersiz kod. QR veya kampanya kodunu kontrol edin." }, { status: 404 });
  }

  const businessId = qr?.business_id ?? campaign?.business_id ?? null;
  let business = null;
  if (businessId) {
    const { data: businessData } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", businessId)
      .limit(1);
    business = businessData?.[0] ?? null;
  }

  let customer = null;
  let wallet = null;
  if (qr?.customer_id) {
    const { data: customerData } = await supabase
      .from("users")
      .select("*")
      .eq("id", qr.customer_id)
      .limit(1);
    customer = customerData?.[0] ?? null;

    const { data: walletData } = await supabase
      .from("damping_wallets")
      .select("*")
      .eq("user_id", qr.customer_id)
      .limit(1);
    wallet = walletData?.[0] ?? null;
  }

  return Response.json({
    ok: true,
    qr,
    campaign,
    business,
    customer,
    wallet,
    alreadyUsed: qr?.status === "REDEEMED",
  });
}

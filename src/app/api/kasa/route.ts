import { createClient } from "@/lib/supabase/server";
import { completeSale, reverseTransaction } from "@/lib/finance";
import { resolveActor, can, deny } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Sunucu tarafı fiyatlandırma önizlemesi — hiçbir finansal değer istemciye güvenilmez */
export async function POST(req: Request) {
  const body = await req.json();
  const action = String(body.action ?? "onizleme");

  if (action === "onizleme") {
    const businessId: string = body.businessId;
    const gross = Math.max(0, Math.round(Number(body.grossAmountCents ?? 0)));
    const supabase = await createClient();

    const { data: contractRows, error: contractError } = await supabase
      .from("business_contracts")
      .select("*")
      .eq("business_id", businessId);
    if (contractError || !contractRows || contractRows.length === 0) {
      return Response.json({ ok: false, error: "Sözleşme bulunamadı." }, { status: 400 });
    }
    const contract = contractRows[0];

    let campaign = null;
    if (body.campaignId) {
      const { data: campaignData } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", body.campaignId)
        .limit(1);
      campaign = campaignData?.[0] ?? null;
    } else if (body.code) {
      const { data: campaignData } = await supabase
        .from("campaigns")
        .select("*")
        .eq("code", body.code)
        .limit(1);
      campaign = campaignData?.[0] ?? null;
    }

    // Basit önizleme - tam fiyatlandırma RPC içinde yapılır
    const breakdown = {
      grossAmountCents: gross,
      discountCents: 0,
      dampingUsedCents: 0,
      netAmountCents: gross,
      commissionBaseCents: gross,
      commissionRate: contract.commission_rate,
      commissionCents: Math.round(gross * contract.commission_rate) + contract.fixed_fee_cents,
      poolContributionCents: 0,
      dampingEarnedCents: 0,
    };

    return Response.json({ ok: true, breakdown, issues: [], campaign, commissionBase: contract.commission_base });
  }

  if (action === "tamamla") {
    const businessId: string = body.businessId;
    const actor = await resolveActor(businessId, body.actorEmail ?? "");
    if (!actor) return Response.json({ ok: false, error: "Yetkili personel bulunamadı." }, { status: 401 });
    if (!can(actor.role, "kasa.sell")) return deny(actor.role, "kasa.sell");

    const result = await completeSale({
      businessId,
      campaignId: body.campaignId ?? null,
      code: body.code ?? null,
      grossAmountCents: Math.round(Number(body.grossAmountCents ?? 0)),
      dampingUseCents: Math.round(Number(body.dampingUseCents ?? 0)),
      paymentMethod: body.paymentMethod ?? "NAKIT",
      actorEmail: actor.email,
      actorRole: actor.role,
      note: body.note ?? null,
    });
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }

  if (action === "iade") {
    const actor = await resolveActor(body.businessId ?? "", body.actorEmail ?? "");
    if (!actor) return Response.json({ ok: false, error: "Yetkili personel bulunamadı." }, { status: 401 });
    if (!can(actor.role, "transaction.reverse")) return deny(actor.role, "transaction.reverse");
    const res = await reverseTransaction(String(body.transactionId), actor.email, String(body.reason ?? "İade"));
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }

  return Response.json({ ok: false, error: "Bilinmeyen işlem." }, { status: 400 });
}

/** Son işlemler (kasiyerin kendi akışı) */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("businessId");
  if (!businessId) return Response.json({ ok: false, error: "businessId gerekli." }, { status: 400 });
  const supabase = await createClient();

  const { data: rows, error: txError } = await supabase
    .from("store_transactions")
    .select("*")
    .eq("business_id", businessId)
    .limit(15);
  if (txError) return Response.json({ ok: false, error: txError.message }, { status: 500 });

  const { data: customers } = await supabase.from("users").select("*").limit(50);
  const { data: qrs } = await supabase.from("qr_codes").select("*").eq("business_id", businessId).limit(20);

  return Response.json({
    ok: true,
    transactions: (rows ?? []).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    customers: customers ?? [],
    qrs: qrs ?? [],
  });
}

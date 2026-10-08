import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/finance";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const action = String(body.action ?? "");
  const supabase = await createClient();

  if (action === "package_price") {
    const code = String(body.code ?? "");
    const price = Math.max(0, Math.round(Number(body.priceMonthlyCents ?? 0)));
    const { data: row, error } = await supabase
      .from("packages")
      .update({ price_monthly_cents: price })
      .eq("code", code)
      .select()
      .single();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    await logAudit("admin@dampingvar.com", "ADMIN", "PACKAGE_PRICE_UPDATED", "packages", row?.id ?? null, {
      code,
      price,
    });
    return Response.json({ ok: true, package: row });
  }

  if (action === "fraud_resolve") {
    const id = String(body.id ?? "");
    const status = body.status === "CLEARED" ? "CLEARED" : "BLOCKED";
    const { data: row, error } = await supabase
      .from("fraud_reviews")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    if (status === "BLOCKED" && row?.transaction_id) {
      await supabase.from("store_transactions").update({ status: "FRAUD_REVIEW" }).eq("id", row.transaction_id);
    }
    await logAudit("admin@dampingvar.com", "ADMIN", `FRAUD_${status}`, "fraud_reviews", id, {});
    return Response.json({ ok: true, fraud: row });
  }

  if (action === "set_user_balance") {
    // Kural: bakiye düzeltmesi ledger olmadan yapılamaz
    return Response.json(
      { ok: false, error: "Bakiye düzeltmesi ledger kaydı olmadan yapılamaz." },
      { status: 400 }
    );
  }

  return Response.json({ ok: false, error: "Bilinmeyen admin işlemi." }, { status: 400 });
}

export async function GET() {
  const supabase = await createClient();
  const { data: usersList, error } = await supabase.from("users").select("*").limit(5);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, users: usersList?.length ?? 0 });
}

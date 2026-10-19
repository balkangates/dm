/**
 * FAZ 5 — API rota yazımlarının Supabase karşılıkları.
 *
 *  * Yazma yetkinin nihai sınırı RLS + dv_* RPC'leridir; bu dosya yalnızca
 *    doğrulama (sunucu) + PostgREST/RPC çağrısı katmanıdır.
 *  * Roller küçük harf saklanır; actor bilgisi lib/authz.ts'ten gelir (sunucu).
 *  * RPC hataları Türkçe mesajla 400 döner (eski jsonError mesajlarıyla aynı metin).
 *  * Finansal değerler istemciden SUNUCUDA sınırırlanır (eski rotalarla aynı).
 */
import { createClient } from "@/lib/supabase/server";
import { trackEvent, logAudit } from "@/lib/queries";
import { slugify } from "@/lib/money";
import { getSessionUser, type BusinessActorLite, type SessionUserLite } from "@/lib/authz";

type Row = Record<string, unknown>;

async function sb() {
  return await createClient();
}

export class ActionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Supabase-js hatasını ActionError'a çevirir (mesaj RPC/RLS'ten gelir). */
function fail(error: { message: string } | null, fallback = "İşlem tamamlanamadı."): never {
  throw new ActionError(400, error?.message || fallback);
}

/** Yüzeysel snake_case → camelCase (eski Drizzle satır şekline yakın çıktı). */
function cam(row: Row | null): Row | null {
  if (!row) return null;
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  return out;
}

/* ================================================================== *
 * QR / KAMPANYA KULLANIMI — tüm geçişler dv_* RPC'leriyledir
 * ================================================================== */

export async function qrScan(code: string) {
  const client = await sb();
  const { data, error } = await client.rpc("dv_qr_scan", { p_code: code });
  if (error) fail(error);
  return Response.json(data as Row);
}

export async function qrSubmit(usageId: string, basket: number | null) {
  const client = await sb();
  const { data, error } = await client.rpc("dv_qr_submit", {
    p_usage_id: usageId,
    p_basket: basket ?? null,
  });
  if (error) fail(error);
  return Response.json(data as Row);
}

/* ================================================================== *
 * FAZ 10 — "İşletme Aç" öz-kayıtı (dv_business_signup RPC)
 * ================================================================== */
export async function openBusinessAction(body: Row) {
  const u = await getSessionUser();
  if (!u) throw new ActionError(401, "Giriş yapmalısınız.");
  if (u.role === "ADMIN") throw new ActionError(403, "Yönetici hesapları işletme açamaz.");

  const name = String(body.name ?? "").trim();
  const category = String(body.category ?? "").trim();
  const district = String(body.district ?? "").trim();
  const city = String(body.city ?? "").trim();
  const address = String(body.address ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const description = String(body.description ?? "").trim();

  // Doğrulama — RPC içindekiyle AYNI sınırlar (çift katman).
  if (name.length < 2 || name.length > 120) throw new ActionError(400, "İşletme adı 2-120 karakter olmalı.");
  if (category.length < 2 || category.length > 60) throw new ActionError(400, "Kategori 2-60 karakter olmalı.");
  if (district.length < 2 || district.length > 60) throw new ActionError(400, "İlçe 2-60 karakter olmalı.");
  if ((city || "İstanbul").length > 60) throw new ActionError(400, "İl en fazla 60 karakter olabilir.");
  if (address.length < 5 || address.length > 240) throw new ActionError(400, "Adres 5-240 karakter olmalı.");
  if (phone && (phone.length < 7 || phone.length > 20 || !/^[0-9+() -]+$/.test(phone)))
    throw new ActionError(400, "Telefon geçerli değil.");
  if (description.length > 400) throw new ActionError(400, "Açıklama en fazla 400 karakter olabilir.");

  const client = await sb();
  const { data, error } = await client.rpc("dv_business_request", {
    p_name: name,
    p_category: category,
    p_district: district,
    p_city: city || "İstanbul",
    p_address: address,
    p_phone: phone || null,
    p_description: description || null,
  });
  if (error) fail(error);
  return Response.json({ ok: true, request: data });
}

export async function qrVerifyReject(
  actor: BusinessActorLite,
  opts: { usageId: string; action: "verify" | "reject"; basket: number | null; discount: number | null; note: string | null }
) {
  const client = await sb();
  const { data, error } = await client.rpc("dv_qr_verify", {
    p_usage_id: opts.usageId,
    p_action: opts.action,
    p_basket: opts.basket ?? null,
    p_discount: opts.discount ?? null,
    p_note: opts.note ?? null,
  });
  if (error) fail(error);
  return Response.json({ ...(data as Row), actor: actor.email });
}

export async function qrCancel(actor: BusinessActorLite, usageId: string, note: string | null) {
  const client = await sb();
  const { data, error } = await client.rpc("dv_qr_cancel", { p_usage_id: usageId, p_note: note });
  if (error) fail(error);
  return Response.json(data as Row);
}

export async function bonusRedeem(user: SessionUserLite, bonusId: string, usageId: string | null) {
  const client = await sb();
  const { data, error } = await client.rpc("dv_bonus_redeem", { p_bonus_id: bonusId, p_usage_id: usageId });
  if (error) fail(error);
  return Response.json({ ...(data as Row), ok: true });
}

/** GET /api/qr?code= — kampanya bilgisi (herkese açık RLS). */
export async function qrGet(code: string) {
  const client = await sb();
  const { data: qr } = await client.from("qr_codes").select("*").eq("code", code).limit(1).maybeSingle();
  let campaign: Row | null = null;
  if (qr?.campaign_id) {
    const { data } = await client.from("campaigns").select("*").eq("id", str(qr.campaign_id)).limit(1).maybeSingle();
    campaign = data;
  }
  if (!campaign) {
    const { data } = await client.from("campaigns").select("*").eq("code", code).limit(1).maybeSingle();
    campaign = data;
  }
  if (!campaign) throw new ActionError(404, "Kod bulunamadı.");
  const { data: biz } = await client.from("businesses").select("*").eq("id", str(campaign.business_id)).limit(1).maybeSingle();
  const c = campaign;
  const b = biz ?? {};
  return Response.json({
    ok: true,
    campaign: {
      id: c.id,
      code: c.code,
      slug: c.slug,
      title: c.title,
      description: c.description,
      terms: c.terms,
      type: c.type,
      discountPercent: c.discount_percent,
      discountAmountCents: c.discount_amount_cents,
      minBasketCents: c.min_basket_cents,
      maxDiscountCents: c.max_discount_cents,
      currency: c.currency,
      startsAt: c.starts_at ?? null,
      endsAt: c.ends_at ?? null,
      timeStart: c.time_start,
      timeEnd: c.time_end,
      days: (c.days as number[]) ?? [],
      eligibleItems: (c.eligible_items as string[]) ?? [],
      exclusions: (c.exclusions as string[]) ?? [],
      perCustomerLimit: c.per_customer_limit,
      usageLimit: c.usage_limit,
      businessName: (b as Row).name,
      businessSlug: (b as Row).slug,
      district: (b as Row).district,
      city: (b as Row).city,
      address: (b as Row).address,
    },
    qrCode: (qr?.code as string) ?? code,
  });
}

const str = (v: unknown) => String(v ?? "");

/* ================================================================== *
 * HESAP (/api/account)
 * ================================================================== */

export async function accountToggleSave(user: SessionUserLite, campaignId: string, save: boolean) {
  const client = await sb();
  if (save) {
    const { data: exists } = await client
      .from("saved_campaigns")
      .select("id")
      .eq("user_id", user.id)
      .eq("campaign_id", campaignId)
      .limit(1);
    if (!exists?.length) {
      const { error } = await client.from("saved_campaigns").insert({ user_id: user.id, campaign_id: campaignId });
      if (error && !error.message.includes("duplicate")) fail(error);
    }
    await trackEvent("campaign_saved", { campaignId, userId: user.id });
    return Response.json({ ok: true, saved: true });
  }
  await client.from("saved_campaigns").delete().eq("user_id", user.id).eq("campaign_id", campaignId);
  return Response.json({ ok: true, saved: false });
}

export async function accountToggleFollow(user: SessionUserLite, businessId: string, follow: boolean) {
  const client = await sb();
  if (follow) {
    const { data: exists } = await client
      .from("followed_businesses")
      .select("id")
      .eq("user_id", user.id)
      .eq("business_id", businessId)
      .limit(1);
    if (!exists?.length) {
      const { error } = await client.from("followed_businesses").insert({ user_id: user.id, business_id: businessId });
      if (error && !error.message.includes("duplicate")) fail(error);
    }
    await trackEvent("business_followed", { businessId, userId: user.id });
    return Response.json({ ok: true, following: true });
  }
  await client.from("followed_businesses").delete().eq("user_id", user.id).eq("business_id", businessId);
  return Response.json({ ok: true, following: false });
}

export async function accountReadNotification(user: SessionUserLite, id: string) {
  const client = await sb();
  await client.from("notifications").update({ read: true }).eq("id", id).eq("user_id", user.id);
  return Response.json({ ok: true });
}

export async function accountReadAll(user: SessionUserLite) {
  const client = await sb();
  await client.from("notifications").update({ read: true }).eq("user_id", user.id);
  return Response.json({ ok: true });
}

export async function accountPreferences(user: SessionUserLite, body: Row) {
  const client = await sb();
  const patch: Row = {};
  if (typeof body.name === "string" && body.name.trim().length >= 3) patch.name = body.name.trim().slice(0, 120);
  if (typeof body.phone === "string") patch.phone = body.phone.slice(0, 40);
  if (typeof body.district === "string") patch.district = body.district.slice(0, 80);
  if (["tr", "en", "ka"].includes(String(body.lang))) patch.lang = String(body.lang);
  if (["TRY", "USD", "GEL", "EUR"].includes(String(body.currency))) patch.currency = String(body.currency);
  if (typeof body.country === "string" && body.country.length === 2) patch.country = String(body.country).toUpperCase();
  if (!Object.keys(patch).length) throw new ActionError(400, "Güncellenecek alan yok.");

  // RLS: yalnızca kendi satırı; profiles_guard trigger rol/e-posta/davet değişikliğini reddeder.
  const { data, error } = await client.from("profiles").update(patch).eq("id", user.id).select("*").maybeSingle();
  if (error) fail(error);
  await logAudit(user.email, user.role, "PROFILE_UPDATED", "profiles", user.id, { fields: Object.keys(patch) });
  return Response.json({
    ok: true,
    user: {
      ...(cam(data as Row) as Row),
      role: String((data as Row)?.role ?? "customer").toUpperCase(),
      referralCode: (data as Row)?.referral_code,
      businessId: null,
    },
  });
}

export async function accountReportCampaign(user: SessionUserLite, campaignId: string, reason: string) {
  const client = await sb();
  const { error } = await client.from("notifications").insert({
    user_id: user.id,
    kind: "SYSTEM",
    title: "Bildirim alındı",
    body: "Kampanya bildirimin moderasyon ekibine iletildi. Sonuç e-posta ile paylaşılır.",
    link: "/kampanyalar",
  });
  if (error) fail(error);
  await logAudit(user.email, user.role, "CAMPAIGN_REPORTED", "campaigns", campaignId, { reason });
  return Response.json({ ok: true });
}

/* ================================================================== *
 * KAMPANYALAR (/api/campaigns)
 * ================================================================== */

export async function campaignsList(businessId: string | null) {
  const client = await sb();
  const q = client.from("campaigns").select("*").order("created_at", { ascending: false });
  const { data, error } = businessId ? await q.eq("business_id", businessId) : await q.limit(50);
  if (error) fail(error);
  return Response.json({ ok: true, campaigns: (data ?? []).map((r) => cam(r as Row)) });
}

function clamp(n: unknown, min: number, max: number, fallback = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export async function campaignUpsert(actor: BusinessActorLite, body: Row) {
  const client = await sb();
  const action = String(body.action ?? "create");

  if (action === "status") {
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!["DRAFT", "PUBLISHED", "PAUSED", "ENDED"].includes(status)) throw new ActionError(400, "Geçersiz durum.");
    const { data: row } = await client.from("campaigns").select("*").eq("id", id).maybeSingle();
    if (!row) throw new ActionError(404, "Kampanya bulunamadı.");
    if (str(row.business_id) !== actor.businessId) throw new ActionError(403, "Bu kampanya size ait değil.");
    const { data: updated, error } = await client
      .from("campaigns")
      .update({ status })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) fail(error);
    await logAudit(actor.email, actor.staffRole, `CAMPAIGN_${status}`, "campaigns", id, { title: row.title });
    return Response.json({ ok: true, campaign: cam(updated as Row) });
  }

  // create / update — doğrulama eski rotayla birebir
  const title = String(body.title ?? "").trim();
  const errors: Record<string, string> = {};
  if (title.length < 5) errors.title = "Başlık en az 5 karakter olmalı.";

  const type = String(body.type ?? "PERCENT");
  const discountPercent = clamp(body.discountPercent, 0, 70);
  const discountAmountCents = clamp(body.discountAmountCents, 0, 5_000_000);
  if (type === "PERCENT" && discountPercent <= 0) errors.discountPercent = "Yüzde 0'dan büyük olmalı.";
  if ((type === "FIXED" || type === "PRODUCT") && discountAmountCents <= 0)
    errors.discountAmountCents = "Sabit indirim tutarı 0'dan büyük olmalı.";

  const description = String(body.description ?? "").trim();
  if (description.length < 10) errors.description = "Açıklama en az 10 karakter olmalı.";
  const terms = String(body.terms ?? "").trim();
  if (terms.length < 20) errors.terms = "Kampanya koşulları en az 20 karakter olmalı (müşteriye gösterilir).";

  const startsAt = body.startsAt ? new Date(String(body.startsAt)) : new Date();
  const endsAt = body.endsAt ? new Date(String(body.endsAt)) : null;
  if (Number.isNaN(startsAt.getTime())) errors.startsAt = "Geçersiz başlangıç tarihi.";
  if (endsAt && Number.isNaN(endsAt.getTime())) errors.endsAt = "Geçersiz bitiş tarihi.";
  if (endsAt && endsAt <= startsAt) errors.endsAt = "Bitiş tarihi başlangıçtan sonra olmalı.";

  const minBasketCents = clamp(body.minBasketCents, 0, 10_000_000);
  const currency = ["TRY", "USD", "GEL", "EUR"].includes(String(body.currency)) ? String(body.currency) : "TRY";
  if (Object.keys(errors).length) return Response.json({ ok: false, errors }, { status: 422 });

  const values: Row = {
    title,
    description,
    terms,
    type,
    discount_percent: discountPercent,
    discount_amount_cents: discountAmountCents,
    min_basket_cents: minBasketCents,
    max_discount_cents: clamp(body.maxDiscountCents, 0, 5_000_000),
    currency,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt ? endsAt.toISOString() : null,
    time_start: body.timeStart ? String(body.timeStart) : null,
    time_end: body.timeEnd ? String(body.timeEnd) : null,
    days: Array.isArray(body.days) ? body.days.map((d: unknown) => clamp(d, 0, 6)).slice(0, 7) : [],
    per_customer_limit: clamp(body.perCustomerLimit, 1, 100, 1),
    usage_limit: body.usageLimit ? clamp(body.usageLimit, 1, 1_000_000) : null,
    eligible_items: Array.isArray(body.eligibleItems) ? body.eligibleItems.map(String).slice(0, 20) : [],
    exclusions: Array.isArray(body.exclusions) ? body.exclusions.map(String).slice(0, 20) : [],
    image_url: body.imageUrl ? String(body.imageUrl).slice(0, 400) : null,
    qr_enabled: body.qrEnabled !== false,
    status: body.publish === true ? "PUBLISHED" : "DRAFT",
    moderation_status: "PENDING",
    is_sponsored: false,
  };

  const id = body.id ? String(body.id) : null;
  if (id) {
    const { data: existing } = await client.from("campaigns").select("*").eq("id", id).maybeSingle();
    if (!existing) throw new ActionError(404, "Kampanya bulunamadı.");
    if (str(existing.business_id) !== actor.businessId) throw new ActionError(403, "Bu kampanya size ait değil.");
    const { data: updated, error } = await client
      .from("campaigns")
      // Koşullar değiştiyse moderasyon yeniden gerekir.
      .update(values)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) fail(error);
    await logAudit(actor.email, actor.staffRole, "CAMPAIGN_UPDATED", "campaigns", id, { title });
    return Response.json({ ok: true, campaign: cam(updated as Row) });
  }

  const code = `DMP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const { data: created, error } = await client
    .from("campaigns")
    .insert({ ...values, business_id: actor.businessId, code, slug: `${slugify(title)}-${code.toLowerCase()}` })
    .select("*")
    .maybeSingle();
  if (error || !created) fail(error);

  const { error: qrError } = await client.from("qr_codes").insert({
    code: `QR-${code}`,
    business_id: actor.businessId,
    campaign_id: (created as Row).id,
    customer_id: null,
    status: "ACTIVE",
  });
  if (qrError) fail(qrError);

  await trackEvent("qr_generated", { businessId: actor.businessId, campaignId: str((created as Row).id), meta: { code } });
  await logAudit(actor.email, actor.staffRole, "CAMPAIGN_CREATED", "campaigns", str((created as Row).id), { title, code });
  return Response.json({ ok: true, campaign: cam(created as Row) });
}

export async function campaignBump(id: string, field: string) {
  const client = await sb();
  const { error } = await client.rpc("dv_campaign_bump", { p_campaign_id: id, p_field: field });
  if (error) fail(error);
  return Response.json({ ok: true });
}

/* ================================================================== *
 * İŞLETME (/api/business)
 * ================================================================== */

const EDITABLE = [
  "name",
  "description",
  "story",
  "phone",
  "whatsapp",
  "instagram",
  "website",
  "address",
  "subCategory",
  "logoText",
  "coverImage",
] as const;

const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

export async function businessAction(actor: BusinessActorLite, body: Row) {
  const client = await sb();
  const action = String(body.action ?? "profile");

  if (action === "profile") {
    const patch: Row = {};
    for (const key of EDITABLE) if (typeof body[key] === "string") patch[toSnake(key)] = String(body[key]).slice(0, 1500);
    if (!Object.keys(patch).length) throw new ActionError(400, "Güncellenecek alan yok.");
    // RLS: işletme personeli yalnızca kendi işletmesini günceller (çapraz işletme imkânsız).
    const { data: row, error } = await client
      .from("businesses")
      .update(patch)
      .eq("id", actor.businessId)
      .select("*")
      .maybeSingle();
    if (error) fail(error);
    if (!row) throw new ActionError(404, "İşletme bulunamadı.");
    await logAudit(actor.email, actor.staffRole, "BUSINESS_PROFILE_UPDATED", "businesses", actor.businessId, {
      fields: Object.keys(patch),
    });
    return Response.json({ ok: true, business: cam(row as Row) });
  }

  if (action === "hours") {
    const rows = Array.isArray(body.hours) ? body.hours : [];
    for (const h of rows.slice(0, 7)) {
      const r = h as Row;
      const id = String(r.id ?? "");
      if (!id) continue;
      const timeOk = (v: unknown) => (/^\d{2}:\d{2}$/.test(String(v ?? "")) ? String(v) : null);
      // RLS: yalnızca kendi işletmesinin satırları güncellenir (çapraz yazım engeli).
      await client
        .from("business_hours")
        .update({
          opens_at: timeOk(r.opensAt) ?? "09:00",
          closes_at: timeOk(r.closesAt) ?? "22:00",
          closed: r.closed === true,
        })
        .eq("id", id)
        .eq("business_id", actor.businessId);
    }
    await logAudit(actor.email, actor.staffRole, "BUSINESS_HOURS_UPDATED", "businesses", actor.businessId, {});
    return Response.json({ ok: true });
  }

  if (action === "content_decision") {
    const decision = String(body.decision ?? "");
    const status = decision === "publish" ? "PUBLISHED" : decision === "reject" ? "REJECTED" : "APPROVED";
    const { data: row } = await client.from("ai_contents").select("*").eq("id", String(body.id ?? "")).maybeSingle();
    if (!row) throw new ActionError(404, "İçerik bulunamadı.");
    if (str(row.business_id) !== actor.businessId) throw new ActionError(403, "Bu içerik size ait değil.");
    const { data: updated, error } = await client
      .from("ai_contents")
      .update({ status, approved_at: status === "REJECTED" ? null : new Date().toISOString() })
      .eq("id", str(row.id))
      .select("*")
      .maybeSingle();
    if (error) fail(error);
    await logAudit(actor.email, actor.staffRole, `AI_CONTENT_${status}`, "ai_contents", str(row.id), {});
    return Response.json({ ok: true, content: cam(updated as Row) });
  }

  if (action === "content_delete") {
    const id = String(body.id ?? "");
    const { data: row } = await client.from("ai_contents").select("*").eq("id", id).maybeSingle();
    if (!row || str(row.business_id) !== actor.businessId) throw new ActionError(404, "İçerik bulunamadı.");
    await client.from("ai_contents").delete().eq("id", id);
    await logAudit(actor.email, actor.staffRole, "AI_CONTENT_DELETED", "ai_contents", id, {});
    return Response.json({ ok: true });
  }

  if (action === "plan_day_toggle") {
    const id = String(body.id ?? "");
    const { data: row } = await client
      .from("marketing_plan_days")
      .update({ done: body.done === true })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (!row) throw new ActionError(404, "Görev bulunamadı.");
    await logAudit(actor.email, actor.staffRole, "PLAN_DAY_TOGGLED", "marketing_plan_days", id, { done: row.done });
    return Response.json({ ok: true, day: cam(row as Row) });
  }

  if (action === "video_request") {
    const { data: row, error } = await client
      .from("ai_contents")
      .insert({
        business_id: actor.businessId,
        kind: "VIDEO_EDIT_REQUEST",
        platform: "DampingVar Video Hizmeti",
        title: `Video düzenleme talebi — ${String(body.fileName ?? "belirtilmedi").slice(0, 120)}`,
        body: `${String(body.note ?? "").slice(0, 600)}\n\nDurum: üretim servisi bağlı değil. Talep, hizmet bedeli kurallarına göre fiyatlandırılıp faturalandırılır.`,
        cta: "Talebi değerlendir",
        status: "DRAFT",
        meta: { fileName: String(body.fileName ?? ""), renderStatus: "NOT_RENDERED", integration: "NOT_CONNECTED" },
      })
      .select("*")
      .maybeSingle();
    if (error || !row) fail(error);
    await logAudit(actor.email, actor.staffRole, "VIDEO_SERVICE_REQUESTED", "ai_contents", str(row.id), {});
    return Response.json({ ok: true, content: cam(row as Row) });
  }

  if (action === "ad_request") {
    const { data: row, error } = await client
      .from("ad_campaigns")
      .insert({
        business_id: actor.businessId,
        name: String(body.name ?? "Yeni reklam kampanyası").slice(0, 140),
        placement: String(body.placement ?? "KATEGORI"),
        city: String(body.city ?? "İstanbul"),
        district: String(body.district ?? "").slice(0, 80) || null,
        category: String(body.category ?? "").slice(0, 80) || null,
        budget_cents: Math.max(0, Math.min(100_000_000, Math.round(Number(body.budgetCents ?? 0)))),
        // Reklam, yönetici onayı olmadan yayına girmez.
        status: "PENDING_APPROVAL",
        starts_at: body.startsAt ? new Date(String(body.startsAt)).toISOString() : new Date().toISOString(),
        ends_at: body.endsAt ? new Date(String(body.endsAt)).toISOString() : null,
      })
      .select("*")
      .maybeSingle();
    if (error || !row) fail(error);
    await logAudit(actor.email, actor.staffRole, "AD_REQUESTED", "ad_campaigns", str(row.id), {
      placement: row.placement,
      budgetCents: row.budget_cents,
    });
    return Response.json({ ok: true, ad: cam(row as Row) });
  }

  throw new ActionError(400, "Bilinmeyen işlem.");
}

/* ================================================================== *
 * ADMİN (/api/admin) — RLS: yalnızca is_admin() satırlara dokunabilir
 * ================================================================== */

const clampInt = (v: unknown, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v ?? 0)) || 0));

export async function adminAction(user: SessionUserLite, body: Row) {
  const client = await sb();
  const action = String(body.action ?? "");
  const id = String(body.id ?? "");

  switch (action) {
    case "approve_business": {
      // FAZ 10 — "İşletme Aç" talebi onayı: businesses + business_staff yazılır,
      // rol customer→business, talep approved (dv_admin_approve_business).
      const userId = String(body.user_id ?? "");
      if (!userId) throw new ActionError(400, "Kullanıcı gerekli.");
      const { data, error } = await client.rpc("dv_admin_approve_business", { p_user_id: userId });
      if (error) fail(error);
      await logAudit(user.email, "ADMIN", "BUSINESS_SIGNUP_APPROVED", "profiles", userId, data as Row);
      return Response.json({ ok: true, business: data });
    }
    case "revoke_business": {
      // FAZ 10 — onay geri alma: işletme askıya alınır (suspended_at),
      // personel bağlantıları kapanır, rol customer'a döner (dv_admin_revoke_business).
      const userId = String(body.user_id ?? "");
      if (!userId) throw new ActionError(400, "Kullanıcı gerekli.");
      const { data, error } = await client.rpc("dv_admin_revoke_business", { p_user_id: userId });
      if (error) fail(error);
      await logAudit(user.email, "ADMIN", "BUSINESS_SIGNUP_REVOKED", "profiles", userId, data as Row);
      return Response.json({ ok: true, revoke: data });
    }
    case "campaign_moderate": {
      const decision = String(body.decision ?? "");
      if (!["APPROVED", "REJECTED", "PENDING"].includes(decision)) throw new ActionError(400, "Geçersiz karar.");
      const { data: row, error } = await client
        .from("campaigns")
        .update({ moderation_status: decision })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) fail(error);
      if (!row) throw new ActionError(404, "Kampanya bulunamadı.");
      await logAudit(user.email, "ADMIN", `CAMPAIGN_${decision}`, "campaigns", id, { title: row.title });
      return Response.json({ ok: true, campaign: cam(row as Row) });
    }
    case "campaign_feature": {
      const { data: row, error } = await client
        .from("campaigns")
        .update({ is_sponsored: body.isSponsored === true })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) fail(error);
      if (!row) throw new ActionError(404, "Kampanya bulunamadı.");
      await logAudit(user.email, "ADMIN", "CAMPAIGN_SPONSOR_TOGGLE", "campaigns", id, { isSponsored: row.is_sponsored });
      return Response.json({ ok: true, campaign: cam(row as Row) });
    }
    case "business_verify": {
      const patch: Row = { verified: body.verified === true };
      if (body.featured === true) patch.featured = true;
      const { data: row, error } = await client.from("businesses").update(patch).eq("id", id).select("*").maybeSingle();
      if (error) fail(error);
      if (!row) throw new ActionError(404, "İşletme bulunamadı.");
      await logAudit(user.email, "ADMIN", "BUSINESS_VERIFY", "businesses", id, { verified: row.verified });
      return Response.json({ ok: true, business: cam(row as Row) });
    }
    case "business_plan": {
      const planCode = String(body.planCode ?? "");
      const { data: pkg } = await client.from("packages").select("*").eq("code", planCode).limit(1);
      if (!pkg?.length) throw new ActionError(400, "Geçersiz paket kodu.");
      const { data: row, error } = await client
        .from("businesses")
        .update({ plan_code: planCode })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) fail(error);
      await logAudit(user.email, "ADMIN", "BUSINESS_PLAN_CHANGED", "businesses", id, { planCode });
      return Response.json({ ok: true, business: cam(row as Row) });
    }
    case "package_update": {
      const code = String(body.code ?? id);
      const { data: row, error } = await client
        .from("packages")
        .update({
          price_monthly_cents: clampInt(body.priceMonthlyCents, 0, 100_000_000),
          ai_quota_monthly: clampInt(body.aiQuotaMonthly, 0, 100_000),
          active: body.active === undefined ? true : body.active === true,
        })
        .eq("code", code)
        .select("*")
        .maybeSingle();
      if (error) fail(error);
      if (!row) throw new ActionError(404, "Paket bulunamadı.");
      await logAudit(user.email, "ADMIN", "PACKAGE_UPDATED", "packages", row.id, { code });
      return Response.json({ ok: true, package: cam(row as Row) });
    }
    case "fee_rule_update": {
      const { data: row, error } = await client
        .from("service_fee_rules")
        .update({
          amount_cents: clampInt(body.amountCents, 0, 100_000_000),
          rate: Math.max(0, Math.min(1, Number(body.rate ?? 0) || 0)),
          active: body.active === undefined ? true : body.active === true,
          // Yeni kural ileriye dönük geçerli olur; geçmiş faturalar değişmez.
          valid_from: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) fail(error);
      if (!row) throw new ActionError(404, "Kural bulunamadı.");
      await logAudit(user.email, "ADMIN", "FEE_RULE_UPDATED", "service_fee_rules", id, {});
      return Response.json({ ok: true, rule: cam(row as Row) });
    }
    case "invoice_status": {
      const status = String(body.status ?? "");
      if (!["DRAFT", "ISSUED", "SENT", "PAID", "PARTIALLY_PAID", "OVERDUE", "CANCELLED"].includes(status))
        throw new ActionError(400, "Geçersiz fatura durumu.");
      const patch: Row = { status };
      if (status === "ISSUED") patch.issued_at = new Date().toISOString();
      patch.paid_at = status === "PAID" ? new Date().toISOString() : null;
      const { data: row, error } = await client.from("invoices").update(patch).eq("id", id).select("*").maybeSingle();
      if (error) fail(error);
      if (!row) throw new ActionError(404, "Fatura bulunamadı.");
      await logAudit(user.email, "ADMIN", `INVOICE_${status}`, "invoices", id, { number: row.number });
      return Response.json({ ok: true, invoice: cam(row as Row) });
    }
    case "bonus_policy_update": {
      const { data: row, error } = await client
        .from("bonus_policies")
        .update({
          reward_kind: body.rewardKind === "PERCENT_OF_BASKET" ? "PERCENT_OF_BASKET" : "FIXED",
          reward_cents: clampInt(body.rewardCents, 0, 1_000_000),
          reward_percent: Math.max(0, Math.min(0.5, Number(body.rewardPercent ?? 0) || 0)),
          max_reward_cents: clampInt(body.maxRewardCents, 0, 1_000_000),
          min_purchase_cents: clampInt(body.minPurchaseCents, 0, 10_000_000),
          valid_days: clampInt(body.validDays, 1, 365),
          max_per_inviter: clampInt(body.maxPerInviter, 0, 1000),
          requires_verification: body.requiresVerification !== false,
          active: body.active === undefined ? true : body.active === true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) fail(error);
      if (!row) throw new ActionError(404, "Politika bulunamadı.");
      await logAudit(user.email, "ADMIN", "BONUS_POLICY_UPDATED", "bonus_policies", id, {});
      return Response.json({ ok: true, policy: cam(row as Row) });
    }
    case "fraud_resolve": {
      const status = body.status === "CLEARED" ? "CLEARED" : "BLOCKED";
      const { data: row, error } = await client.from("fraud_reviews").update({ status }).eq("id", id).select("*").maybeSingle();
      if (error) fail(error);
      if (!row) throw new ActionError(404, "Kayıt bulunamadı.");
      await logAudit(user.email, "ADMIN", `FRAUD_${status}`, "fraud_reviews", id, {});
      return Response.json({ ok: true, fraud: cam(row as Row) });
    }
    case "ad_status": {
      const status = String(body.status ?? "");
      if (!["DRAFT", "PENDING_APPROVAL", "ACTIVE", "ENDED"].includes(status))
        throw new ActionError(400, "Geçersiz reklam durumu.");
      const { data: row, error } = await client.from("ad_campaigns").update({ status }).eq("id", id).select("*").maybeSingle();
      if (error) fail(error);
      if (!row) throw new ActionError(404, "Reklam bulunamadı.");
      await logAudit(user.email, "ADMIN", `AD_${status}`, "ad_campaigns", id, { name: row.name });
      return Response.json({ ok: true, ad: cam(row as Row) });
    }
    case "ai_setting": {
      const key = String(body.key ?? "");
      const value = String(body.value ?? "").slice(0, 400);
      if (!key) throw new ActionError(400, "Anahtar gerekli.");
      const { data: row, error } = await client.from("ai_settings").update({ value }).eq("key", key).select("*").maybeSingle();
      if (error) fail(error);
      // Anahtar değerleri log'a yazılmaz.
      await logAudit(user.email, "ADMIN", "AI_SETTING_UPDATED", "ai_settings", key, {
        key,
        masked: key.toLowerCase().includes("key") || key.toLowerCase().includes("secret"),
      });
      return Response.json({ ok: true, setting: row ? { key: row.key, value: row.value } : null });
    }
    default:
      throw new ActionError(400, "Bilinmeyen yönetici işlemi.");
  }
}

/* ================================================================== *
 * AFFILIATE (/api/affiliate)
 * ================================================================== */

export async function affiliateClick(user: SessionUserLite | null, offerId: string, channel: string) {
  const client = await sb();
  const { data: offer } = await client.from("affiliate_offers").select("*").eq("id", offerId).limit(1).maybeSingle();
  if (!offer) throw new ActionError(404, "Fırsat bulunamadı.");

  const clickId = `dv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await client.from("affiliate_clicks").insert({
    offer_id: offerId,
    user_id: user?.id ?? null,
    click_id: clickId,
    channel,
    confirmed_outbound: false,
  });
  if (error) fail(error);
  await client.rpc("dv_offer_bump", { p_offer_id: offerId });
  await trackEvent("affiliate_click", {
    userId: user?.id ?? null,
    meta: { offerId, clickId, merchant: offer.merchant },
  });

  return Response.json({
    ok: true,
    clickId,
    destinationUrl: offer.destination_url,
    merchant: offer.merchant,
    disclosure: offer.disclosure,
    notice:
      "DampingVar'dan ayrılıyorsun. Alışveriş, ödeme ve teslimat tamamen satıcının sitesinde gerçekleşir.",
  });
}

export async function affiliateConfirmOutbound(user: SessionUserLite | null, clickId: string) {
  const client = await sb();
  const { error } = await client.rpc("dv_affiliate_confirm", { p_click_id: clickId });
  if (error) fail(error, "Tıklama kaydı bulunamadı.");
  await trackEvent("affiliate_outbound", { userId: user?.id ?? null, meta: { clickId } });
  return Response.json({ ok: true, clickId });
}

export async function affiliateAdminAction(user: SessionUserLite, body: Row) {
  const client = await sb();
  const action = String(body.action ?? "");

  if (action === "report-conversion") {
    const offerId = String(body.offerId ?? "");
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (!idempotencyKey) throw new ActionError(400, "Idempotency anahtarı zorunlu (tekrarlanan raporlar çoğaltılmaz).");
    const { data: existing } = await client
      .from("affiliate_conversions")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .limit(1);
    if (existing?.length) return Response.json({ ok: true, duplicate: true, conversion: existing[0] });

    const commission = body.commissionCents == null ? null : Math.max(0, Math.round(Number(body.commissionCents)));
    const { data: row, error } = await client
      .from("affiliate_conversions")
      .insert({
        offer_id: offerId || null,
        click_id: body.clickId ? String(body.clickId) : null,
        network_id: body.networkId ? String(body.networkId) : null,
        status: "REPORTED",
        commission_cents: commission,
        currency: ["TRY", "USD", "GEL", "EUR"].includes(String(body.currency)) ? String(body.currency) : "TRY",
        source: body.source === "MANUAL_ENTRY" ? "MANUAL_ENTRY" : "NETWORK_REPORT",
        network_reference: body.networkReference ? String(body.networkReference).slice(0, 120) : null,
        idempotency_key: idempotencyKey,
        reported_at: new Date().toISOString(),
        note: body.note ? String(body.note).slice(0, 400) : null,
      })
      .select("*")
      .maybeSingle();
    if (error || !row) fail(error);
    await trackEvent("conversion_reported", { userId: null, meta: { offerId, source: row.source } });
    await logAudit(user.email, "ADMIN", "AFFILIATE_CONVERSION_REPORTED", "affiliate_conversions", row.id, {
      source: row.source,
      commissionCents: row.commission_cents,
    });
    return Response.json({ ok: true, conversion: cam(row as Row) });
  }

  if (action === "conversion-status") {
    const status = String(body.status ?? "");
    if (!["PENDING", "APPROVED", "REJECTED", "REVERSED", "PAID"].includes(status))
      throw new ActionError(400, "Geçersiz komisyon durumu.");
    const patch: Row = {
      status,
      decided_at: status === "PENDING" ? null : new Date().toISOString(),
      paid_at: status === "PAID" ? new Date().toISOString() : null,
    };
    if (body.note) patch.note = String(body.note).slice(0, 400);
    const { data: row, error } = await client
      .from("affiliate_conversions")
      .update(patch)
      .eq("id", String(body.id ?? ""))
      .select("*")
      .maybeSingle();
    if (error) fail(error);
    if (!row) throw new ActionError(404, "Komisyon kaydı bulunamadı.");
    await trackEvent("commission_status_changed", { meta: { id: row.id, status } });
    await logAudit(user.email, "ADMIN", `COMMISSION_${status}`, "affiliate_conversions", str(row.id), {});
    return Response.json({ ok: true, conversion: cam(row as Row) });
  }

  if (action === "network-status") {
    const status = String(body.status ?? "");
    if (!["NOT_CONNECTED", "PENDING_CREDENTIALS", "CONNECTED", "SUSPENDED"].includes(status))
      throw new ActionError(400, "Geçersiz ağ durumu.");
    const patch: Row = { status };
    if (body.notes) patch.notes = String(body.notes).slice(0, 500);
    if (status === "CONNECTED") patch.last_sync_at = new Date().toISOString();
    const { data: row, error } = await client
      .from("affiliate_networks")
      .update(patch)
      .eq("id", String(body.id ?? ""))
      .select("*")
      .maybeSingle();
    if (error) fail(error);
    if (!row) throw new ActionError(404, "Ağ bulunamadı.");
    await logAudit(user.email, "ADMIN", `AFFILIATE_NETWORK_${status}`, "affiliate_networks", str(row.id), {});
    return Response.json({ ok: true, network: cam(row as Row) });
  }

  if (action === "offer-status") {
    const status = String(body.status ?? "");
    if (!["ACTIVE", "PAUSED", "EXPIRED"].includes(status)) throw new ActionError(400, "Geçersiz durum.");
    const { data: row, error } = await client
      .from("affiliate_offers")
      .update({ status, last_updated: new Date().toISOString() })
      .eq("id", String(body.id ?? ""))
      .select("*")
      .maybeSingle();
    if (error) fail(error);
    if (!row) throw new ActionError(404, "Fırsat bulunamadı.");
    await logAudit(user.email, "ADMIN", `AFFILIATE_OFFER_${status}`, "affiliate_offers", row.id, {});
    return Response.json({ ok: true, offer: cam(row as Row) });
  }

  throw new ActionError(400, "Bilinmeyen işlem.");
}

export async function affiliateActiveCount() {
  const client = await sb();
  const { count } = await client
    .from("affiliate_offers")
    .select("id", { count: "exact", head: true })
    .eq("status", "ACTIVE");
  return Response.json({ ok: true, count: count ?? 0 });
}

/* ================================================================== *
 * AI (/api/ai) — içerik üretimi taslak olarak kalır; yayın onayı ayrıdır
 * ================================================================== */

export async function aiInsertContent(actor: BusinessActorLite, values: Row) {
  const client = await sb();
  const { data, error } = await client
    .from("ai_contents")
    .insert({ ...values, business_id: actor.businessId })
    .select("*")
    .maybeSingle();
  if (error || !data) fail(error);
  return cam(data as Row) as Row;
}

export async function aiDeletePlan(actor: BusinessActorLite) {
  const client = await sb();
  const { data: existing } = await client.from("marketing_plans").select("id").eq("business_id", actor.businessId);
  for (const p of existing ?? []) {
    await client.from("marketing_plan_days").delete().eq("plan_id", str(p.id));
    await client.from("marketing_plans").delete().eq("id", str(p.id));
  }
}

export async function aiInsertPlan(actor: BusinessActorLite, values: Row, days: Row[]) {
  const client = await sb();
  const { data: plan, error } = await client
    .from("marketing_plans")
    .insert({ ...values, business_id: actor.businessId })
    .select("*")
    .maybeSingle();
  if (error || !plan) fail(error);
  if (days.length) {
    const { error: daysError } = await client
      .from("marketing_plan_days")
      .insert(days.map((d) => ({ ...d, plan_id: str(plan.id) })));
    if (daysError) fail(daysError);
  }
  return cam(plan as Row) as Row;
}

/** AI ayar anahtarları (RLS: yalnızca yönetici görür; diğerleri boş liste alır). */
export async function aiSettingsOverview() {
  const client = await sb();
  const { data, error } = await client.from("ai_settings").select("*");
  const rows = error ? [] : ((data ?? []) as Row[]);
  return Response.json({
    ok: true,
    provider: "local-template-engine",
    model: "dampingvar-marketing-v1",
    socialPublishing: "NOT_CONNECTED",
    videoGeneration: "NOT_CONNECTED",
    note: "Sağlayıcı anahtarları yalnızca sunucu tarafında okunur; tarayıcıya gönderilmez.",
    settings: rows.map((s) => ({ key: s.key, description: s.description })),
  });
}

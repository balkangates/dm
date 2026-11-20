-- =============================================================================
-- SİPARİŞ BAKİYESİ ÖDEME BİLDİRİMİ (21.11.2026)
-- İşletme sipariş bakiyesi eklediğinde (dv_topup_order_credits):
--   * işletme sahibi/yöneticilerine "ödeme bildirimi" (adet, tutar, faturaya yansıyacağı),
--   * yöneticilere "ödeme bekleniyor" bildirimi
-- gider. Bakiye artışı ve deftere yazma davranışı DEĞİŞMEZ. Tekrar çalıştırılabilir.
-- =============================================================================
create or replace function public.dv_topup_order_credits(p_business_id uuid, p_qty integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_pkg public.packages%rowtype;
  v_amount integer;
  v_balance integer;
  v_name text;
  v_tl text;
begin
  if auth.uid() is null or not public.is_business_staff(p_business_id, array['owner','OWNER']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(plan_code, 'FREE'), name into v_plan, v_name from public.businesses where id = p_business_id for update;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
  select * into v_pkg from public.packages where code = v_plan;
  if not found then select * into v_pkg from public.packages where code = 'FREE'; end if;

  if v_pkg.order_quota_monthly is null or v_pkg.order_unit_price_cents is null then
    raise exception 'Bu paket için sipariş bakiyesi tanımlı değil.';
  end if;
  if p_qty is null or p_qty < v_pkg.order_topup_min_qty or p_qty % v_pkg.order_topup_min_qty <> 0 then
    raise exception 'Adet en az % ve katları (% , % ...) olmalıdır.', v_pkg.order_topup_min_qty,
      v_pkg.order_topup_min_qty * 2, v_pkg.order_topup_min_qty * 3;
  end if;
  if p_qty > 1000000 then raise exception 'Adet çok büyük.'; end if;

  v_amount := p_qty * v_pkg.order_unit_price_cents;
  update public.businesses set order_credit_balance = order_credit_balance + p_qty
    where id = p_business_id returning order_credit_balance into v_balance;
  insert into public.order_credit_ledger
    (business_id, kind, qty, period, package_code, unit_price_cents, amount_cents, billed, created_by)
  values
    (p_business_id, 'TOPUP', p_qty, to_char(now() at time zone 'UTC', 'YYYY-MM'), v_pkg.code,
     v_pkg.order_unit_price_cents, v_amount, false, auth.uid());

  -- Ödeme bildirimi (başarısızlık bakiye işlemini bozmaz).
  begin
    v_tl := to_char(v_amount / 100.0, 'FM999G999G990D00') || ' TL';
    insert into public.notifications (user_id, kind, title, body, link)
    select s.user_id, 'SYSTEM', 'Ödeme bildirimi: sipariş bakiyesi eklendi',
           p_qty || ' sipariş bakiyesi eklendi. Tutar ' || v_tl || ' (birim ' ||
           to_char(v_pkg.order_unit_price_cents / 100.0, 'FM990D00') || ' TL); hizmet bedeli olarak faturanıza yansıyacaktır.',
           '/panel?s=plans'
      from public.business_staff s
     where s.business_id = p_business_id and s.active and s.user_id is not null
       and lower(s.role) in ('owner','manager');
    insert into public.notifications (user_id, kind, title, body, link)
    select p.id, 'SYSTEM', 'Ödeme bekleniyor: sipariş bakiyesi',
           v_name || ' ' || p_qty || ' sipariş bakiyesi ekledi — ' || v_tl || ' tahsil edilecek.',
           '/admin?s=businesses'
      from public.profiles p where p.role = 'admin';
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true, 'added', p_qty, 'amountCents', v_amount,
                            'unitPriceCents', v_pkg.order_unit_price_cents, 'balance', v_balance);
end;
$$;
grant execute on function public.dv_topup_order_credits(uuid, integer) to authenticated, service_role;

-- =============================================================================
-- PAKET DEĞİŞTİRME + PAKET TALEBİ (18.11.2026)
--  1) SORUN: Admin panelinde paket (ve doğrulama) değişmiyordu. businesses tablosunda
--     yalnızca işletme ÜYESİ güncelleyebiliyordu (RLS); admin 0 satır güncelliyor,
--     hata dönmüyordu. -> businesses_update_admin politikası eklendi.
--  2) Paket talebi: işletme paket seçince talep admin'e düşer (plan_requests);
--     admin onaylayınca paket değişir, işletmeye bildirim gider.
-- Tekrar çalıştırılabilir (idempotent).
-- =============================================================================
drop policy if exists businesses_update_admin on public.businesses;
create policy businesses_update_admin on public.businesses for update
  using (public.is_admin()) with check (public.is_admin());

create table if not exists public.plan_requests (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  requested_by  uuid references public.profiles(id),
  current_plan  text not null,
  requested_plan text not null,
  note          text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references public.profiles(id)
);
create unique index if not exists plan_requests_one_pending on public.plan_requests (business_id) where status = 'pending';
alter table public.plan_requests enable row level security;

drop policy if exists plan_requests_admin on public.plan_requests;
create policy plan_requests_admin on public.plan_requests for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists plan_requests_member_select on public.plan_requests;
create policy plan_requests_member_select on public.plan_requests for select using (public.is_business_member(business_id));
grant select on public.plan_requests to authenticated;
grant insert, update on public.plan_requests to authenticated;

-- İşletme sahibi/yöneticisi paket talebi oluşturur; adminlere bildirim gider.
create or replace function public.dv_plan_request(p_plan text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_biz uuid; v_name text; v_cur text; v_id uuid;
begin
  select s.business_id into v_biz from business_staff s
   where s.user_id = auth.uid() and s.active and s.role in ('owner','manager') limit 1;
  if v_biz is null then raise exception 'Paket talebi için işletme sahibi veya yöneticisi olmalısın.'; end if;
  if not exists (select 1 from packages where code = p_plan and coalesce(active, true)) then raise exception 'Geçersiz paket.'; end if;
  select name, coalesce(plan_code,'FREE') into v_name, v_cur from businesses where id = v_biz;
  if v_cur = p_plan then raise exception 'Zaten bu paketi kullanıyorsun.'; end if;
  if exists (select 1 from plan_requests where business_id = v_biz and status = 'pending') then
    raise exception 'Bekleyen bir paket talebin var; yönetici onayını bekle.';
  end if;
  insert into plan_requests (business_id, requested_by, current_plan, requested_plan, note)
  values (v_biz, auth.uid(), v_cur, p_plan, nullif(left(coalesce(p_note,''), 300), '')) returning id into v_id;
  insert into notifications (user_id, kind, title, body, link)
  select p.id, 'SYSTEM', 'Paket talebi', v_name || ': ' || v_cur || ' → ' || p_plan, '/admin?s=businesses'
    from profiles p where p.role = 'admin';
  return jsonb_build_object('id', v_id, 'business', v_name, 'from', v_cur, 'to', p_plan);
end $$;
revoke execute on function public.dv_plan_request(text, text) from public, anon;
grant execute on function public.dv_plan_request(text, text) to authenticated;

-- Admin talebi onaylar/reddeder; onayda paket değişir; işletme personeline bildirim gider.
create or replace function public.dv_plan_request_decide(p_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r plan_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Yalnızca yönetici.'; end if;
  select * into r from plan_requests where id = p_id and status = 'pending' for update;
  if not found then raise exception 'Bekleyen talep bulunamadı.'; end if;
  update plan_requests set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now(), decided_by = auth.uid() where id = p_id;
  if p_approve then update businesses set plan_code = r.requested_plan where id = r.business_id; end if;
  insert into notifications (user_id, kind, title, body, link)
  select s.user_id, 'SYSTEM',
         case when p_approve then 'Paket talebin onaylandı' else 'Paket talebin reddedildi' end,
         r.current_plan || ' → ' || r.requested_plan, '/panel?s=plans'
    from business_staff s where s.business_id = r.business_id and s.user_id is not null and s.active;
  return jsonb_build_object('approved', p_approve, 'plan', r.requested_plan, 'businessId', r.business_id);
end $$;
revoke execute on function public.dv_plan_request_decide(uuid, boolean) from public, anon;
grant execute on function public.dv_plan_request_decide(uuid, boolean) to authenticated;

-- ============================================================
-- FAZ 10 · profiles_guard düzeltmesi + admin rol ataması
--
-- SORUN 1 (yaşanan): SQL Editor'den rol değişikliği
--   "Rol değişikliği yalnızca platform yöneticisi tarafından yapılabilir."
--   → profiles_guard yalnızca is_admin() (JWT auth.uid()) kontrol
--     ediyordu; SQL Editor'de JWT olmadığından her şey engelleniyordu
--     (kendi admin ataman bile).
--
-- SORUN 2 (önleyici): dv_business_signup RPC'si profiles.role
--   güncellerken AYNI trigger'a takılacaktı (FAZ 10 signup'ı
--   tamamen rollback olurdu).
--
-- ÇÖZÜM: guard artık dört yasal yolu tanır —
--   a) is_admin()                        → uygulama/PostgREST JWT'si (admin)
--   b) session_user = 'postgres'         → SQL Editor / psql / migration
--      (tablö sahibi; zaten tam yetkiye sahip)
--   c) dv.trusted_update = 'on' (GUC)    → yalnızca security definer
--      fonksiyonlarımızın set_config ile işaretlediği güvenilir
--      güncelleme (PostgREST istemcisi bu GUC'ı SET edemez;
--      istemci header'ları 'request.' önekinde kalır)
--   d) JWT rolü = 'service_role'         → sunucu (gizli anahtar) yolu
--
-- DEĞİŞMEYEN: authenticated/anon istemcinin kendi satırında
--   rol/davet/e-posta değiştirme DENEMESİ hâlâ engelli.
-- ============================================================

create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '');
  v_ok boolean := public.is_admin()
    or session_user = 'postgres'
    or v_jwt_role = 'service_role'
    or coalesce(current_setting('dv.trusted_update', true), 'off') = 'on';
begin
  if new.id is distinct from old.id then
    raise exception 'Profil kimliği değiştirilemez.';
  end if;
  if new.role is distinct from old.role and not v_ok then
    raise exception 'Rol değişikliği yalnızca platform yöneticisi tarafından yapılabilir.';
  end if;
  if new.referral_code is distinct from old.referral_code and not v_ok then
    raise exception 'Davet kodu değiştirilemez.';
  end if;
  if new.referred_by is distinct from old.referred_by and not v_ok then
    raise exception 'Davet ilişkisi değiştirilemez.';
  end if;
  if new.email is distinct from old.email and not v_ok then
    raise exception 'E-posta adresi bu uygulamadan değiştirilemez.';
  end if;
  return new;
end;
$$;

-- ---------- (2) Admin ataması (idempotent) ----------
do $$
declare
  v_id    uuid := 'b664e98b-fad4-41ea-bf50-f9822363ecc3';
  v_email text;
  v_name  text;
  v_role  text;
begin
  select email, name, role into v_email, v_name, v_role
  from public.profiles where id = v_id;

  if not found then
    raise exception 'PROFIL BULUNAMADİ (id: %) — idyi kontrol et.', v_id;
  end if;

  if v_role = 'admin' then
    raise notice 'ZATEN ADMIN: % (%)', v_email, v_name;
  else
    update public.profiles set role = 'admin' where id = v_id;
    raise notice 'GÜNCELLENDİ: % (%)  % → admin', v_email, v_name, v_role;
  end if;
end $$;

-- ---------- (3) Doğrulama (1 satır, role = admin) ----------
select id, email, name, role
from public.profiles
where id = 'b664e98b-fad4-41ea-bf50-f9822363ecc3';

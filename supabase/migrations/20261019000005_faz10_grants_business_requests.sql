-- ============================================================
-- FAZ 10 · GRANT düzeltmesi — business_requests okuma yetkisi
--
-- SORUN (canlıda 42501 ile doğrulandı):
--   20261018000001 satır318 → "grant select, insert, update, delete
--   on all tables in schema public to anon, authenticated" — bu grant
--   O ANKİ tabloları kapsıyordu. business_requests 0004 ile SONRA
--   yaratıldı → authenticated rolu için GRANT yok →
--   PostgREST: "permission denied for table business_requests".
--   Etki: admin panelde bekleyen talepler boş görünüyordu; müşterinin
--   bekleyen talep durumu da görünmüyordu. (dv_* RPC'leri security
--   definer olduğu için YAZMA sorunsuzdu — kırık olan yalnızca OKUMA.)
--
-- ÇÖZÜM:
--   1) business_requests için gereken GRANT (PostgREST hint'i ile aynı)
--   2) Gelecekte yaratılacak tablolar için ALTER DEFAULT PRIVILEGES
--      (aynı boşluk bir daha yaşanmasın)
-- ============================================================

grant select on public.business_requests to authenticated;

-- Gelecekte bu şemada yaratılacak tablolar otomatik açılsın
-- (SQL Editor postgres rolüyle çalışır; default privilege postgres'e tanımlanır)
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

-- ---------- DOĞRULAMA (authenticated ile test) ----------
-- set role authenticated; -- (aşağıdaki select'i JWT'siz denemek için gerekmez)
select grantee, privilege_type, table_name
from information_schema.table_privileges
where table_schema = 'public' and table_name = 'business_requests'
order by grantee, privilege_type;

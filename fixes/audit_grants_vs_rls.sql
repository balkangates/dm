-- =====================================================================
-- fixes/audit_grants_vs_rls.sql
-- ─────────────────────────────────────────────────────────────────────
-- AMAÇ: fix_invoice_delivery_note_rls.sql'de bulunan hata sınıfını
-- ("RLS açık/kapalı olması fark etmez — GRANT olmadan PostgREST tabloyu
-- hiç göremez") TÜM public şemada tekrar taramak.
--
-- Bu dosya SADECE TEŞHİS'tir — hiçbir şeyi değiştirmez (GRANT/RLS
-- eklemez). Supabase SQL Editor'e yapıştırıp çalıştırın; çıktı,
-- "authenticated" rolü için her tabloyu RLS + GRANT durumuna göre
-- sınıflandırır.
--
-- RİSK SINIFLARI:
--   'RLS AÇIK + SELECT GRANT YOK'  → İşlevsel bug: PostgREST 42501/boş
--                                     sonuç döner, veri sızıntısı yok
--                                     ama uygulama kırık görünür.
--   'RLS KAPALI + SELECT GRANT VAR' → GÜVENLİK RİSKİ: authenticated
--                                      HER kullanıcı TÜM satırları
--                                      okuyabilir (fix_invoice_...'daki
--                                      orijinal durumun ta kendisi).
--   'RLS KAPALI + SELECT GRANT YOK' → İşlevsel bug (fix_invoice_...'daki
--                                      GÜNCEL/asıl durum) — kimse
--                                      okuyamıyor ama en azından
--                                      sızıntı yok.
--   'RLS AÇIK + SELECT GRANT VAR + POLICY YOK' → GÜVENLİK RİSKİ:
--                                      RLS açık ama hiç SELECT policy'si
--                                      yoksa varsayılan davranış "hiç
--                                      satır dönme"dür (bu durumda aynı
--                                      "RLS AÇIK + GRANT YOK" gibi kırık
--                                      görünür — ayrı satırda raporlanır).
-- =====================================================================

WITH base AS (
  SELECT
    c.relname                                   AS table_name,
    c.relrowsecurity                             AS rls_enabled,
    c.relforcerowsecurity                        AS rls_forced,
    EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname
        AND p.cmd IN ('SELECT', 'ALL')
    )                                             AS has_select_policy
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'   -- yalnızca gerçek tablolar (view'lar hariç)
),
grants AS (
  SELECT
    table_name,
    bool_or(privilege_type = 'SELECT') AS grant_select,
    bool_or(privilege_type = 'INSERT') AS grant_insert,
    bool_or(privilege_type = 'UPDATE') AS grant_update,
    bool_or(privilege_type = 'DELETE') AS grant_delete
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee = 'authenticated'
  GROUP BY table_name
)
SELECT
  b.table_name,
  b.rls_enabled,
  COALESCE(g.grant_select, false) AS authenticated_select_grant,
  COALESCE(g.grant_insert, false) AS authenticated_insert_grant,
  COALESCE(g.grant_update, false) AS authenticated_update_grant,
  COALESCE(g.grant_delete, false) AS authenticated_delete_grant,
  b.has_select_policy,
  CASE
    WHEN b.rls_enabled AND NOT COALESCE(g.grant_select, false)
      THEN 'RLS AÇIK + SELECT GRANT YOK  (islevsel bug)'
    WHEN NOT b.rls_enabled AND COALESCE(g.grant_select, false)
      THEN 'RLS KAPALI + SELECT GRANT VAR  (GUVENLIK RISKI — herkes okur)'
    WHEN NOT b.rls_enabled AND NOT COALESCE(g.grant_select, false)
      THEN 'RLS KAPALI + SELECT GRANT YOK  (islevsel bug, sizinti yok)'
    WHEN b.rls_enabled AND COALESCE(g.grant_select, false) AND NOT b.has_select_policy
      THEN 'RLS ACIK + GRANT VAR + POLICY YOK  (islevsel bug — hic satir donmez)'
    ELSE 'OK'
  END AS risk_flag
FROM base b
LEFT JOIN grants g ON g.table_name = b.table_name
WHERE
  -- Sadece riskli/dikkat gerektiren satırları göster; 'OK' olanları gizle.
  (b.rls_enabled AND NOT COALESCE(g.grant_select, false))
  OR (NOT b.rls_enabled AND COALESCE(g.grant_select, false))
  OR (NOT b.rls_enabled AND NOT COALESCE(g.grant_select, false))
  OR (b.rls_enabled AND COALESCE(g.grant_select, false) AND NOT b.has_select_policy)
ORDER BY
  CASE
    WHEN NOT b.rls_enabled AND COALESCE(g.grant_select, false) THEN 0  -- güvenlik riski en üstte
    ELSE 1
  END,
  b.table_name;

-- =====================================================================
-- KOD TABANI TARAMASI (statik analiz — 2026-08-19 itibarıyla, bu SQL
-- dosyasıyla birlikte hazırlandı; canlı DB sorgusu değildir, repo
-- taramasıdır). Yukarıdaki sorgunun çıktısında görünen HER tabloyu
-- aşağıdaki listeyle çapraz kontrol edin: aktif Next.js kod tabanından
-- (app/, lib/, components/) DOĞRUDAN (RPC olmadan) okunuyor mu?
--
-- Tarama yöntemi: hem `.from('tablo')` hem `.select('..., iliski(...)')`
-- (PostgREST embedded/nested select) kalıpları arandı — ikisi de aynı
-- GRANT gereksinimini taşır ve ilk turda embedded select gözden kaçmıştı
-- (store_order_invoices/delivery_notes tam olarak bu şekilde okunuyordu).
--
-- AKTİF KOD TABANINDAN (app/lib/components) DOĞRUDAN OKUNAN TABLOLAR:
--   .from(...) ile:
--     active_users, call_requests, catalog_products, categories,
--     dealer_earnings, demands, messages, negotiation_offers,
--     order_status_events, product_suggestions, product_variants,
--     product_videos, profiles, reverse_auctions, sectors, shipments,
--     store_category_status, store_comments, store_follows,
--     store_likes, store_order_items, store_order_shipments,
--     store_orders, store_products, stores, subcategories,
--     supplier_bids, supplier_order_shortfalls,
--     v_admin_finance_summary (view), v_store_product_purchase_counts (view)
--
--   Embedded/nested .select('..., iliski(...)') ile (AYRICA GRANT ister,
--   .from() taramasında GÖRÜNMEZ — bu yüzden ayrı listelendi):
--     delivery_notes        (app/dealer/orders/page.tsx, lib/dealer.ts,
--                             lib/dampingvar.ts)
--     store_order_invoices  (app/dealer/orders/page.tsx, lib/dealer.ts,
--                             lib/dampingvar.ts)
--     escrow_transactions   (app/dealer/orders/page.tsx, lib/dealer.ts,
--                             lib/dampingvar.ts) ⚠️ FİNANSAL VERİ —
--                             audit sorgusunda 'RLS KAPALI + GRANT VAR'
--                             ya da 'GRANT YOK' çıkarsa delivery_notes/
--                             store_order_invoices ile AYNI ÖNCELİKTE
--                             ele alınmalı.
--
-- LEGACY KOD TABANINDAN (public/modules/, modules/ — eski vanilla-JS
-- dashboard.html, hâlâ /admin ve /supplier için kullanılıyor) DOĞRUDAN
-- OKUNAN TABLOLAR (bu liste app/lib/components ile ÇAKIŞMAYAN kısmı,
-- yani SADECE eski panelden erişilen ve Next.js tarafında henüz
-- karşılığı olmayan tablolar):
--     dealer_monthly_performance, seller_stats
--   (Bu iki tablo şu an SADECE /admin veya /supplier'ın eski
--   dashboard.html sürümünden okunuyor — Faz 4'te bu paneller Next.js'e
--   taşınırken CHECKLIST_NEW_TABLE.md'ye göre yeniden doğrulanmalı.)
--
-- NASIL KULLANILIR: Yukarıdaki SQL sorgusunun sonucunda çıkan her
-- table_name'i bu iki listeyle eşleştirin:
--   - Listede VARSA ve risk_flag 'islevsel bug' ise → kullanıcılar şu an
--     gerçekten hatayla karşılaşıyor demektir, ACİL.
--   - Listede VARSA ve risk_flag 'GUVENLIK RISKI' ise → aktif olarak
--     sızdırılıyor demektir, EN ACİL (özellikle escrow_transactions,
--     store_order_invoices, delivery_notes, messages, negotiation_offers
--     gibi finansal/kişisel veri içeren tablolar için).
--   - Listede YOKSA ama risk_flag var → şu an client'tan hiç
--     çağrılmıyor (örn. yalnızca RPC/trigger üzerinden erişiliyor
--     olabilir) — yine de düzeltilmeli ama kullanıcı şu an bir hata
--     GÖRMÜYOR olabilir; önceliklendirmede bunu belirtin.
-- =====================================================================

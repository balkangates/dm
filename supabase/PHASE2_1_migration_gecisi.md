# Faz 2.1 — Supabase CLI Migration Sistemine Geçiş

## Neden "19 dosyayı tahmini sırayla çevir" yerine `db pull`?

Orijinal Prompt 2.1, `fixes/*.sql` dosyalarını tahmini kronolojik sırayla `supabase/migrations/` altına taşımayı öneriyordu. Faz 1.1'de bunun **güvenilmez olduğunu kanıtladık**: canlı DB'de, hiçbir `fixes/*.sql` dosyasında olmayan değişiklikler var (kayıp "v4", dosyasız `customer_id IS NULL` filtresi, kaynağı bilinmeyen 8 policy — bkz. `PHASE1_1_SONUC_gercek_durum.md`). Yani dosyaların toplamı ≠ gerçek şema. Bunları körlemesine timestamp'leyip "migration geçmişi" diye sunmak, olmayan bir kesinlik iddia eder ve olası sıralama hatalarında (henüz var olmayan bir tabloya referans veren erken bir dosya gibi) migration zincirini baştan kırar.

**Doğru ve standart yöntem:** Supabase CLI'ın `db pull` komutuyla canlı DB'nin **gerçek, güncel şemasını** tek bir "baseline" migration olarak içe aktarmak. Bundan sonraki HER değişiklik `supabase migration new` ile, gerçek zamanlı ve doğru sırada eklenir. `fixes/*.sql` dosyaları silinmez ama artık "tarihsel arşiv" statüsüne geçer — aktif kaynak değildir.

---

## Adımlar

### 1) Supabase CLI kurulumu (proje içine, global değil)

```bash
npm install --save-dev supabase
npx supabase --version
```

### 2) Projeyi bağla

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
# PROJECT_REF: Supabase Dashboard > Project Settings > General > Reference ID
```

### 3) Baseline'ı canlı DB'den çek (asıl kritik adım)

```bash
mkdir -p supabase/migrations
npx supabase db pull
```

Bu komut, mevcut canlı şemanın **tamamını** (tablolar, RLS policy'leri, fonksiyonlar, kısıtlar, publication üyelikleri — Faz 0-1'de yaptığımız TÜM düzeltmeler dahil, çünkü onlar zaten canlıda uygulandı) tek bir `supabase/migrations/<timestamp>_remote_schema.sql` dosyasına yazar. Bu dosya artık sizin **gerçek, doğrulanmış baseline'ınız**dır — tahmine dayalı değil.

> Faz 0 ve Faz 1.2'deki SQL dosyalarını (`fix_invoice_delivery_note_rls_v2.sql`, `URGENT_reenable_rls...sql`, `fix_live_chat_consolidated_final.sql`) henüz canlıya UYGULAMADIYSANIZ, önce onları uygulayın, SONRA `db pull` çalıştırın — baseline'ın en güncel ve doğru hali bu sırayla elde edilir.

### 4) `fixes/` klasörünü arşiv statüsüne al

```bash
cat > fixes/README.md << 'EOF'
# ⚠️ Bu klasör artık AKTİF KAYNAK DEĞİL

2026-08-19 itibarıyla şema değişiklikleri `supabase/migrations/` altında
Supabase CLI ile yönetiliyor. Buradaki dosyalar sadece TARİHSEL REFERANS
için tutuluyor — DB'nin şu anki gerçek hâlini YANSITMAYABİLİRLER (bkz.
PHASE1_1_SONUC_gercek_durum.md'deki "dosyasız değişiklik" bulguları).

Yeni bir şema değişikliği mi gerekiyor? `supabase migration new <isim>`
kullanın, bu klasöre yeni dosya EKLEMEYİN.
EOF
```

### 5) `package.json` script'leri

```json
{
  "scripts": {
    "db:new": "supabase migration new",
    "db:diff": "supabase db diff --schema public",
    "db:push": "supabase db push",
    "db:pull": "supabase db pull",
    "db:reset": "supabase db reset"
  }
}
```

Kullanım:
- **Yeni bir tablo/policy/fonksiyon eklerken:** `npm run db:new -- add_something` → boş dosya açılır, `CHECKLIST_NEW_TABLE.md`'ye göre doldurulur → `npm run db:push` ile canlıya uygulanır.
- **Dashboard'dan elle bir değişiklik yapıldıysa** (yapılmamalı ama olursa): `npm run db:diff -- -f <isim>` ile fark otomatik migration dosyasına yazılır — Faz 1.1'deki gibi "dosyasız değişiklik" bir daha birikmez.

### 6) Doğrulama

```bash
npx supabase db push --dry-run
```

Hiçbir fark çıkmamalı (baseline zaten canlıyla birebir eşleşiyor olmalı). Fark çıkarsa, `db pull`'u yeniden çalıştırıp baseline'ı güncelleyin.

---

## Sonuç

- `supabase/migrations/<timestamp>_remote_schema.sql` → **tek gerçek kaynak**, `db pull` ile üretildi, tahmine dayanmıyor.
- `fixes/*.sql` → arşiv, `fixes/README.md` ile işaretlendi.
- Yeni değişiklikler artık `supabase migration new` ile, otomatik doğru sırada, timestamp'li ekleniyor.

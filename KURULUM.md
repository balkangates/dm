# Affiliate — Gerçek Mod (kurulum)

Bu paket, proje köküne (dm-main/) **üzerine yazılacak** şekilde dizilmiştir.

## 1) Sıra
1. Dosyaları proje köküne kopyalayın (aynı yollar üzerine yazar).
2. Supabase → SQL Editor'de `supabase/migrations/20261110000002_affiliate_real_mode.sql` dosyasını çalıştırın
   (tekrar çalıştırılabilir; yeni kolonlar, `affiliate_network_secrets`, `dv_offer_impressions`,
   `dv_affiliate_postback` RPC'leri ve `affiliate-media` bucket'ı).
3. (İsteğe bağlı) `supabase/optional/affiliate_demo_temizle.sql` ile eski demo kayıtlarını vitrinden kaldırın.
4. `npm run typecheck && npm run lint && npx tsx scripts/affiliate-selftest.ts`

## 2) Kullanım
- Admin → **Affiliate Ağ Durumu** → *Yeni ağ / marka*: iadeal benzeri platform veya doğrudan marka ekleyin.
  Durumu `CONNECTED` yapın, **Postback adresi** ile token üretip ağın paneline girin.
- Admin → **Affiliate Fırsatları** → *Yeni affiliate fırsatı*: görsel, video, satıcı, marka, kategori, ağ,
  hedef URL, referral/izleme bağlantısı ve komisyon koşullarını girin. Kayıt anında anasayfada ve
  **Online Fırsatlar** menüsünde (kategori → marka) görünür.
- Referral bağlantısı şablonu: `https://ag.com/c/123?subid={click_id}&u={url}`
  Yer tutucular: `{click_id}` `{user_id}` `{offer_id}` `{url}`. `{click_id}` yoksa ağın/fırsatın parametre adıyla eklenir.
- Dönüşüm: ağ postback'i `GET /api/affiliate/postback?token=…&click_id=…&ref=…&status=…&commission=…&currency=…`
  veya Admin → Komisyon Raporları → *Manuel komisyon kaydı*. Kayıt `REPORTED` başlar; gelir sayılması için
  admin `APPROVED` yapmalıdır.

# Faz 1.1 — Canlı Sohbet Fix Zinciri: Kronoloji + Teşhis

## ⚠️ Önce önemli bir kısıtlama

Bu ortamda Supabase projenize **canlı bağlantım yok** — sadece repodaki dosyaları okuyabiliyorum. Bu yüzden "Supabase'te ŞU AN gerçekte hangi policy/fonksiyon aktif" sorusunu **ben çalıştırıp raporlayamam**; bunun yerine aşağıda hazırladığım teşhis SQL'ini **siz Supabase SQL Editor'de çalıştırıp çıktısını buraya yapıştırmalısınız** — ben onu okuyup Bölüm 3'teki yorumu yaparım. Varsayımla "muhtemelen şu haldedir" demek, tam olarak bu projenin 7 fix'lik döngüsüne yol açan hatanın kendisi olurdu; onu tekrarlamıyorum.

Aşağıdaki kronoloji tablosu ise **dosyaları okuyarak** (her dosyanın kendi içinde hangi öncekine atıf yaptığı, neyi "süperseded" ettiğini söylediği) çıkarıldı — dosya zaman damgaları hepsi aynı (zip çıkarma anı), bu yüzden sıralama **içerik referanslarına** dayanıyor.

---

## 1) Kronoloji Tablosu

İki ayrı ama iç içe geçmiş problem ipliği var — ayrı sütunda işaretledim:

- **[A] Görünürlük (RLS SELECT)**: karşı taraf mesajı neden okuyamıyor
- **[B] RPC/conversation_id bütünlüğü**: neden bazen var-olmayan bir conversation_id dönüyor (FK ihlali)

| # | Dosya | İplik | Ne yaptı | Hangi önceki dosyayı geçersiz kıldı / neden |
|---|---|---|---|---|
| 1 | `fix_store_live_chat.sql` | B (temel) | `get_or_create_store_live_conversation()` RPC'sini ilk kez tanımladı (bul/oluştur, sahibi participant ekle) | — (zincirin başlangıcı) |
| 2 | `fix_live_chat_cross_visibility.sql` | A | `messages` SELECT policy'si ekledi, koşul: `conversations.group_category = 'live_auction'` | — (ilk deneme) |
| 3 | `fix_live_chat_cross_visibility_v2.sql` | A | Aynı policy'yi **doğru koşulla** (`store_id IS NOT NULL`) yeniden yazdı | **#2'yi geçersiz kıldı** — dosyanın kendi ifadesiyle: `group_category` alanına RPC hiç değer yazmadığı için #2'deki koşul **hiçbir zaman eşleşmedi**, sessizce hiçbir şey açmadı |
| 4 | `fix_live_chat_participants_v3.sql` | A + B | `messages` RLS'i #3'teki koşulla korudu; **ayrıca** `conversation_participants` RLS'i ekledi; RPC'yi katılımcıyı da atomik ekleyecek şekilde yeniden yazdı (BEGIN...EXCEPTION içinde) | #3'ü geçersiz kılmadı (aynı koşulu korudu), **#1'in RPC'sini genişletti** |
| 5 | `fix_live_chat_conversation_rollback.sql` | B | RPC'yi tekrar yazdı: katılımcı-ekleme adımını **iç içe (nested) ayrı bir EXCEPTION bloğuna** aldı | **#4'ün RPC'sindeki bug'ı düzeltti** — PL/pgSQL'de dıştaki EXCEPTION bloğu örtük SAVEPOINT açtığı için, katılımcı eklemede hata olursa conversation INSERT'i de rollback oluyordu; dönen id DB'de hiç yoktu → `messages` INSERT'inde FK ihlali (23503) |
| 6 | `fix_live_chat_final.sql` | A (+B'ye referans) | `messages`, `conversations`, `conversation_participants` için TÜM RLS'i tek dosyada, kesin hale getirdi | **#2, #3, #4'ü açıkça "birbirini geçersiz kılan 3 önceki deneme" olarak adlandırıp konsolide etti**; #5'in bulgusuna da atıf yaptı |
| 7 | `fix_live_chat_legacy_read.sql` | A | `messages` SELECT policy'sini `store_id IS NOT NULL` koşulunu **tamamen kaldırarak** gevşetti (`message_type='live'` yeterli) | **#6'yı geçersiz kıldı** — kanıt: 14 test mesajının hepsi `store_id=NULL` olan legacy/global conversation'a düşmüş, #6'nın koşulu bu satırları hiç açmıyordu |
| 8 | `fix_live_chat_store_isolation.sql` | A | #7'nin koşulunu geri sıkılaştırdı: `store_id IS NOT NULL OR id = <bilinen legacy id>` | **#7'yi geçersiz kıldı — REGRESYON DÜZELTMESİ**: #7 mağazalar arası izolasyonu kırmıştı (herhangi bir kullanıcı API'yi doğrudan sorgulayıp TÜM mağazaların canlı sohbetini okuyabiliyordu) |
| 9 | `fix_live_chat_participants_v5.sql` | B | RPC'yi **üçüncü kez** yeniden yazdı: sohbeti bul/oluştur ve katılımcı ekle işlemlerini **iki ayrı RPC'ye** böldü (`get_or_create_store_live_conversation` artık sade, `join_store_live_chat` ayrı) | Dosyanın kendi ifadesiyle **"v3 ve v4'te sorun tekrar ediyor"** — bkz. aşağıdaki ⚠️ bulgu |

**İlgili ama ayrı bir konu (zincire dahil değil):** `fix_dm_customer_store_messaging.sql`, canlı yayın sohbetine dokunmuyor; müşteri↔mağaza arasında **ayrı, özel (1:1) bir DM sistemi** kuruyor (`conversations.customer_id` ekliyor). Sizin listenizde yoktu, tabloya dahil etmedim, ama aynı `conversations`/`messages` tablolarını paylaştığı için Faz 1.2'de konsolidasyon yaparken bu dosyanın RLS policy'leriyle çakışmadığından emin olunmalı.

### ⚠️ Bulgu: eksik "v4"

`fix_live_chat_participants_v5.sql`, açıkça **"v3 ve v4'te sorun tekrar ediyor"** diyor — ama repoda `fix_live_chat_participants_v4.sql` diye bir dosya **yok**. İki ihtimal:
1. v4, dosyaya hiç kaydedilmeden SQL Editor'de doğrudan elle çalıştırıldı (muhtemelen `fix_live_chat_conversation_rollback.sql` kastediliyor — o da aynı RPC'yi düzeltmeye çalışıyordu, sırayla #5 = "v4" olabilir).
2. v4 dosyası oluşturuldu ama repoya commit edilmeden kayboldu.

Her iki durumda da bu, Bölüm 3'teki "merkezi migration sistemi yok" riskinin somut bir örneği: **bir fix denemesi hiçbir yerde iz bırakmadan kayboldu**, bu da hangi SQL'in DB'de gerçekten çalıştığını dosyalardan %100 çıkarmayı imkânsız kılıyor — teşhis sorgusunu çalıştırmanın neden şart olduğunun kanıtı.

---

## 2) Canlı Durum Teşhis Sorgusu

Aşağıdaki dosyayı Supabase SQL Editor'de çalıştırın ve **tüm çıktıyı** (üç sorgunun sonucunu da) buraya yapıştırın — ben ancak o zaman "şu an gerçekte hangi versiyon aktif" sorusunu kesin cevaplayabilirim.

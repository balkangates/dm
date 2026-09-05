# Faz 1.1 — Sonuç: Canlı DB'nin Gerçek Durumu (Varsayımsız)

*Kaynak: sizin paylaştığınız 7 sorgu çıktısı (sorgu1-7). Aşağıdaki HİÇBİR madde varsayım değil, doğrudan bu çıktılardan okunuyor.*

---

## 🔴 EN KRİTİK BULGU — RLS ÜÇ TABLODA DA KAPALI

**Sorgu 2 çıktısı:**
```
table_name,rls_enabled,rls_forced
conversation_participants,false,false
conversations,false,false
messages,false,false
```

`messages`, `conversations`, `conversation_participants` — **üçü de RLS kapalı.** Bu, 9 dosyalık fix zincirinin **en az 7'sinin** (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` içeren her dosya) sonunda **tutmadığı/geri alındığı/başka bir yerden kapatıldığı** anlamına geliyor.

**Sonucu:** Sorgu 1'de gördüğümüz onca özenli policy (kim kimin mesajını okuyabilir, mağaza izolasyonu, admin istisnası, DM gizliliği...) **şu an hiçbiri çalışmıyor**. RLS kapalıyken Postgres policy'leri hiç değerlendirmez. Eğer bu üç tabloda `authenticated` rolüne SELECT GRANT varsa (muhtemelen var — çünkü mesajlaşma özelliği fiilen çalışıyor), **şu an giriş yapmış HERHANGİ bir kullanıcı `messages` tablosundaki TÜM satırları (hem canlı sohbet hem ÖZEL/DM mesajlar dahil) doğrudan sorgulayabilir.**

Bu, Faz 0'da bulduğumuz "GRANT eksik → veri görünmüyor" hatasının **tam tersi ve daha ciddi** bir versiyonu: burada veri **fazlasıyla görünüyor** — mağaza izolasyonu yok, DM gizliliği yok.

**Neden olmuş olabilir (kanıta dayalı en olası açıklama, kesin değil):** Mesaj görünürlüğü şikayeti ("karşı taraf mesajı göremiyor") ile şu anki "RLS tamamen kapalı" durumu **çelişiyor** — RLS kapalıyken görünürlük sorunu zaten yaşanmaz. En olası açıklama: bir noktada biri (muhtemelen sizin projenin genelinde gördüğümüz alışkanlıkla — `store_order_invoices` örneğinde de "Table Editor'de RLS disabled olarak doğrulandı" notu vardı) Supabase Table Editor üzerinden RLS'i **elle kapatarak** görünürlük sorununu "hızlıca çözmüş" olabilir. Bu, sorunu gizlice çözer (herkes her şeyi görür, dolayısıyla "karşı taraf da görüyor" artık doğru olur) ama ciddi bir veri sızıntısı açar. **Bu kesin teşhis değil, tek tutarlı açıklama** — siz daha iyi biliyorsunuz, eğer RLS'i bilinçli olarak kapattıysanız (ör. debug için) lütfen belirtin.

### ⚠️ Önerilen acil ara-adım (Faz 1.2'yi beklemeden)

Faz 1.2'de tüm policy/fonksiyon setini konsolide edeceğiz (tasarım kararları gerektiriyor, biraz sürer). Ama **RLS'i şimdi, hiçbir tasarım kararı beklemeden yeniden açmak** tek satırlık, risksiz bir işlem — aşağıda ayrı bir dosya olarak hazırladım. Önerim: Faz 1.2'yi beklemeden bunu şimdi çalıştırın (mevcut policy'ler zaten sorgu 1'de gördüğümüz gibi mantıklı görünüyor, sadece devre dışı).

---

## Diğer Bulgular

### 1) Şu an aktif olan `messages_live_chat_public_read` koşulu

```sql
(message_type = 'live') AND EXISTS (
  SELECT 1 FROM conversations c
  WHERE c.id = messages.conversation_id
    AND ((c.store_id IS NOT NULL) OR (c.id = 'e3fc6ac0-5e8f-4bb6-9aa1-ca1d84ddaf73'::uuid))
)
```

Bu **tam olarak `fix_live_chat_store_isolation.sql`'in (zincirdeki #8, en son ve doğru olan) koşulu** — yani zincirin RLS tarafı doğru sürümde son buldu. `fix_live_chat_final.sql` (#6) ve `fix_live_chat_legacy_read.sql` (#7) artık aktif değil, üzerlerine yazılmışlar. **İyi haber: chain'in [A] görünürlük ipliği kendi içinde doğru yerde bitmiş** — sorun RLS'in tamamen kapalı olması, policy'nin kendisi değil.

### 2) Sizin sorunuz: `e3fc6ac0-...` (hayalet/legacy id) hâlâ gerekli mi?

**Kısa cevap: Hayır, artık gerekli değil — Faz 1.2'de kaldırılmalı.**

Kanıt:
- **Sorgu 6**: `'e3fc6ac0-5e8f-4bb6-9aa1-ca1d84ddaf73'` VE `'70a0c692-...'` (v5'teki "hayalet" id) için sorgu **0 satır döndü** — yani bu ID'ler `conversations` tablosunda **hiç yok**.
- **Sorgu 7**: `store_id IS NULL` olan **0** conversation var; tüm 4 conversation'ın `store_id`'si dolu.

Yani: sistem artık **her mağaza için gerçekten kendi `store_id`'siyle bir conversation üretiyor**, legacy/global paylaşımlı oda hiç kullanılmıyor. `store_isolation.sql`'deki `OR c.id = 'e3fc6ac0-...'` istisnası şu an **ölü kod** — hiçbir satıra karşılık gelmiyor, zararsız ama gereksiz. Faz 1.2'deki konsolide policy'de bu istisnayı **kaldıracağız**, sadece `store_id IS NOT NULL` yeterli.

*(Not: Bu, o legacy ID'nin geçmişte hiç var olmadığı anlamına gelmez — muhtemelen bir noktada temizlenmiş/silinmiş. Şu anki mimari zaten "her müşteri kendi mağazasının store_id'sine bağlanır" doğru davranışı sergiliyor, sizin sorunuzdaki sezgi doğruydu.)*

### 3) Aktif RPC'ler beklenenden farklı — bir "gizli" değişiklik daha var

**`get_or_create_store_live_conversation`** şu anki hâli (sorgu 3), bilinen 9 dosyanın **hiçbirine tam eşleşmiyor**:

- Yapı olarak `fix_live_chat_conversation_rollback.sql`'e (#5) en yakını — nested BEGIN/EXCEPTION ile katılımcı ekleme.
- AMA iki fark var, hiçbir dosyada yok:
  1. Conversation arama koşuluna **`AND customer_id IS NULL`** eklenmiş (muhtemelen DM sistemi eklendikten sonra, canlı-yayın konuşmasını DM konuşmasından ayırmak için — mantıklı bir değişiklik ama hiçbir `fixes/*.sql` dosyasında yok).
  2. `EXCEPTION WHEN OTHERS THEN` bloğu #5'teki gibi "kontrol et, yoksa ekle" mantığı yerine sadece `NULL;` (sessizce yok say) yapıyor — basitleştirilmiş ama farklı.

**`join_store_live_chat`** ise tam olarak `fix_live_chat_participants_v5.sql`'deki (#9) gibi var — yani v5 **kısmen** uygulanmış: yeni fonksiyonu oluşturmuş, ama v5'in *asıl* değişikliği olan "get_or_create'i sadeleştir, katılımcı eklemeyi tamamen ayır" kısmı tutmamış — birisi muhtemelen v5'ten sonra `get_or_create_store_live_conversation`'ı **elle, dosyaya kaydetmeden** tekrar düzenlemiş.

**Bu, daha önce bulduğumuz "eksik v4" ile aynı sınıf sorun**: canlı veritabanı, repodaki dosyaların toplamından **başka bir yerde**. İki elle yapılmış, kaydedilmemiş değişiklik var (v4 + bu). Faz 2'deki "gerçek migration sistemine geçiş" önceliğini bir kez daha doğruluyor.

### 4) Üç ayrı "nesil" policy aynı anda duruyor + bir tanesi hiçbir dosyada yok

Sorgu 1'i policy adlarına göre gruplarsam:

| Grup | Policy'ler | Kaynağı |
|---|---|---|
| **Bilinen fix-zinciri** | `messages_live_chat_public_read`, `messages_live_chat_insert`, `conversations_store_chat_read`, `conversation_participants_store_chat_read` | `fix_live_chat_store_isolation.sql` (#8) + `fix_live_chat_participants_v3.sql` (#4) |
| **Bilinen DM sistemi** | `messages_dm_participants_read/insert/update`, `conversations_dm_participants_read` | `fix_dm_customer_store_messaging.sql` (repo'da var, doğrulandı) |
| **KAYNAĞI BİLİNMİYOR** | `msg_select`, `msg_insert`, `msg_update`, `conv_insert_authenticated`, `conv_update_owner_or_admin`, `conv_select_participant_or_live_or_admin`, `cp_insert_self`, `cp_select_self_or_admin` | **Repoda hiçbir `fixes/*.sql` dosyasında bu isimler geçmiyor** (grep ile doğrulandı) |

Son grup — 8 policy — muhtemelen Supabase Dashboard'un policy editöründen elle oluşturulmuş (isimlendirme kalıbı: kısa, `msg_`/`conv_`/`cp_` prefix'li — SQL dosyalarındaki uzun açıklayıcı isimlerden farklı bir üslup). İçerikleri aslında makul ve kapsamlı (admin rolü kontrolü dahil, `sender_id/receiver_id` tabanlı 1:1 mesajlaşma + admin + katılımcı bazlı erişim) — kötü niyetli değil, muhtemelen bu üç tablonun **orijinal/temel** (fix zincirinden önceki) güvenlik modeli. Ama hiçbir yerde dokümante değil.

**RLS tekrar açıldığında** (yukarıdaki acil adım), bu 8 policy + bilinen 8 policy = **16 policy aynı anda aktif olacak**, aynı komut (SELECT/INSERT/UPDATE) için birden fazla PERMISSIVE policy varsa Postgres bunları **OR**'lar. Pratik etkisi: en gevşek policy kazanır. Örneğin `msg_select`'teki `(sender_id = auth.uid()) OR (receiver_id = auth.uid()) OR (canlı sohbet koşulu) OR (admin)` zaten `messages_live_chat_public_read`'i kapsıyor gibi görünüyor — yani muhtemelen **redundant ama çakışmıyor**. Yine de Faz 1.2'de bunların hepsini tek bir kaynaktan gelen, açıkça dokümante edilmiş bir sete indirgemek gerekiyor; şu anki "6 farklı köken + 16 policy" durumu sürdürülebilir değil.

### 5) `conversation_participants` üzerinde yinelenen (duplicate) UNIQUE kısıt

Sorgu 4:
```
conversation_participants_conv_user_key                 | UNIQUE (conversation_id, user_id)
conversation_participants_conversation_id_user_id_key    | UNIQUE (conversation_id, user_id)
```

Aynı kısıt **iki farklı isimle iki kez** eklenmiş — muhtemelen biri elle (`_conv_user_key`), biri `fix_live_chat_participants_v3.sql`'in `DO $$ ... ADD CONSTRAINT conversation_participants_conversation_id_user_id_key ... EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$` bloğundan (bu blok "zaten varsa sessizce geç" diyordu ama isim farklı olduğu için ikinci kez de eklenmiş — `duplicate_object` yakalaması sadece AYNI isimde çakışma olursa devreye girer). Fonksiyonel olarak zararsız (ikisi de aynı işi yapıyor) ama temizlenmesi gereken bir artık.

### 6) Realtime publication doğru

Sorgu 5: `messages` ve `conversation_participants` ikisi de `supabase_realtime` publication'ında — bu taraf sorunsuz, önceki fix'ler burada başarılı olmuş.

---

## Özet: Faz 1.2'ye Girdi

1. **Acil (şimdi, ayrı dosya):** RLS'i 3 tabloda da yeniden aç.
2. **Faz 1.2'de konsolide edilecekler:**
   - 16 policy → tek, dokümante edilmiş sete indirgenecek (bilinmeyen 8 policy dahil edilip incelenerek, gereksiz olan kaldırılacak).
   - `e3fc6ac0-...` legacy-id istisnası kaldırılacak (artık ölü kod).
   - `get_or_create_store_live_conversation` fonksiyonu, şu anki (dosyasız) aktif haliyle uyumlu şekilde yeniden yazılıp **bu sefer dosyaya kaydedilecek** — `customer_id IS NULL` filtresi korunacak (DM sistemiyle doğru ayrım için gerekli).
   - **`join_store_live_chat` — kod tabanında kontrol edildi: `app/`, `lib/`, `components/`, `modules/`, `public/` hiçbirinde çağrılmıyor.** v5'in DB'ye uygulanan tek parçası (bu fonksiyon) şu an **tamamen ölü kod** — client hiç çağırmıyor, katılımcı ekleme hâlâ `get_or_create_store_live_conversation` içinde inline yapılıyor. Faz 1.2'de bu fonksiyon ya silinecek ya da v5'in orijinal niyetine uygun şekilde gerçekten devreye alınacak.
   - Yinelenen UNIQUE kısıt temizlenecek.

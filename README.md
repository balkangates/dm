# DampingVar Otomotiv Marketplace

Next.js App Router + PostgreSQL + Drizzle ORM ile otomotiv yedek parça pazaryeri.

## Mevcut proje hakkında

Başlangıç deposu yalnızca boş Next.js/PostgreSQL iskeletiydi; mevcut Supabase projesi, Supabase Auth, iyzico entegrasyonu, LiveKit anahtarları, ürün verileri veya mağazalar bulunmuyordu. Uygulama mevcut `src/db/index.ts` bağlantısını korur. `DATABASE_URL` bir Supabase PostgreSQL bağlantısına yönlendirilebilir; hesap sistemi şu anda sunucu tarafı parola hashleme ve imzalı HTTP-only oturum çerezleri kullanır, Supabase Auth değildir. Dış hizmetler gerçek kimlik bilgileri girilmeden çalışıyor gibi gösterilmez.

## Başlangıç

1. `DATABASE_URL` değerini ayarlayın. Üretimde ayrıca güçlü ve ayrı bir `SESSION_SECRET` kullanın.
2. `npm install` ve `npx drizzle-kit push` çalıştırın.
3. `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0001_marketplace_security.sql` ve `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0002_categories.sql` çalıştırın. Drizzle şema push işleminden sonra güvenlik SQL'ini yeniden uygulayın.
4. `npm run build` ve `npm run dev` ile başlatın.
5. İlk hesabı oluşturun; `ADMIN_EMAIL` ayarlanmadıysa ilk kayıt yönetici olur. Admin panelinde gerçek EFT banka bilgilerini girin, merkezi OEM ürünlerini ekleyin ve mağaza başvurularını onaylayın.

## İsteğe bağlı harici hizmetler

- Kart: `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL` (`https://sandbox-api.iyzipay.com` veya üretim ortamı), herkese açık HTTPS `APP_URL`. Kartlar iyzico barındırılan ödeme sayfasına yönlendirilir; callback sağlayıcıdan tekrar sorgulanır, imza/tutar/sipariş doğrulanır. Kimlik bilgileri yoksa kart yöntemi gizlenir. Kart iadesi otomatik tamamlandı olarak işaretlenmez; sağlayıcı üzerinden ayrıca gerçekleştirilmelidir.
- Video: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`. Bu değerler yoksa kalıcı mesajlaşma çalışır; video uygun olmadığı açıkça gösterilir.
- `ADMIN_EMAIL`: Belirli e-posta hesabına yönetici rolü vermek için. İlk kullanıcı kuralının yerine geçer.
- `SESSION_SECRET`: Üretimde zorunlu olarak ayrıca yapılandırılması önerilen oturum imzalama anahtarı. Yerel kurulumda `DATABASE_URL` yedek olarak kullanılır.

## Veri kuralları

- `products.normalized_oem` benzersiz ve veritabanı kısıtıyla normalize OEM'e eşittir. Merkezi ürün adı yalnızca yöneticiye aittir; marka/tip/fiyat/stok `store_products` seviyesindedir.
- `store_products.product_type` PostgreSQL enum'dur: `original`, `aftermarket`, `equivalent`. Aynı mağazada SKU ve ürün+marka+tip teklifi benzersizdir.
- CSV şablonunda ürün adı yoktur. Önizleme ve süreli imzalı onay olmadan kayıt yapılmaz. Bilinmeyen OEM için ürün otomatik eklenmez; talep admin tarafından onaylanır.
- Checkout üst sipariş, mağaza alt siparişleri, ürün snapshot'ları ve ödeme kaydını tek transaction içinde oluşturur. EFT `pending_verification` durumunda kalır.
- Sipariş kalemleri, ledger, komisyon hareketleri ve audit kayıtları append-only trigger ile korunur. Hakediş yalnızca ilgili mağaza teslimatı onaylandıktan sonra oluşur; fatura taslağı gerçek fatura numarası/PDF ile ayrıca düzenlenir.
- Sunucu eylemleri kullanıcı, mağaza ve admin yetkilerini kontrol eder. SQL RLS politikaları kısıtlı bir PostgreSQL rolüyle `app.user_id` ve `app.role` oturum ayarlarını kullanan dağıtımlar için hazırlanmıştır. Veritabanı sahibi/superuser RLS'yi baypas edebileceğinden uygulama sunucu yetki denetimlerini de zorunlu tutar.

## Doğrulama

`npx next typegen`, `npm exec tsc -- --noEmit`, `npm run build` ve `/api/health`. OEM tekilliği, farklı marka teklifleri, geçersiz tip, SKU/kimlik çakışması ve değişmez sipariş snapshot'ları rollback yapılan SQL transaction ile sınanmıştır; kalıcı sahte ürün, mağaza, sipariş veya finans kaydı bulunmaz.

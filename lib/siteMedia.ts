/**
 * Site medyası — slot kataloğu ve ortak doğrulama (istemci + sunucu güvenli; sunucuya özel import YOK).
 *
 * Dosyalar Supabase Storage'da `store-media` bucket'ının altında tutulur:
 *   store-media/image/<önek>-<zaman>-<rastgele>.<uzantı>
 *   store-media/video/<önek>-<zaman>-<rastgele>.<uzantı>
 * Slot → dosya eşlemesi `site_media` tablosundadır; slot listesi burada sabittir.
 */

export const STORE_BUCKET = "store-media";

/** Yüklenmiş varsayılan kapak yokken kullanılan paket içi görsel. */
export const DEFAULT_COVER = "/images/magaza-ic.jpg";

export type MediaKind = "image" | "video";
export type SiteArea = "home" | "customer" | "business";

export type SlotDef = {
  key: string;
  kind: MediaKind;
  area: SiteArea;
  label: string;
  hint: string;
};

export const AREA_LABEL: Record<SiteArea, string> = {
  home: "Anasayfa",
  customer: "Müşteri paneli",
  business: "İşletme paneli",
};

export const SITE_SLOTS: SlotDef[] = [
  // ---- Anasayfa ----
  { key: "home.hero.customer", kind: "image", area: "home", label: "Hero arka planı · müşteri modu", hint: "Anasayfa üst bandı arka plan görseli. Önerilen 1920×1080, yatay." },
  { key: "home.hero.business", kind: "image", area: "home", label: "Hero arka planı · işletme modu", hint: "İşletme modunda üst bant arka planı. Önerilen 1920×1080, yatay." },
  { key: "home.hero.video", kind: "video", area: "home", label: "Hero arka plan videosu", hint: "Sessiz, döngülü arka plan videosu (iki modda da). Tanımlıysa hero görselinin yerine geçer. Kısa (10–20 sn) MP4/WebM önerilir." },
  { key: "home.how.video", kind: "video", area: "home", label: "“Nasıl çalışır” tanıtım videosu", hint: "Anasayfadaki “Nasıl çalışır” alanında storyboard yerine oynatılır (storyboard kaydında kendi videosu yoksa)." },
  { key: "home.business.video", kind: "video", area: "home", label: "İşletme modu · storyboard videosu", hint: "Anasayfa işletme modundaki “İşletmeler için video anlatım” alanında oynatılır (storyboard kaydında kendi videosu yoksa). Storyboard videosunu aşağıdaki “Storyboard videoları” bölümünden anlatım bazında da yükleyebilirsiniz." },
  { key: "home.cover.fallback", kind: "image", area: "home", label: "Varsayılan kapak görseli", hint: "İşletme / kampanya / fırsat görseli olmayan kartlarda kullanılır. Önerilen 1200×800." },
  // ---- Müşteri paneli ----
  { key: "customer.panel.banner", kind: "image", area: "customer", label: "Müşteri paneli banner görseli", hint: "Hesabım › Genel bakış üstünde gösterilir. Önerilen 1600×400, yatay." },
  { key: "customer.panel.video", kind: "video", area: "customer", label: "Müşteri paneli tanıtım videosu", hint: "Hesabım › Genel bakış üstünde oynatılabilir video olarak gösterilir." },
  // ---- İşletme paneli ----
  { key: "business.panel.banner", kind: "image", area: "business", label: "İşletme paneli banner görseli", hint: "İşletme paneli › Genel bakış üstünde gösterilir. Önerilen 1600×400, yatay." },
  { key: "business.panel.video", kind: "video", area: "business", label: "İşletme paneli tanıtım videosu", hint: "İşletme paneli › Genel bakış ve Video ve İçerik Stüdyosu üstünde oynatılır." },
];

export const SLOT_BY_KEY: Record<string, SlotDef> = Object.fromEntries(SITE_SLOTS.map((s) => [s.key, s]));

export type SiteMediaItem = {
  slotKey: string;
  kind: MediaKind;
  url: string;
  storagePath: string;
  alt: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  updatedAt: string | null;
};
export type SiteMediaMap = Record<string, SiteMediaItem>;

/* ---------------------------- yükleme kuralları ---------------------------- */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};

/** Dosya türü/boyut doğrulaması: hata metni döner, geçerliyse null. */
export function checkMediaFile(kind: MediaKind, file: { type: string; size: number }): string | null {
  if (kind === "image") {
    if (!IMAGE_TYPES.includes(file.type)) return "Yalnızca JPG, PNG, WebP veya AVIF görsel yüklenebilir.";
    if (file.size > MAX_IMAGE_BYTES) return "Görsel en fazla 10MB olabilir.";
  } else {
    if (!VIDEO_TYPES.includes(file.type)) return "Yalnızca MP4, WebM veya MOV video yüklenebilir.";
    if (file.size > MAX_VIDEO_BYTES) return "Video en fazla 100MB olabilir.";
  }
  return null;
}

/** store-media içindeki nesne yolu: <image|video>/<önek>-<zaman>-<rastgele>.<uzantı> */
export function buildStorePath(kind: MediaKind, prefix: string, mime: string): string {
  const safe = prefix.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "dosya";
  const rand = Math.random().toString(36).slice(2, 8);
  return `${kind}/${safe}-${Date.now()}-${rand}.${EXT[mime] ?? (kind === "image" ? "jpg" : "mp4")}`;
}

/** Sunucu doğrulaması: yol yalnızca image/ veya video/ altında, güvenli karakterler, doğru tür. */
export function validStorePath(kind: MediaKind, path: string): boolean {
  return new RegExp(`^${kind}/[A-Za-z0-9._-]{1,160}$`).test(path) && !path.includes("..");
}

/** Public URL gerçekten bu yola ve store-media bucket'ına mı ait? */
export function urlMatchesStorePath(url: string, path: string): boolean {
  return url.length <= 600 && url.includes(`/object/public/${STORE_BUCKET}/${path}`);
}

/** Public URL'den store-media nesne yolunu çözer (silme/temizlik için). */
export function storePathOfUrl(url: string | null | undefined): string | null {
  const p = String(url ?? "").split(`/object/public/${STORE_BUCKET}/`)[1] ?? "";
  return /^(image|video)\/[A-Za-z0-9._-]{1,160}$/.test(p) ? p : null;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "—";
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

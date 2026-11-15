"use client";

import { useState } from "react";
import { Badge, Button, Card, Icon, Notice, useToast } from "@/components/ds";
import { DashSectionHead } from "@/components/Dash";
import { getBrowserSupabase } from "@/lib/supabase/client";
import {
  AREA_LABEL, SITE_SLOTS, STORE_BUCKET, buildStorePath, checkMediaFile, formatBytes,
  type MediaKind, type SiteArea, type SiteMediaItem, type SiteMediaMap,
} from "@/lib/siteMedia";

export type AdminVideo = {
  id: string;
  topic: string;
  title: string;
  poster: string | null;
  videoUrl: string | null;
  sceneCount: number;
};

const ACCEPT: Record<MediaKind, string> = {
  image: "image/jpeg,image/png,image/webp,image/avif",
  video: "video/mp4,video/webm,video/quicktime",
};

/** Tek bir medya alanı: önizleme + Yükle / Değiştir / Sil. */
function MediaTile({
  label, hint, kind, url, meta, busy, onUpload, onDelete, compact = false,
}: {
  label: string;
  hint?: string;
  kind: MediaKind;
  url: string | null;
  meta?: string;
  busy: boolean;
  onUpload: (file: File) => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  const has = Boolean(url);
  return (
    <div className="flex h-full flex-col rounded-[4px] border-2 border-line bg-surface">
      <div className={`relative overflow-hidden border-b-2 border-line bg-canvas ${compact ? "aspect-[16/7]" : "aspect-video"}`}>
        {url ? (
          kind === "image" ? (
            <img src={url} alt={label} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <video src={url} controls playsInline preload="metadata" className="h-full w-full bg-black object-contain" />
          )
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-1 text-[0.74rem] text-muted">
            {kind === "image" ? <Icon.layers size={18} /> : <Icon.video size={18} />}
            {kind === "image" ? "Görsel yüklenmedi" : "Video yüklenmedi"}
          </span>
        )}
        <span className="absolute left-2 top-2">
          <Badge tone={has ? "positive" : "neutral"}>{has ? "Yüklü" : "Varsayılan"}</Badge>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-[0.86rem] font-semibold leading-snug text-ink">{label}</p>
        {hint ? <p className="text-[0.76rem] leading-relaxed text-muted">{hint}</p> : null}
        {meta ? <p className="tabular text-[0.7rem] text-muted">{meta}</p> : null}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <label
            className={`inline-flex h-9 items-center gap-1.5 rounded-[4px] border-2 border-dashed px-3 text-[0.8rem] font-medium ${
              busy ? "cursor-wait border-line text-muted" : "cursor-pointer border-line text-ink-700 hover:border-accent hover:text-accent"
            }`}
          >
            <Icon.upload size={14} />
            {busy ? "İşleniyor…" : has ? "Değiştir" : "Yükle"}
            <input
              type="file"
              accept={ACCEPT[kind]}
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onUpload(f);
              }}
            />
          </label>
          {has ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={onDelete}>Sil</Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function SiteMediaAdmin({ media, videos }: { media: SiteMediaMap; videos: AdminVideo[] }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function call(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({ ok: false }));
    if (!json.ok) toast.push({ title: json.error ?? "İşlem başarısız", tone: "danger" });
    return Boolean(json.ok);
  }

  /** Dosyayı tarayıcıdan doğrudan store-media/<image|video>/ altına yükler; ardından sunucuya kaydeder. */
  async function uploadAndRegister(
    id: string, kind: MediaKind, prefix: string, file: File,
    register: (u: { path: string; url: string }) => Record<string, unknown>, okMsg: string,
  ) {
    const bad = checkMediaFile(kind, file);
    if (bad) { toast.push({ title: "Dosya kabul edilmedi", desc: bad, tone: "danger" }); return; }
    setBusy(id);
    try {
      const sb = getBrowserSupabase();
      const path = buildStorePath(kind, prefix, file.type);
      const { data, error } = await sb.storage.from(STORE_BUCKET).upload(path, file, {
        contentType: file.type, cacheControl: "31536000", upsert: false,
      });
      if (error) { toast.push({ title: "Yükleme başarısız", desc: error.message, tone: "danger" }); return; }
      const { data: pub } = sb.storage.from(STORE_BUCKET).getPublicUrl(data.path);
      const ok = await call(register({ path: data.path, url: pub.publicUrl }));
      if (!ok) { await sb.storage.from(STORE_BUCKET).remove([data.path]).catch(() => undefined); return; }
      toast.push({ title: okMsg, tone: "positive" });
      setTimeout(() => window.location.reload(), 600);
    } finally {
      setBusy(null);
    }
  }

  async function removeAndReload(id: string, body: Record<string, unknown>, okMsg: string, confirmMsg: string) {
    if (!window.confirm(confirmMsg)) return;
    setBusy(id);
    try {
      if (await call(body)) {
        toast.push({ title: okMsg, tone: "positive" });
        setTimeout(() => window.location.reload(), 600);
      }
    } finally {
      setBusy(null);
    }
  }

  const meta = (m?: SiteMediaItem) =>
    m ? `${formatBytes(m.sizeBytes)}${m.updatedAt ? ` · ${new Date(m.updatedAt).toLocaleDateString("tr-TR")}` : ""}` : undefined;

  const areas: SiteArea[] = ["home", "customer", "business"];

  return (
    <div>
      <DashSectionHead
        title="Site görsel ve video alanları"
        desc="Anasayfa, müşteri paneli ve işletme panelindeki görsel/video alanlarını buradan yükleyin, değiştirin veya silin. Dosyalar Supabase Storage › store-media bucket'ında image/ ve video/ klasörlerine kaydedilir."
      />
      <Notice tone="info" icon={<Icon.info size={16} />} className="mb-6">
        Görseller en fazla 10MB (JPG, PNG, WebP, AVIF); videolar en fazla 100MB (MP4, WebM, MOV). Alan boşsa sitede varsayılan
        tasarım görünür. Değiştirdiğinizde eski dosya Storage&apos;dan da silinir.
      </Notice>

      {areas.map((area) => (
        <section key={area} className="mb-8">
          <p className="mb-3 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted">{AREA_LABEL[area]}</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {SITE_SLOTS.filter((s) => s.area === area).map((s) => {
              const m = media[s.key];
              return (
                <MediaTile
                  key={s.key}
                  label={s.label}
                  hint={s.hint}
                  kind={s.kind}
                  url={m?.url ?? null}
                  meta={meta(m)}
                  busy={busy === s.key}
                  onUpload={(file) =>
                    void uploadAndRegister(
                      s.key, s.kind, s.key, file,
                      (u) => ({ action: "site_media_set", slotKey: s.key, storagePath: u.path, url: u.url, mimeType: file.type, sizeBytes: file.size }),
                      m ? `${s.label} değiştirildi` : `${s.label} yüklendi`,
                    )
                  }
                  onDelete={() =>
                    void removeAndReload(s.key, { action: "site_media_clear", slotKey: s.key }, `${s.label} silindi`, `“${s.label}” silinsin mi? Dosya Storage'dan da kaldırılır.`)
                  }
                />
              );
            })}
          </div>
        </section>
      ))}

      <section className="mb-4">
        <p className="mb-1 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted">Storyboard videoları</p>
        <p className="mb-3 max-w-[80ch] text-[0.82rem] leading-relaxed text-muted">
          Her storyboard anlatımına gerçek video ekleyin: Anasayfa › Nasıl çalışır, Video kütüphanesi, İşlem akışı ve işletme
          paneli stüdyosundaki storyboard alanları izlenebilir video olur. Video yüklenmeyenler animasyonlu storyboard olarak kalır.
        </p>
        {videos.length === 0 ? (
          <Card><p className="text-[0.86rem] text-muted">Storyboard kaydı bulunamadı.</p></Card>
        ) : (
          <ul className="space-y-4">
            {videos.map((v) => (
              <li key={v.id} className="rounded-[4px] border-2 border-line bg-canvas p-3">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <p className="font-display text-[0.98rem] font-bold text-ink">{v.title}</p>
                  <Badge tone="neutral">{v.sceneCount} sahne</Badge>
                  <Badge tone={v.videoUrl ? "positive" : "warning"}>{v.videoUrl ? "Video yüklü" : "Yalnız storyboard"}</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
                  <MediaTile
                    label="Video dosyası"
                    hint="MP4/WebM/MOV · en fazla 100MB"
                    kind="video"
                    url={v.videoUrl}
                    busy={busy === `${v.id}:video`}
                    onUpload={(file) =>
                      void uploadAndRegister(
                        `${v.id}:video`, "video", `storyboard-${v.topic}`, file,
                        (u) => ({ action: "storyboard_media_set", videoId: v.id, kind: "video", storagePath: u.path, url: u.url }),
                        v.videoUrl ? "Storyboard videosu değiştirildi" : "Storyboard videosu yüklendi",
                      )
                    }
                    onDelete={() =>
                      void removeAndReload(`${v.id}:video`, { action: "storyboard_media_clear", videoId: v.id, kind: "video" }, "Storyboard videosu silindi", `“${v.title}” videosu silinsin mi? Anlatım animasyonlu storyboard olarak kalır.`)
                    }
                  />
                  <MediaTile
                    label="Kapak (poster)"
                    hint="Video başlamadan önce görünür."
                    kind="image"
                    url={v.poster}
                    busy={busy === `${v.id}:poster`}
                    onUpload={(file) =>
                      void uploadAndRegister(
                        `${v.id}:poster`, "image", `poster-${v.topic}`, file,
                        (u) => ({ action: "storyboard_media_set", videoId: v.id, kind: "poster", storagePath: u.path, url: u.url }),
                        v.poster ? "Kapak değiştirildi" : "Kapak yüklendi",
                      )
                    }
                    onDelete={() =>
                      void removeAndReload(`${v.id}:poster`, { action: "storyboard_media_clear", videoId: v.id, kind: "poster" }, "Kapak silindi", "Kapak görseli silinsin mi?")
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import type { SiteMediaMap } from "@/lib/siteMedia";

/** Anasayfa hero arka planı: video varsa sessiz döngülü video, yoksa görsel; ikisi de yoksa hiçbir şey (varsayılan koyu zemin). */
export function HeroBackdrop({ media, imageKey }: { media: SiteMediaMap; imageKey: "home.hero.customer" | "home.hero.business" }) {
  const video = media["home.hero.video"];
  const image = media[imageKey];
  if (video) {
    return (
      <>
        <video
          src={video.url}
          poster={image?.url}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/50 to-ink/85" />
      </>
    );
  }
  if (image) {
    return (
      <>
        <img src={image.url} alt={image.alt ?? ""} aria-hidden={image.alt ? undefined : true} className="absolute inset-0 h-full w-full object-cover opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/50 to-ink/85" />
      </>
    );
  }
  return null;
}

/** Müşteri / işletme paneli üst alanı: banner görseli + oynatılabilir tanıtım videosu (tanımlı olanlar). */
export function PanelMedia({ media, area, className = "" }: { media: SiteMediaMap; area: "customer" | "business"; className?: string }) {
  const banner = media[`${area}.panel.banner`];
  const video = media[`${area}.panel.video`];
  if (!banner && !video) return null;
  return (
    <div className={`mb-6 grid gap-4 ${banner && video ? "lg:grid-cols-[1.2fr_1fr]" : ""} ${className}`}>
      {banner ? (
        <div className="overflow-hidden rounded-[4px] border-2 border-line bg-canvas">
          <img src={banner.url} alt={banner.alt ?? ""} className="h-full max-h-[260px] w-full object-cover" />
        </div>
      ) : null}
      {video ? (
        <div className="overflow-hidden rounded-[4px] border-2 border-line bg-ink">
          <video src={video.url} poster={banner?.url} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain" />
        </div>
      ) : null}
    </div>
  );
}

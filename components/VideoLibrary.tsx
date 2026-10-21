"use client";

import { useState } from "react";
import { Card, ToastProvider, VideoModule, useToast } from "@/components/ds";
import { Icon } from "@/components/icons";
import type { Lang } from "@/lib/money";

export type VideoItem = {
  id: string;
  topic: string;
  title: string;
  durationSec: number;
  scenes: { at: string; visual: string; caption: string; image?: string | null }[];
  captions: Record<string, string[]>;
  steps: string[];
  poster: string | null;
  renderStatus: string;
  status: string;
};

function Inner({ videos, lang, compact }: { videos: VideoItem[]; lang: Lang; compact?: boolean }) {
  const toast = useToast();
  const [activeId, setActiveId] = useState(videos[0]?.id ?? "");
  const [captionLang, setCaptionLang] = useState<string>(
    videos[0]?.captions?.[lang] ? lang : videos[0]?.captions?.tr ? "tr" : Object.keys(videos[0]?.captions ?? {})[0] ?? "tr"
  );
  const active = videos.find((v) => v.id === activeId) ?? videos[0];

  function select(v: VideoItem) {
    setActiveId(v.id);
    const langs = Object.keys(v.captions ?? {});
    setCaptionLang(langs.includes(lang) ? lang : langs[0] ?? "tr");
    void fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "video_played", meta: { topic: v.topic } }),
    }).catch(() => undefined);
    toast.push({ title: v.title, desc: "Storyboard başlatıldı (demo oynatıcı).", tone: "neutral" });
  }

  if (!active) return null;

  return (
    <div className={compact ? "grid gap-6 lg:grid-cols-[1.4fr_1fr]" : "grid gap-6 lg:grid-cols-[1.5fr_1fr]"}>
      <div>
        <VideoModule
          title={active.title}
          durationSec={active.durationSec}
          scenes={active.scenes}
          captions={active.captions}
          lang={captionLang}
          onLangChange={setCaptionLang}
          poster={active.poster ?? undefined}
          steps={active.steps}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.76rem] text-muted">
          <span className="border-2 border-line bg-surface px-2 py-1 font-bold uppercase tracking-[0.1em]">
            render: {active.renderStatus}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon.info size={13} /> Gerçek video dosyası üretilmedi; storyboard ve altyazı gösterilir.
          </span>
        </div>
      </div>

      <Card className="p-0">
        <p className="border-b-2 border-line px-4 py-3 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted">
          Video kütüphanesi · {videos.length} anlatım
        </p>
        <ul className="thin-scroll max-h-[520px] divide-y-2 divide-line-soft overflow-y-auto">
          {videos.map((v) => {
            const active_ = v.id === active.id;
            const langs = Object.keys(v.captions ?? {});
            return (
              <li key={v.id}>
                <button
                  onClick={() => select(v)}
                  aria-current={active_}
                  className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                    active_ ? "bg-accent-soft/50" : "hover:bg-canvas"
                  }`}
                >
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border-2 ${
                    active_ ? "border-accent bg-accent text-surface" : "border-line bg-surface text-muted"
                  }`}>
                    <Icon.play size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.88rem] font-semibold leading-snug text-ink">{v.title}</span>
                    <span className="tabular mt-1 block text-[0.72rem] text-muted">
                      {v.durationSec} sn · {v.scenes.length} sahne · altyazı {langs.map((l) => l.toUpperCase()).join(" / ")}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

export function VideoLibrary(props: { videos: VideoItem[]; lang: Lang; compact?: boolean }) {
  return (
    <ToastProvider>
      <Inner {...props} />
    </ToastProvider>
  );
}

export default VideoLibrary;

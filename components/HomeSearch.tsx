"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ds";

export default function HomeSearch({
  placeholder,
  districts,
  categories,
}: {
  placeholder: string;
  districts: string[];
  categories: string[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [konum, setKonum] = useState("");
  const [kategori, setKategori] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (konum) p.set("konum", konum);
    if (kategori) p.set("kategori", kategori);
    void fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "filter_used", meta: { q, konum, kategori } }),
    }).catch(() => undefined);
    router.push(`/kampanyalar?${p.toString()}`);
  }

  return (
    <form onSubmit={submit} className="rounded-[4px] border border-white/15 bg-surface/[0.07] p-2 backdrop-blur-sm">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Arama</span>
          <Icon.search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/45" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="h-12 w-full rounded-[3px] border border-white/10 bg-ink/60 pl-10 pr-3 text-[0.92rem] text-white placeholder:text-white/40 focus:border-accent focus:outline-none"
          />
        </label>
        <select
          value={konum}
          onChange={(e) => setKonum(e.target.value)}
          aria-label="Konum"
          className="h-12 rounded-[3px] border border-white/10 bg-ink/60 px-3 text-[0.88rem] text-white focus:border-accent focus:outline-none"
        >
          <option value="">Tüm konumlar</option>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={kategori}
          onChange={(e) => setKategori(e.target.value)}
          aria-label="Kategori"
          className="h-12 rounded-[3px] border border-white/10 bg-ink/60 px-3 text-[0.88rem] text-white capitalize focus:border-accent focus:outline-none"
        >
          <option value="">Tüm kategoriler</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          type="submit"
          className="h-12 shrink-0 rounded-[3px] bg-accent px-6 text-[0.88rem] font-semibold text-white transition-colors hover:bg-accent-600"
        >
          Ara
        </button>
      </div>
    </form>
  );
}

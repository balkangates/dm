"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { withMode, type ViewMode } from "@/lib/viewMode";
import type { OfferMenu } from "@/lib/queries";

/**
 * "Online Fırsatlar" menüsü — kategori → marka (iadeal "Tüm Kategoriler ve Mağazalar" benzeri).
 * Veri /api/affiliate?scope=menu'dan ilk açılışta tembel yüklenir; yalnızca gerçekten
 * ACTIVE ve süresi dolmamış fırsatı olan kategori/markalar listelenir (uydurma mağaza yok).
 */
export function OnlineMegaMenu({ href, label, explicit }: { href: string; label: string; explicit: ViewMode | null }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<OfferMenu | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (menu || state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/affiliate?scope=menu");
      const json = (await res.json()) as { ok: boolean; menu?: OfferMenu };
      if (json.ok && json.menu) { setMenu(json.menu); setState("idle"); } else setState("error");
    } catch { setState("error"); }
  }, [menu, state]);

  const show = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
    void load();
  }, [load]);
  const hideSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 260);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const to = (q: string) => withMode(`/online-firsatlar${q}`, explicit);

  return (
    <div ref={root} onMouseEnter={show} onMouseLeave={hideSoon}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => (open ? setOpen(false) : show())}
        className="link-sweep inline-flex items-center gap-1 rounded-[3px] px-3 py-2 text-[0.86rem] font-medium text-ink-700 transition-colors hover:text-ink"
      >
        {label}
        <Icon.chevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="anim-rise absolute inset-x-0 top-full z-[70] border-y-2 border-line bg-surface shadow-[var(--shadow-pop)]" role="menu" aria-label={label}>
          <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
            {state === "loading" && !menu ? (
              <p className="py-6 text-[0.86rem] text-muted">Kategoriler yükleniyor…</p>
            ) : state === "error" && !menu ? (
              <p className="py-6 text-[0.86rem] text-muted">
                Menü yüklenemedi. <Link href={href} className="text-accent underline" onClick={() => setOpen(false)}>Online fırsatlara git</Link>
              </p>
            ) : menu && menu.categories.length === 0 ? (
              <p className="py-6 text-[0.86rem] text-muted">Şu an yayında online fırsat yok.</p>
            ) : menu ? (
              <>
                <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
                  {menu.categories.map((c) => (
                    <div key={c.category}>
                      <Link
                        href={to(`?kategori=${encodeURIComponent(c.category)}`)}
                        onClick={() => setOpen(false)}
                        className="font-display text-[0.98rem] font-bold capitalize text-accent hover:underline"
                      >
                        {c.category} <span className="tabular text-[0.72rem] font-medium text-muted">({c.n})</span>
                      </Link>
                      <p className="mt-2 flex flex-wrap gap-x-1 gap-y-1 text-[0.84rem] leading-relaxed text-ink-700">
                        {c.brands.map((b, i) => (
                          <span key={b.brand}>
                            <Link href={to(`?marka=${encodeURIComponent(b.brand)}`)} onClick={() => setOpen(false)} className="hover:text-accent hover:underline">{b.brand}</Link>
                            {i < c.brands.length - 1 ? <span className="text-muted-2">,</span> : null}
                          </span>
                        ))}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-line pt-4">
                  <p className="text-[0.76rem] text-muted">Teklifler izlenen bağlantıyla satıcının sitesine yönlendirir; ödeme satıcıda yapılır.</p>
                  <Link href={href} onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 text-[0.84rem] font-semibold text-accent hover:underline">
                    Tüm online fırsatlar <Icon.arrowRight size={14} />
                  </Link>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";

/* ================================================================== *
 * 1. ÖZEL ÇİZİLMİŞ SVG İKON SETİ
 * ================================================================== */

import { Icon } from "@/components/icons";

export { Icon };

/* ================================================================== *
 * 2. MARKA
 * ================================================================== */

export function BrandMark({ size = 30, tone = "accent" }: { size?: number; tone?: "accent" | "light" | "ink" }) {
  const fill = tone === "light" ? "#ffffff" : tone === "ink" ? "var(--color-ink)" : "var(--color-accent)";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill={fill} />
      <path
        d="M9 10.2h7.6c4.5 0 7.6 2.7 7.6 6.3 0 3.7-3.1 6.4-7.6 6.4H9V10.2Z"
        fill={tone === "accent" ? "#ffffff" : "var(--color-accent)"}
      />
      <path d="M13.4 14.1h3c1.9 0 3.1 1.1 3.1 2.5s-1.2 2.5-3.1 2.5h-3v-5Z" fill={fill} />
      <path
        d="M22.6 8.2 25 5.8"
        stroke={tone === "accent" ? "#ffffff" : "var(--color-accent)"}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  light = false,
  href = "/",
  size = 30,
}: {
  light?: boolean;
  href?: string;
  size?: number;
}) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="DampingVar">
      <BrandMark size={size} tone={light ? "light" : "accent"} />
      <span
        className={`font-display text-[1.18rem] font-bold leading-none tracking-[-0.03em] ${
          light ? "text-white" : "text-ink"
        }`}
      >
        Damping
        <span className={light ? "text-accent" : "text-accent"}>Var</span>
      </span>
    </Link>
  );
}

/* ================================================================== *
 * 3. BUTONLAR
 * ================================================================== */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "subtle";
type BtnSize = "sm" | "md" | "lg";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 font-sans font-semibold rounded-[3px] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none";
const BTN_VARIANT: Record<BtnVariant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-600 active:bg-accent-700 shadow-[0_1px_2px_rgba(255,74,23,.4),0_8px_20px_-12px_rgba(255,74,23,.8)]",
  secondary: "bg-surface text-ink border-2 border-ink/25 hover:border-ink hover:bg-canvas-2",
  dark: "bg-ink text-white hover:bg-ink-700",
  ghost: "text-ink-500 hover:text-ink hover:bg-canvas-2",
  subtle: "bg-accent-soft text-accent-700 hover:bg-[#ffe3d9]",
  danger: "bg-surface text-danger border-2 border-danger/35 hover:bg-danger-soft",
};
const BTN_SIZE: Record<BtnSize, string> = {
  sm: "h-8 px-3 text-[0.78rem]",
  md: "h-10 px-4 text-[0.85rem]",
  lg: "h-12 px-6 text-[0.95rem]",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  type = "button",
  onClick,
  disabled,
  loading,
  className = "",
  icon,
  iconRight,
  ...rest
}: {
  children?: ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  href?: string;
  type?: "button" | "submit";
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  icon?: ReactNode;
  iconRight?: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "onClick" | "disabled">) {
  const cls = `${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className}`;
  const inner = (
    <>
      {loading ? (
        <span className="anim-spin inline-block h-3.5 w-3.5 rounded-full border-[2px] border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
      {iconRight}
    </>
  );
  if (href) {
    const external = href.startsWith("http");
    return external ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    ) : (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={cls} {...rest}>
      {inner}
    </button>
  );
}

export function IconButton({
  label,
  children,
  onClick,
  active,
  className = "",
  href,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  href?: string;
}) {
  const cls = `inline-flex h-9 w-9 items-center justify-center rounded-[3px] border transition-colors ${
    active ? "border-accent bg-accent-soft text-accent-700" : "border-line bg-surface text-ink-500 hover:text-ink hover:border-ink-500"
  } ${className}`;
  if (href)
    return (
      <Link href={href} aria-label={label} title={label} className={cls}>
        {children}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active} className={cls}>
      {children}
    </button>
  );
}

/* ================================================================== *
 * 4. ETİKET / ROZET
 * ================================================================== */

export type Tone = "neutral" | "accent" | "positive" | "warning" | "info" | "danger" | "dark";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-canvas-2 text-ink-500 border-line",
  accent: "bg-accent-soft text-accent-700 border-[#ffd6c7]",
  positive: "bg-positive-soft text-positive border-[#c2e9da]",
  warning: "bg-warning-soft text-warning border-[#f3ddb4]",
  info: "bg-info-soft text-info border-[#cddafe]",
  danger: "bg-danger-soft text-danger border-[#f3c9c5]",
  dark: "bg-ink text-white border-ink",
};

export function Badge({
  children,
  tone = "neutral",
  icon,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border-2 px-2 py-0.5 text-[0.62rem] font-bold uppercase leading-none tracking-[0.12em] ${TONE_CLASS[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const c: Record<Tone, string> = {
    neutral: "bg-muted-2",
    accent: "bg-accent",
    positive: "bg-positive",
    warning: "bg-warning",
    info: "bg-info",
    danger: "bg-danger",
    dark: "bg-ink",
  };
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${c[tone]}`} />;
}

/* ================================================================== *
 * 5. KART / BAŞLIK
 * ================================================================== */

export function Card({
  children,
  className = "",
  padded = true,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  hover?: boolean;
}) {
  return (
    <div className={`card ${padded ? "p-5" : ""} ${hover ? "hover-lift" : ""} ${className}`}>{children}</div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  desc,
  action,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-6 flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
        ) : null}
        <h2 className="font-display text-[1.45rem] font-bold leading-tight text-ink sm:text-[1.7rem]">{title}</h2>
        {desc ? <p className="mt-1.5 max-w-2xl text-[0.9rem] leading-relaxed text-muted">{desc}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ================================================================== *
 * 6. FORM
 * ================================================================== */

export function Field({
  label,
  hint,
  error,
  children,
  required,
  className = "",
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {label ? (
        <span className="mb-1.5 flex items-center gap-1 text-[0.78rem] font-semibold text-ink-700">
          {label}
          {required ? <span className="text-accent">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1.5 flex items-center gap-1.5 text-[0.76rem] font-medium text-danger">
          <Icon.alert size={13} /> {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-[0.76rem] leading-relaxed text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

const FIELD_CLS =
  "w-full rounded-[3px] border-2 border-line bg-surface px-3.5 py-2.5 text-[0.9rem] text-ink placeholder:text-muted-2 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:bg-canvas disabled:text-muted";

export function Input({
  invalid,
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={`${FIELD_CLS} ${invalid ? "border-danger" : ""} ${className}`} {...rest} />;
}

export function Textarea({
  invalid,
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={`${FIELD_CLS} ${invalid ? "border-danger" : ""} ${className}`} {...rest} />;
}

export function Select({
  className = "",
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={`${FIELD_CLS} appearance-none pr-9 ${className}`} {...rest}>
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
        <Icon.chevronDown size={15} />
      </span>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-start gap-2.5 text-left disabled:opacity-50"
    >
      <span
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[2px] border transition-colors ${
          checked ? "border-accent bg-accent text-white" : "border-line bg-surface text-transparent"
        }`}
      >
        <Icon.check size={12} strokeWidth={2.6} />
      </span>
      <span className="text-[0.86rem] leading-snug text-ink-700">{label}</span>
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
        checked ? "border-accent bg-accent" : "border-line bg-canvas-2"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-surface shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

export function Chip({
  children,
  active,
  onClick,
  icon,
  count,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 border-2 px-3 py-1.5 text-[0.74rem] font-semibold uppercase tracking-[0.1em] transition-all ${
        active
          ? "border-ink bg-ink text-white"
          : "border-line bg-surface text-ink-700 hover:border-ink-500 hover:bg-canvas"
      }`}
    >
      {icon}
      {children}
      {typeof count === "number" ? (
        <span className={`tabular text-[0.7rem] ${active ? "text-white/65" : "text-muted-2"}`}>{count}</span>
      ) : null}
    </button>
  );
}

/* ================================================================== *
 * 7. SEKME / TABS
 * ================================================================== */

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { key: string; label: string; count?: number }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <div
      role="tablist"
      className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line"
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            className={`relative shrink-0 px-3.5 py-2.5 text-[0.85rem] font-semibold transition-colors ${
              active ? "text-ink" : "text-muted hover:text-ink-700"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {it.label}
              {typeof it.count === "number" ? (
                <span className="tabular rounded-full bg-canvas-2 px-1.5 py-0.5 text-[0.68rem] text-ink-500">
                  {it.count}
                </span>
              ) : null}
            </span>
            {active ? (
              <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================== *
 * 8. KPI + SAYAÇ
 * ================================================================== */

export function CountUp({
  to,
  duration = 900,
  format,
}: {
  to: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const reduceMotion = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [v, setV] = useState(() => (reduceMotion() ? to : 0));
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (reduceMotion()) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(to * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [to, duration]);
  return <>{format ? format(v) : Math.round(v).toLocaleString("tr-TR")}</>;
}

export function Kpi({
  label,
  value,
  unit,
  delta,
  hint,
  icon,
  spark,
  estimated,
}: {
  label: string;
  value: number | string;
  unit?: string;
  delta?: number;
  hint?: string;
  icon?: ReactNode;
  spark?: number[];
  estimated?: boolean;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.78rem] font-medium leading-snug text-muted">{label}</p>
        {icon ? <span className="text-muted-2">{icon}</span> : null}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="tabular text-[1.7rem] font-semibold leading-none text-ink">
          {typeof value === "number" ? <CountUp to={value} /> : value}
          {unit ? <span className="ml-0.5 text-[1rem] text-muted">{unit}</span> : null}
        </p>
        {typeof delta === "number" ? (
          <span
            className={`tabular mb-0.5 inline-flex items-center gap-0.5 text-[0.76rem] font-semibold ${
              delta >= 0 ? "text-positive" : "text-danger"
            }`}
          >
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
      </div>
      {spark && spark.length > 1 ? (
        <div className="mt-3">
          <Spark data={spark} />
        </div>
      ) : hint ? (
        <p className="mt-2.5 text-[0.76rem] leading-relaxed text-muted">{hint}</p>
      ) : null}
      {estimated ? (
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-warning">
          <Icon.info size={12} /> Tahmini değer · ölçülen değil
        </p>
      ) : null}
    </div>
  );
}

/* ================================================================== *
 * 9. GRAFİKLER (SVG, ölçeklenebilir, okunaklı)
 * ================================================================== */

export function Spark({ data, tone = "accent" }: { data: number[]; tone?: "accent" | "ink" | "positive" }) {
  const max = Math.max(1, ...data);
  const stroke = tone === "ink" ? "#1b2740" : tone === "positive" ? "#0e9f6e" : "#ff4a17";
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * 100},${28 - (v / max) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
      <polyline points={`0,28 ${pts} 100,28`} fill={stroke} fillOpacity="0.08" stroke="none" />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BarChart({
  data,
  labels,
  height = 190,
  formatValue,
  accentLast,
}: {
  data: number[];
  labels: string[];
  height?: number;
  formatValue?: (n: number) => string;
  accentLast?: boolean;
}) {
  const max = Math.max(1, ...data);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((v, i) => {
          const h = Math.max(2, (v / max) * (height - 34));
          const isAccent = accentLast ? i === data.length - 1 : hover === i;
          return (
            <div
              key={i}
              className="group relative flex flex-1 cursor-default flex-col items-center justify-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i ? (
                <div className="anim-rise absolute -top-1 z-10 -translate-y-full rounded-[3px] bg-ink px-2 py-1 text-[0.7rem] font-semibold text-white shadow-lg">
                  {formatValue ? formatValue(v) : v.toLocaleString("tr-TR")}
                </div>
              ) : null}
              <div
                className={`bar-grow w-full rounded-t-[2px] transition-colors ${
                  isAccent ? "bg-accent" : "bg-ink/15 group-hover:bg-accent/60"
                }`}
                style={{ height: h, animationDelay: `${i * 28}ms` }}
              />
              <span className="mt-2 text-[0.66rem] leading-none text-muted">{labels[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AreaLine({
  series,
  labels,
  height = 220,
  formatValue,
}: {
  series: { name: string; data: number[]; color: string }[];
  labels: string[];
  height?: number;
  formatValue?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.data);
  const max = Math.max(1, ...all);
  const W = 100;
  const H = 60;
  const path = (data: number[]) =>
    data
      .map((v, i) => `${i === 0 ? "M" : "L"}${(i / Math.max(1, data.length - 1)) * W},${H - (v / max) * (H - 6)}`)
      .join(" ");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5 text-[0.76rem] font-medium text-ink-500">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const idx = Math.round(((e.clientX - r.left) / r.width) * (labels.length - 1));
            setHover(Math.max(0, Math.min(labels.length - 1, idx)));
          }}
        >
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="#e3e7ed" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
          ))}
          {series.map((s) => (
            <g key={s.name}>
              <path d={`${path(s.data)} L${W},${H} L0,${H} Z`} fill={s.color} fillOpacity="0.07" />
              <path d={path(s.data)} fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          {hover !== null ? (
            <line
              x1={(hover / Math.max(1, labels.length - 1)) * W}
              x2={(hover / Math.max(1, labels.length - 1)) * W}
              y1="0"
              y2={H}
              stroke="#0b1220"
              strokeOpacity="0.35"
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {hover !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-[132px] -translate-x-1/2 rounded-[4px] border border-line bg-surface p-2.5 shadow-lg"
            style={{ left: `${(hover / Math.max(1, labels.length - 1)) * 100}%` }}
          >
            <p className="text-[0.7rem] font-semibold text-muted">{labels[hover]}</p>
            {series.map((s) => (
              <p key={s.name} className="tabular mt-1 flex items-center justify-between gap-3 text-[0.76rem]">
                <span className="inline-flex items-center gap-1.5 text-ink-500">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="font-semibold text-ink">
                  {formatValue ? formatValue(s.data[hover]) : s.data[hover].toLocaleString("tr-TR")}
                </span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex justify-between text-[0.68rem] text-muted-2">
        {labels.map((l, i) => (
          <span key={i} className={labels.length > 10 && i % 2 === 1 ? "hidden sm:inline" : ""}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Funnel({
  steps,
  formatValue,
}: {
  steps: { label: string; value: number; note?: string; measured: boolean }[];
  formatValue?: (n: number) => string;
}) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const w = Math.max(6, (s.value / max) * 100);
        const prev = i > 0 ? steps[i - 1].value : null;
        const rate = prev && prev > 0 ? (s.value / prev) * 100 : null;
        return (
          <li key={s.label}>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-[0.84rem] font-semibold text-ink">
                <span className="tabular text-[0.7rem] text-muted-2">{String(i + 1).padStart(2, "0")}</span>
                {s.label}
                {!s.measured ? (
                  <Badge tone="warning" className="ml-1">
                    ölçülmüyor
                  </Badge>
                ) : null}
              </span>
              <span className="tabular text-[0.95rem] font-semibold text-ink">
                {formatValue ? formatValue(s.value) : s.value.toLocaleString("tr-TR")}
                {rate !== null ? (
                  <span className="ml-2 text-[0.74rem] font-medium text-muted">%{rate.toFixed(1)}</span>
                ) : null}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-canvas-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-ink-700 to-accent transition-[width] duration-700 ease-out"
                style={{ width: `${w}%` }}
              />
            </div>
            {s.note ? <p className="mt-1.5 text-[0.74rem] leading-relaxed text-muted">{s.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function Donut({
  slices,
  size = 148,
  center,
}: {
  slices: { label: string; value: number; color: string }[];
  size?: number;
  center?: { value: string; label: string };
}) {
  const total = Math.max(1, slices.reduce((s, x) => s + x.value, 0));
  const R = 42;
  const C = 2 * Math.PI * R;
  const offsets = slices.reduce<number[]>((acc, s) => {
    const prev = acc.length ? acc[acc.length - 1] + (slices[acc.length - 1].value / total) * C : 0;
    acc.push(prev);
    return acc;
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="#eef0f4" strokeWidth="12" />
          {slices.map((s, i) => {
            const len = (s.value / total) * C;
            const offset = offsets[i] ?? 0;
            const el = (
              <circle
                key={s.label}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="12"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            return el;
          })}
        </svg>
        {center ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="tabular text-[1.35rem] font-semibold leading-none text-ink">{center.value}</span>
            <span className="mt-1 text-[0.68rem] text-muted">{center.label}</span>
          </div>
        ) : null}
      </div>
      <ul className="min-w-[150px] flex-1 space-y-2">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3 text-[0.82rem]">
            <span className="inline-flex items-center gap-2 text-ink-500">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="tabular font-semibold text-ink">
              {((s.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBars({ rows }: { rows: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3.5">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-[0.84rem] font-medium text-ink">{r.label}</span>
            <span className="tabular shrink-0 text-[0.84rem] font-semibold text-ink">
              {r.value.toLocaleString("tr-TR")}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-canvas-2">
            <div
              className="bar-grow h-full rounded-full bg-ink-700"
              style={{ width: `${(r.value / max) * 100}%`, animationDelay: `${i * 60}ms`, transformOrigin: "left" }}
            />
          </div>
          {r.sub ? <p className="mt-1 text-[0.72rem] text-muted">{r.sub}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/* ================================================================== *
 * 10. TABLO
 * ================================================================== */

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`thin-scroll overflow-x-auto rounded-[4px] border-2 border-line bg-surface ${className}`}>
      <table className="w-full min-w-[640px] border-collapse text-[0.86rem]">{children}</table>
    </div>
  );
}

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return (
    <th
      scope="col"
      className={`border-b border-line bg-canvas px-4 py-3 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  right,
  strong,
  className = "",
}: {
  children?: ReactNode;
  right?: boolean;
  strong?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`border-b border-line-soft px-4 py-3 align-middle text-ink-700 last:border-0 ${
        right ? "text-right" : "text-left"
      } ${strong ? "font-semibold text-ink" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  const list = useMemo(() => {
    const out: number[] = [];
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - page) <= 1) out.push(i);
    }
    return out;
  }, [page, pages]);
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Sayfalama">
      <p className="text-[0.78rem] text-muted">
        Sayfa <span className="tabular font-semibold text-ink">{page}</span> /{" "}
        <span className="tabular">{pages}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Önceki
        </Button>
        {list.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && p - list[i - 1] > 1 ? <span className="px-1 text-muted-2">…</span> : null}
            <button
              onClick={() => onPage(p)}
              aria-current={p === page}
              className={`tabular h-8 min-w-8 rounded-[3px] border px-2 text-[0.8rem] font-semibold transition-colors ${
                p === page ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-500 hover:border-ink-500"
              }`}
            >
              {p}
            </button>
          </span>
        ))}
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Sonraki
        </Button>
      </div>
    </nav>
  );
}

/* ================================================================== *
 * 11. DIALOG / TOAST
 * ================================================================== */

export function Dialog({
  open,
  onClose,
  title,
  desc,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  desc?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`anim-rise relative w-full ${width} rounded-t-[2px] border border-line bg-surface shadow-[var(--shadow-pop)] sm:rounded-[4px]`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h3 className="font-display text-[1.1rem] font-bold text-ink">{title}</h3>
            {desc ? <p className="mt-1 text-[0.84rem] leading-relaxed text-muted">{desc}</p> : null}
          </div>
          <IconButton label="Kapat" onClick={onClose}>
            <Icon.x size={16} />
          </IconButton>
        </div>
        {children ? <div className="max-h-[62vh] overflow-y-auto thin-scroll px-6 py-5">{children}</div> : null}
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ToastItem = { id: string; title: string; desc?: string; tone?: Tone };
const ToastCtx = createContext<{ push: (t: Omit<ToastItem, "id">) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="anim-toast pointer-events-auto flex items-start gap-3 rounded-[4px] border border-line bg-surface p-3.5 shadow-[var(--shadow-pop)]"
          >
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                t.tone === "danger"
                  ? "bg-danger-soft text-danger"
                  : t.tone === "warning"
                    ? "bg-warning-soft text-warning"
                    : "bg-positive-soft text-positive"
              }`}
            >
              {t.tone === "danger" || t.tone === "warning" ? <Icon.alert size={13} /> : <Icon.check size={13} strokeWidth={2.4} />}
            </span>
            <div className="min-w-0">
              <p className="text-[0.86rem] font-semibold text-ink">{t.title}</p>
              {t.desc ? <p className="mt-0.5 text-[0.8rem] leading-relaxed text-muted">{t.desc}</p> : null}
            </div>
            <button
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="ml-auto text-muted-2 hover:text-ink"
              aria-label="Bildirimi kapat"
            >
              <Icon.x size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ================================================================== *
 * 12. DURUMLAR: boş / yükleniyor / ortaya çıkma
 * ================================================================== */

export function EmptyState({
  title,
  desc,
  icon,
  action,
}: {
  title: string;
  desc?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[4px] border border-dashed border-line bg-surface px-6 py-14 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-[4px] bg-canvas text-muted">
        {icon ?? <Icon.layers size={22} />}
      </span>
      <p className="font-display text-[1.05rem] font-bold text-ink">{title}</p>
      {desc ? <p className="mt-1.5 max-w-[46ch] text-[0.86rem] leading-relaxed text-muted">{desc}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton h-40 w-full" />
      <div className="space-y-2.5 p-5">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-line-soft">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <div className="skeleton h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-1/3 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
          </div>
          <div className="skeleton h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setSeen(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  const Comp = Tag as React.ElementType;
  return (
    <Comp
      ref={ref as never}
      className={`reveal ${seen ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Comp>
  );
}

/* ================================================================== *
 * 13. QR PANELİ
 * ================================================================== */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function QrSvg({ value, size = 148, tone = "#0b1220" }: { value: string; size?: number; tone?: string }) {
  const n = 25;
  const seed = hashString(value || "DAMPINGVAR");
  const cells: boolean[] = [];
  for (let i = 0; i < n * n; i++) {
    const x = i % n;
    const y = Math.floor(i / n);
    const finder =
      (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    if (finder) {
      const lx = x >= n - 7 ? x - (n - 7) : x;
      const ly = y >= n - 7 ? y - (n - 7) : y;
      const ring = lx === 0 || lx === 6 || ly === 0 || ly === 6;
      const core = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
      cells.push(ring || core);
    } else {
      cells.push(((x * 31 + y * 17 + ((seed >> ((x + y) % 12)) & 7)) * (i + seed)) % 5 < 2);
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={`QR: ${value}`}>
      <rect width={n} height={n} fill="#ffffff" />
      {cells.map((on, i) =>
        on ? <rect key={i} x={i % n} y={Math.floor(i / n)} width="1" height="1" fill={tone} /> : null
      )}
    </svg>
  );
}

export function QrPanel({
  value,
  caption,
  scanning,
  size = 168,
}: {
  value: string;
  caption?: string;
  scanning?: boolean;
  size?: number;
}) {
  return (
    <div className="relative inline-flex flex-col items-center rounded-[4px] border border-line bg-surface p-4">
      <div className="relative overflow-hidden rounded-[3px]">
        <QrSvg value={value} size={size} />
        {scanning ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-full">
            <div className="scanline h-[2px] w-full bg-accent shadow-[0_0_12px_2px_rgba(255,74,23,.55)]" />
          </div>
        ) : null}
      </div>
      {caption ? <p className="tabular mt-3 text-[0.76rem] font-semibold tracking-[0.06em] text-ink-500">{caption}</p> : null}
    </div>
  );
}

/* ================================================================== *
 * 14. ÇEŞİTLİ
 * ================================================================== */

export function Avatar({ name, size = 36, tone = "ink" }: { name: string; size?: number; tone?: "ink" | "accent" }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase("tr-TR"))
    .join("");
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold ${
        tone === "accent" ? "bg-accent-soft text-accent-700" : "bg-ink text-white"
      }`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials || "DV"}
    </span>
  );
}

export function Progress({ value, tone = "accent" }: { value: number; tone?: "accent" | "positive" | "ink" }) {
  const bg = tone === "positive" ? "bg-positive" : tone === "ink" ? "bg-ink" : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-2">
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out ${bg}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function KeyValue({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line-soft">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-4 py-2.5">
          <dt className="text-[0.82rem] text-muted">{k}</dt>
          <dd className="text-right text-[0.86rem] font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DemoTag({ label = "Demo verisi" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-[0.68rem] font-semibold text-warning">
      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
      {label}
    </span>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  icon,
  className = "",
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const map: Record<string, string> = {
    info: "border-[#cddafe] bg-info-soft text-info",
    warning: "border-[#f3ddb4] bg-warning-soft text-warning",
    accent: "border-[#ffd6c7] bg-accent-soft text-accent-700",
    positive: "border-[#c2e9da] bg-positive-soft text-positive",
    danger: "border-[#f3c9c5] bg-danger-soft text-danger",
    neutral: "border-line bg-canvas text-ink-500",
    dark: "border-ink bg-ink text-white",
  };
  return (
    <div className={`flex items-start gap-3 rounded-[4px] border px-4 py-3.5 ${map[tone]} ${className}`}>
      <span className="mt-0.5 shrink-0">{icon ?? <Icon.info size={16} />}</span>
      <div className="min-w-0">
        {title ? <p className="text-[0.86rem] font-bold">{title}</p> : null}
        <div className={`text-[0.84rem] leading-relaxed ${title ? "mt-1" : ""} opacity-90`}>{children}</div>
      </div>
    </div>
  );
}

export function useSectionParam(initial: string) {
  const [section, setSectionState] = useState(() => {
    if (typeof window === "undefined") return initial;
    return new URLSearchParams(window.location.search).get("s") ?? initial;
  });
  const setSection = useCallback((s: string) => {
    setSectionState(s);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (s) url.searchParams.set("s", s);
      else url.searchParams.delete("s");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);
  return [section, setSection] as const;
}

export function useCopy() {
  const toast = useToast();
  return useCallback(
    async (text: string, label = "Panoya kopyalandı") => {
      try {
        await navigator.clipboard.writeText(text);
        toast.push({ title: label, desc: text.slice(0, 64), tone: "positive" });
        return true;
      } catch {
        toast.push({ title: "Kopyalanamadı", desc: "Tarayıcı pano erişimini reddetti.", tone: "warning" });
        return false;
      }
    },
    [toast]
  );
}

export function useId_() {
  return useId();
}

/* ================================================================== *
 * 15. EVRAK DİLİ: MÜHÜR, FİŞ KABUĞU, MÜREKKEP BAŞLIK, KROKİ, ŞERİT
 * ================================================================== */

export function Stamp({
  children,
  tone = "accent",
  className = "",
}: {
  children: ReactNode;
  tone?: "accent" | "ink" | "positive" | "warning";
  className?: string;
}) {
  const color =
    tone === "ink"
      ? "border-ink text-ink"
      : tone === "positive"
        ? "border-positive text-positive"
        : tone === "warning"
          ? "border-warning text-warning"
          : "border-accent text-accent";
  return (
    <span className={`stamp anim-stamp inline-block px-2.5 py-1 font-display text-[0.6rem] font-bold ${color} ${className}`}>
      {children}
    </span>
  );
}

export function ReceiptShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="perforated-top h-3 w-full" />
      <div className="border-x-2 border-line bg-surface px-5 py-4 shadow-[0_18px_50px_rgba(18,33,47,0.12)]">
        {children}
      </div>
      <div className="perforated-bottom h-3 w-full" />
    </div>
  );
}

export function PaperHead({
  eyebrow,
  title,
  note,
  action,
}: {
  eyebrow?: string;
  title: string;
  note?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-5 border-b-2 border-ink pb-4">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="mb-2 text-[0.66rem] font-bold uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
        ) : null}
        <h2 className="font-display text-[clamp(1.6rem,3.4vw,2.4rem)] font-extrabold leading-[1.03] tracking-[-0.03em]">
          {title}
        </h2>
        {note ? <p className="mt-2.5 max-w-xl text-[0.92rem] leading-relaxed text-ink-500">{note}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function MapSketch({ district, city }: { district: string; city: string }) {
  return (
    <div className="relative overflow-hidden border-2 border-line bg-canvas-2">
      <svg viewBox="0 0 480 260" className="h-full w-full" role="img" aria-label={`${district} krokisi`}>
        <rect width="480" height="260" fill="#eae0ce" />
        <g stroke="#12212f" strokeOpacity="0.12" strokeWidth="1">
          {Array.from({ length: 10 }).map((_, i) => <line key={`h${i}`} x1="0" y1={i * 26} x2="480" y2={i * 26} />)}
          {Array.from({ length: 16 }).map((_, i) => <line key={`v${i}`} x1={i * 30} y1="0" x2={i * 30} y2="260" />)}
        </g>
        <path d="M0 168 C 90 150, 150 196, 230 178 S 380 140, 480 158" stroke="#12212f" strokeOpacity="0.45" strokeWidth="9" fill="none" />
        <path d="M120 0 L 138 260" stroke="#12212f" strokeOpacity="0.3" strokeWidth="6" fill="none" />
        <path d="M330 0 L 312 260" stroke="#12212f" strokeOpacity="0.3" strokeWidth="6" fill="none" />
        <circle cx="228" cy="128" r="26" fill="#d6362b" fillOpacity="0.16" />
        <path d="M228 100c-11 0-20 9-20 20 0 15 20 34 20 34s20-19 20-34c0-11-9-20-20-20z" fill="#d6362b" />
        <circle cx="228" cy="120" r="7" fill="#fbf7ef" />
      </svg>
      <div className="absolute bottom-3 left-3 border-2 border-line bg-surface/95 px-3 py-1.5">
        <p className="text-[0.72rem] font-bold">{district}</p>
        <p className="text-[0.62rem] text-muted">{city}</p>
      </div>
    </div>
  );
}

export function Ticker({ items }: { items: string[] }) {
  return (
    <div className="overflow-hidden border-y-2 border-ink bg-ink py-2.5">
      <div className="anim-marquee flex w-max gap-8 whitespace-nowrap">
        {[...items, ...items].map((t, i) => (
          <span key={i} className="flex items-center gap-8 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-surface/80">
            {t} <span className="text-accent">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== *
 * 16. ANİMASYONLU İŞLEM AKIŞI (gamified journey)
 * Her adım yalnızca gerçek bir sistem olayına karşılık geldiğinde
 * "doğrulandı" olarak işaretlenir; aksi halde bekleyen durumda kalır.
 * ================================================================== */

export type JourneyStep = {
  label: string;
  state: "done" | "active" | "pending" | "failed";
  note?: string;
  at?: string;
  verified?: boolean;
};

export function Journey({
  steps,
  orientation = "horizontal",
  caption,
}: {
  steps: JourneyStep[];
  orientation?: "horizontal" | "vertical";
  caption?: string;
}) {
  const activeIdx = steps.findIndex((s) => s.state === "active");
  const vertical = orientation === "vertical";

  return (
    <div>
      <ol
        className={
          vertical
            ? "relative space-y-0 pl-1"
            : "no-scrollbar flex gap-0 overflow-x-auto pb-2"
        }
        aria-label={caption ?? "İşlem akışı"}
      >
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const dot =
            s.state === "done"
              ? "border-positive bg-positive text-surface"
              : s.state === "active"
                ? "border-accent bg-accent text-surface pulse-ring"
                : s.state === "failed"
                  ? "border-danger bg-danger-soft text-danger"
                  : "border-line bg-canvas-2 text-muted-2";
          const icon =
            s.state === "done" ? <Icon.check size={13} strokeWidth={2.6} />
            : s.state === "failed" ? <Icon.x size={13} strokeWidth={2.4} />
            : s.state === "active" ? <span className="tabular text-[0.66rem] font-bold">{i + 1}</span>
            : <span className="tabular text-[0.66rem] font-bold">{i + 1}</span>;

          if (vertical) {
            return (
              <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0">
                {!last ? (
                  <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 bg-line" aria-hidden="true">
                    {s.state === "done" ? <span className="block h-full w-full bg-positive/60" /> : null}
                  </span>
                ) : null}
                <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${dot}`}>
                  {icon}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className={`text-[0.9rem] font-semibold ${s.state === "pending" ? "text-muted" : "text-ink"}`}>{s.label}</p>
                    {s.verified ? (
                      <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-positive">
                        <Icon.verified size={11} /> doğrulandı
                      </span>
                    ) : s.state === "done" || s.state === "active" ? (
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-2">kaydedildi</span>
                    ) : null}
                    {s.at ? <span className="tabular ml-auto text-[0.72rem] text-muted-2">{s.at}</span> : null}
                  </div>
                  {s.note ? <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">{s.note}</p> : null}
                </div>
              </li>
            );
          }

          return (
            <li key={s.label} className="flex shrink-0 items-center">
              <div className="flex w-[150px] flex-col items-center text-center">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${dot}`}>{icon}</span>
                <p className={`mt-2 text-[0.78rem] font-semibold leading-snug ${s.state === "pending" ? "text-muted" : "text-ink"}`}>
                  {s.label}
                </p>
                {s.note ? <p className="mt-1 text-[0.7rem] leading-snug text-muted">{s.note}</p> : null}
                {s.at ? <p className="tabular mt-1 text-[0.66rem] text-muted-2">{s.at}</p> : null}
              </div>
              {!last ? (
                <svg width="46" height="12" viewBox="0 0 46 12" className="mx-0.5 -mt-6 shrink-0" aria-hidden="true">
                  <line
                    x1="0" y1="6" x2="42" y2="6"
                    stroke={s.state === "done" ? "#1f6f4a" : "#d9ccb4"}
                    strokeWidth="2"
                    className={s.state === "done" ? "flow-line" : undefined}
                    strokeLinecap="round"
                  />
                  <path d="M40 2 L45 6 L40 10" fill="none" stroke={s.state === "done" ? "#1f6f4a" : "#d9ccb4"} strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : null}
            </li>
          );
        })}
      </ol>
      {activeIdx >= 0 && steps[activeIdx]?.note ? (
        <p className="mt-3 border-l-4 border-accent bg-accent-soft/50 px-3 py-2 text-[0.82rem] text-ink-700">
          <strong className="font-semibold">Sıradaki adım:</strong> {steps[activeIdx].note}
        </p>
      ) : null}
    </div>
  );
}

/* ================================================================== *
 * 17. VİDEO / STORYBOARD MODÜLÜ
 * Gerçek video üretimi bağlı DEĞİLDİR: bu bileşen animasyonlu
 * storyboard + altyazı + yazılı adım alternatifi sunar ve bunu
 * açıkça etiketler. Ses otomatik oynatılmaz.
 * ================================================================== */

export type StoryScene = { at: string; visual: string; caption: string; image?: string | null };

export function VideoModule({
  title,
  durationSec,
  scenes,
  captions,
  lang,
  onLangChange,
  poster,
  steps,
}: {
  title: string;
  durationSec: number;
  scenes: StoryScene[];
  captions?: Record<string, string[]>;
  lang?: string;
  onLangChange?: (l: string) => void;
  poster?: string;
  steps?: string[];
}) {
  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(0);
  const [showSteps, setShowSteps] = useState(false);
  const perScene = Math.max(1.2, durationSec / Math.max(1, scenes.length));

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setIdx((p) => {
        if (p + 1 >= scenes.length) {
          window.clearInterval(id);
          setPlaying(false);
          return p;
        }
        return p + 1;
      });
    }, perScene * 1000);
    return () => window.clearInterval(id);
  }, [playing, perScene, scenes.length]);

  const scene = scenes[Math.min(idx, scenes.length - 1)];
  const captionText = captions?.[lang ?? "tr"]?.[idx] ?? scene?.caption ?? "";
  const progress = scenes.length > 1 ? (idx / (scenes.length - 1)) * 100 : 100;
  const elapsed = Math.min(durationSec, idx * perScene);

  return (
    <div className="card overflow-hidden p-0">
      <div className="relative aspect-video w-full overflow-hidden bg-ink">
        {/* FAZ 12D — sahne görseli varsa o GÖSTERİLİR; yoksa poster (video kapak). */}
        {scene?.image ? (
          <>
            <img src={scene.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/35 to-ink/60" />
          </>
        ) : poster ? (
          <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
        ) : null}
        <div className="grain absolute inset-0" />

        {/* storyboard sahnesi */}
        <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="border-2 border-surface/40 px-2 py-1 text-[0.6rem] font-bold uppercase tracking-[0.16em] text-surface/85">
              Storyboard · sahne {idx + 1}/{scenes.length}
            </span>
            <span className="tabular text-[0.68rem] text-surface/70">{scene?.at}</span>
          </div>

          <div key={idx} className="anim-rise max-w-[52ch]">
            <p className="font-display text-[clamp(1rem,2.4vw,1.5rem)] font-bold leading-tight text-surface">
              {scene?.visual}
            </p>
          </div>

          <div>
            <p className="min-h-[2.6em] border-l-2 border-accent pl-3 text-[0.86rem] leading-relaxed text-surface/90">
              {captionText}
            </p>
            <div className="mt-3 h-1 w-full overflow-hidden bg-surface/20">
              <div className="h-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t-2 border-line px-4 py-3">
        <Button
          size="sm"
          variant={playing ? "secondary" : "primary"}
          onClick={() => {
            if (!playing && idx >= scenes.length - 1) setIdx(0);
            setPlaying((p) => !p);
          }}
          icon={playing ? <span className="flex gap-0.5"><span className="block h-3 w-1 bg-current" /><span className="block h-3 w-1 bg-current" /></span> : <Icon.play size={14} />}
        >
          {playing ? "Duraklat" : "Oynat"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setPlaying(false); setIdx((p) => Math.max(0, p - 1)); }} disabled={idx === 0}>
          Önceki
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setPlaying(false); setIdx((p) => Math.min(scenes.length - 1, p + 1)); }} disabled={idx >= scenes.length - 1}>
          Sonraki
        </Button>
        <span className="tabular text-[0.76rem] text-muted">{elapsed.toFixed(0)} / {durationSec} sn</span>

        {captions && onLangChange ? (
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[0.7rem] uppercase tracking-[0.12em] text-muted">Altyazı</span>
            {Object.keys(captions).map((l) => (
              <button
                key={l}
                onClick={() => onLangChange(l)}
                aria-pressed={l === lang}
                className={`border-2 px-2 py-1 text-[0.68rem] font-bold uppercase ${
                  l === lang ? "border-ink bg-ink text-surface" : "border-line text-muted hover:border-ink-500"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-t-2 border-line-soft px-4 py-3">
        <button
          onClick={() => setShowSteps((s) => !s)}
          aria-expanded={showSteps}
          className="flex w-full items-center justify-between gap-3 text-left text-[0.82rem] font-semibold text-ink-700 hover:text-accent"
        >
          <span className="inline-flex items-center gap-2"><Icon.list size={14} /> Yazılı adım adım anlatım (video alternatifi)</span>
          <Icon.chevronDown size={14} className={`transition-transform ${showSteps ? "rotate-180" : ""}`} />
        </button>
        {showSteps ? (
          <ol className="mt-3 space-y-2">
            {(steps ?? scenes.map((s) => `${s.at} — ${s.visual}: ${s.caption}`)).map((s, i) => (
              <li key={s} className="flex gap-2.5 text-[0.84rem] leading-relaxed text-muted">
                <span className="tabular shrink-0 font-semibold text-accent">{String(i + 1).padStart(2, "0")}</span>
                {s}
              </li>
            ))}
          </ol>
        ) : null}
        <p className="mt-3 border-t border-dashed border-line pt-3 text-[0.72rem] leading-relaxed text-muted">
          {title} · Bu modül animasyonlu storyboard ve altyazı gösterir. Gerçek video üretimi/oynatımı bağlı değildir;
          ses otomatik oynatılmaz.
        </p>
      </div>
    </div>
  );
}

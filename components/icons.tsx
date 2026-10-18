import type { ReactNode } from "react";

/**
 * DampingVar ikon seti — elle çizilmiş inline SVG.
 * Bu modül bilinçli olarak "use client" İÇERMEZ: böylece hem sunucu hem istemci
 * bileşenleri <Icon.x /> biçiminde doğrudan render edebilir.
 */

type IconProps = { size?: number; className?: string; strokeWidth?: number };

function S({
  size = 18,
  className = "",
  strokeWidth = 1.6,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const Icon = {
  search: (p: IconProps) => (
    <S {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.4 15.4 4.1 4.1" />
    </S>
  ),
  pin: (p: IconProps) => (
    <S {...p}>
      <path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </S>
  ),
  qr: (p: IconProps) => (
    <S {...p}>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h3v3h-3zM19.5 19.5h1M14 20.5h2.5" />
    </S>
  ),
  bonus: (p: IconProps) => (
    <S {...p}>
      <path d="M4 9.5h16V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19V9.5Z" />
      <path d="M3 6.5h18v3H3zM12 6.5v14" />
      <path d="M12 6.5S10.8 3 8.9 3a2 2 0 0 0 0 3.5H12Zm0 0s1.2-3.5 3.1-3.5a2 2 0 0 1 0 3.5H12Z" />
    </S>
  ),
  users: (p: IconProps) => (
    <S {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c.6-3.1 2.9-4.8 5.5-4.8s4.9 1.7 5.5 4.8" />
      <path d="M16 5.6a3 3 0 0 1 0 5.6M17.6 14.9c2 .6 3.3 2.2 3.7 4.6" />
    </S>
  ),
  chart: (p: IconProps) => (
    <S {...p}>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16.5V12M12 16.5V7.5M16 16.5v-6" />
    </S>
  ),
  spark: (p: IconProps) => (
    <S {...p}>
      <path d="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2 10.3 12.4 4.5 10.7 10.3 9 12 3.2Z" />
      <path d="M18.5 4v2.6M17.2 5.3h2.6" />
    </S>
  ),
  megaphone: (p: IconProps) => (
    <S {...p}>
      <path d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5H8l7 4.5V6L8 10.5H5.5A1.5 1.5 0 0 0 4 12" />
      <path d="M18 9.2a4 4 0 0 1 0 5.6M8 15v4.5" />
    </S>
  ),
  receipt: (p: IconProps) => (
    <S {...p}>
      <path d="M6 3h12v18l-2.4-1.6L13.2 21 12 19.4 10.8 21l-2.4-1.6L6 21V3Z" />
      <path d="M9.5 8h5M9.5 12h5" />
    </S>
  ),
  settings: (p: IconProps) => (
    <S {...p}>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1" />
    </S>
  ),
  bell: (p: IconProps) => (
    <S {...p}>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" />
      <path d="M10.2 18.5a2 2 0 0 0 3.6 0" />
    </S>
  ),
  bookmark: (p: IconProps) => (
    <S {...p}>
      <path d="M6.5 3.5h11v17l-5.5-4-5.5 4v-17Z" />
    </S>
  ),
  store: (p: IconProps) => (
    <S {...p}>
      <path d="M4 9.5h16V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19V9.5Z" />
      <path d="M3.2 9.5 5 4h14l1.8 5.5a2.6 2.6 0 0 1-4.8 1.6 2.6 2.6 0 0 1-4.4 0 2.6 2.6 0 0 1-4.4 0 2.6 2.6 0 0 1-4.2-1.6Z" />
      <path d="M10 20.5v-5h4v5" />
    </S>
  ),
  calendar: (p: IconProps) => (
    <S {...p}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
    </S>
  ),
  check: (p: IconProps) => (
    <S {...p}>
      <path d="m4.8 12.6 4.6 4.6L19.4 7.2" />
    </S>
  ),
  x: (p: IconProps) => (
    <S {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </S>
  ),
  arrowRight: (p: IconProps) => (
    <S {...p}>
      <path d="M4.5 12h15M13.5 6l6 6-6 6" />
    </S>
  ),
  chevronDown: (p: IconProps) => (
    <S {...p}>
      <path d="m6 9.5 6 6 6-6" />
    </S>
  ),
  chevronRight: (p: IconProps) => (
    <S {...p}>
      <path d="m9.5 6 6 6-6 6" />
    </S>
  ),
  plus: (p: IconProps) => (
    <S {...p}>
      <path d="M12 5v14M5 12h14" />
    </S>
  ),
  filter: (p: IconProps) => (
    <S {...p}>
      <path d="M3.5 6h17M6.5 12h11M10 18h4" />
    </S>
  ),
  grid: (p: IconProps) => (
    <S {...p}>
      <rect x="4" y="4" width="7" height="7" rx="1.2" />
      <rect x="13" y="4" width="7" height="7" rx="1.2" />
      <rect x="4" y="13" width="7" height="7" rx="1.2" />
      <rect x="13" y="13" width="7" height="7" rx="1.2" />
    </S>
  ),
  list: (p: IconProps) => (
    <S {...p}>
      <path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" />
    </S>
  ),
  shield: (p: IconProps) => (
    <S {...p}>
      <path d="M12 3.2 5 6v6c0 4.3 3 7.3 7 8.8 4-1.5 7-4.5 7-8.8V6l-7-2.8Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </S>
  ),
  globe: (p: IconProps) => (
    <S {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 2.4 14 0 17M12 3.5c-2.4 2.4-2.4 14 0 17" />
    </S>
  ),
  copy: (p: IconProps) => (
    <S {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" />
    </S>
  ),
  share: (p: IconProps) => (
    <S {...p}>
      <circle cx="17.5" cy="6" r="2.5" />
      <circle cx="6.5" cy="12" r="2.5" />
      <circle cx="17.5" cy="18" r="2.5" />
      <path d="m8.8 10.8 6.4-3.6M8.8 13.2l6.4 3.6" />
    </S>
  ),
  flag: (p: IconProps) => (
    <S {...p}>
      <path d="M6 21V4M6 4.8h11l-2 3.4 2 3.4H6" />
    </S>
  ),
  clock: (p: IconProps) => (
    <S {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </S>
  ),
  eye: (p: IconProps) => (
    <S {...p}>
      <path d="M2.8 12S6 6.2 12 6.2 21.2 12 21.2 12 18 17.8 12 17.8 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </S>
  ),
  cursor: (p: IconProps) => (
    <S {...p}>
      <path d="m5.5 3.8 13 6.6-5.6 1.7-1.7 5.6-5.7-13.9Z" />
    </S>
  ),
  verified: (p: IconProps) => (
    <S {...p}>
      <path d="m12 3.3 2.3 1.7 2.8-.2 1 2.7 2.3 1.6-1 2.7 1 2.7-2.3 1.6-1 2.7-2.8-.2L12 20.7l-2.3-1.7-2.8.2-1-2.7L3.6 15l1-2.7-1-2.7 2.3-1.6 1-2.7 2.8.2L12 3.3Z" />
      <path d="m9.3 12 2 2 3.4-3.8" />
    </S>
  ),
  menu: (p: IconProps) => (
    <S {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </S>
  ),
  logout: (p: IconProps) => (
    <S {...p}>
      <path d="M15 4.5h3.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M11 8 7 12l4 4M7 12h9" />
    </S>
  ),
  upload: (p: IconProps) => (
    <S {...p}>
      <path d="M12 16V4.5M8 8.5l4-4 4 4" />
      <path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" />
    </S>
  ),
  video: (p: IconProps) => (
    <S {...p}>
      <rect x="3" y="6" width="12.5" height="12" rx="2" />
      <path d="m15.5 12 5.5-3.2v6.4L15.5 12Z" />
    </S>
  ),
  image: (p: IconProps) => (
    <S {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 17.5 4.8-4.4 3.4 3 2.6-2.2 4.2 3.6" />
    </S>
  ),
  edit: (p: IconProps) => (
    <S {...p}>
      <path d="M4.5 19.5h4L20 8a2.1 2.1 0 0 0-3-3L5.5 16.5l-1 3Z" />
      <path d="m15.5 6.5 2 2" />
    </S>
  ),
  trash: (p: IconProps) => (
    <S {...p}>
      <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l1 13h9l1-13M10.5 11v5.5M13.5 11v5.5" />
    </S>
  ),
  play: (p: IconProps) => (
    <S {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m10.2 8.8 5 3.2-5 3.2V8.8Z" />
    </S>
  ),
  info: (p: IconProps) => (
    <S {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.2M12 7.9h.01" />
    </S>
  ),
  alert: (p: IconProps) => (
    <S {...p}>
      <path d="M12 4.2 21 19.5H3L12 4.2Z" />
      <path d="M12 10v4M12 16.8h.01" />
    </S>
  ),
  lock: (p: IconProps) => (
    <S {...p}>
      <rect x="4.8" y="10.5" width="14.4" height="9.5" rx="2" />
      <path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" />
    </S>
  ),
  external: (p: IconProps) => (
    <S {...p}>
      <path d="M14 4.5h5.5V10M19 5l-8 8" />
      <path d="M18 14.5v4A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4" />
    </S>
  ),
  refresh: (p: IconProps) => (
    <S {...p}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4.5V10h-5.5" />
    </S>
  ),
  tag: (p: IconProps) => (
    <S {...p}>
      <path d="M11.6 3.5H20v8.4l-9 9-8.4-8.4 9-9Z" />
      <circle cx="16.2" cy="7.8" r="1.4" />
    </S>
  ),
  building: (p: IconProps) => (
    <S {...p}>
      <path d="M4 20.5V6.2L12 3.5l8 2.7v14.3" />
      <path d="M9 20.5v-5h6v5M8 9h2M14 9h2M8 12.5h2M14 12.5h2M3 20.5h18" />
    </S>
  ),
  layers: (p: IconProps) => (
    <S {...p}>
      <path d="m12 3.5 8.5 4.3L12 12 3.5 7.8 12 3.5Z" />
      <path d="m3.5 12.2 8.5 4.3 8.5-4.3M3.5 16.4l8.5 4.3 8.5-4.3" />
    </S>
  ),
};

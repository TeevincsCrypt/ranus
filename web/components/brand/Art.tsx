"use client";

import { useId, type ReactNode } from "react";

/* Clay-style illustrations (pure SVG, no image assets). Each draws a darker "side" offset under its face for depth. */

interface ArtProps {
  size?: number | string;
  className?: string;
}

function Svg({ size = 96, className, children }: ArtProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      {children}
    </svg>
  );
}

function useArtId() {
  return useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

const Ground = () => <ellipse cx="50" cy="94" rx="28" ry="4.5" fill="#000" opacity="0.08" />;

export function CoinArt(props: ArtProps) {
  const id = useArtId();
  return (
    <Svg {...props}>
      <defs>
        <radialGradient id={`${id}a`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fff3a6" />
          <stop offset="0.45" stopColor="#ffcf3d" />
          <stop offset="1" stopColor="#e89a0c" />
        </radialGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9890a" />
          <stop offset="1" stopColor="#a8630a" />
        </linearGradient>
      </defs>
      <Ground />
      <circle cx="51" cy="53" r="38" fill={`url(#${id}b)`} />
      <circle cx="50" cy="47" r="38" fill={`url(#${id}a)`} />
      <circle cx="50" cy="47" r="28.5" fill="none" stroke="#e39a12" strokeWidth="3" opacity="0.65" />
      <text x="51" y="64" textAnchor="middle" fontSize="44" fontWeight="900" fill="#b86f05" opacity="0.45" style={{ fontFamily: "var(--font-display), sans-serif" }}>
        $
      </text>
      <text x="50" y="62.5" textAnchor="middle" fontSize="44" fontWeight="900" fill="#e69511" style={{ fontFamily: "var(--font-display), sans-serif" }}>
        $
      </text>
      <ellipse cx="35" cy="28" rx="11" ry="6" fill="#fff" opacity="0.55" transform="rotate(-35 35 28)" />
    </Svg>
  );
}

export function SproutArt(props: ArtProps) {
  const id = useArtId();
  return (
    <Svg {...props}>
      <defs>
        <radialGradient id={`${id}s`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#d9a37a" />
          <stop offset="0.5" stopColor="#a8693f" />
          <stop offset="1" stopColor="#6e3d1d" />
        </radialGradient>
        <radialGradient id={`${id}l`} cx="30%" cy="30%" r="90%">
          <stop offset="0" stopColor="#d6f78e" />
          <stop offset="0.5" stopColor="#7cc93e" />
          <stop offset="1" stopColor="#3f8e1f" />
        </radialGradient>
      </defs>
      <Ground />
      <circle cx="50" cy="68" r="24" fill={`url(#${id}s)`} />
      <circle cx="41" cy="66" r="2.6" fill="#5a2f14" opacity="0.45" />
      <circle cx="58" cy="76" r="2" fill="#5a2f14" opacity="0.45" />
      <circle cx="47" cy="80" r="1.6" fill="#5a2f14" opacity="0.45" />
      <ellipse cx="41" cy="56" rx="8" ry="4" fill="#fff" opacity="0.3" transform="rotate(-30 41 56)" />
      <path d="M50 47C50 38 51 32 55 26" fill="none" stroke="#4c9a27" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M55 28C62 15 79 14 86 21C80 33 65 37 55 28Z" fill={`url(#${id}l)`} />
      <path d="M52 36C44 25 29 24 22 30C28 41 43 43 52 36Z" fill={`url(#${id}l)`} />
      <ellipse cx="68" cy="21" rx="6" ry="2.4" fill="#fff" opacity="0.45" transform="rotate(-15 68 21)" />
    </Svg>
  );
}

export function ShieldArt(props: ArtProps) {
  const id = useArtId();
  const shield = "M50 8L84 21V45C84 68 69 83 50 91C31 83 16 68 16 45V21Z";
  return (
    <Svg {...props}>
      <defs>
        <radialGradient id={`${id}a`} cx="32%" cy="25%" r="85%">
          <stop offset="0" stopColor="#c7d3ff" />
          <stop offset="0.45" stopColor="#6f8cff" />
          <stop offset="1" stopColor="#3550e0" />
        </radialGradient>
      </defs>
      <Ground />
      <path d={shield} fill="#2337a8" transform="translate(2.5 4.5)" />
      <path d={shield} fill={`url(#${id}a)`} />
      <path d="M34 49L45 60L67 37" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="33" cy="25" rx="10" ry="5" fill="#fff" opacity="0.45" transform="rotate(-25 33 25)" />
    </Svg>
  );
}

export function PieArt(props: ArtProps) {
  const id = useArtId();
  const slices = [
    { d: "M50 46L50 12A34 34 0 0 1 71.86 72.04Z", face: "#ff8fd0", side: "#c94f98", shift: "translate(3.8 -1.4)" },
    { d: "M50 46L71.86 72.04A34 34 0 0 1 18.05 57.63Z", face: "#ffd84a", side: "#cf960f", shift: "" },
    { d: "M50 46L18.05 57.63A34 34 0 0 1 50 12Z", face: "#6f8cff", side: "#3a4fc4", shift: "" },
  ];
  return (
    <Svg {...props}>
      <defs>
        <radialGradient id={`${id}h`} cx="32%" cy="25%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <Ground />
      {slices.map((s) => (
        <g key={s.face} transform={s.shift}>
          <path d={s.d} fill={s.side} transform="translate(0 7)" />
          <path d={s.d} fill={s.face} stroke="#fff" strokeOpacity="0.6" strokeWidth="1.2" strokeLinejoin="round" />
        </g>
      ))}
      <circle cx="50" cy="46" r="34" fill={`url(#${id}h)`} pointerEvents="none" />
    </Svg>
  );
}

export function BarsArt(props: ArtProps) {
  const id = useArtId();
  const bars = [
    { x: 14, y: 58, h: 30, top: "#ffe36e", bottom: "#f2b705", side: "#c48b04" },
    { x: 39, y: 38, h: 50, top: "#ffb3e2", bottom: "#ee6fbf", side: "#b84790" },
    { x: 64, y: 16, h: 72, top: "#9db0ff", bottom: "#4d6cf5", side: "#2f45b8" },
  ];
  return (
    <Svg {...props}>
      <defs>
        {bars.map((b, i) => (
          <linearGradient key={b.top} id={`${id}${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={b.top} />
            <stop offset="1" stopColor={b.bottom} />
          </linearGradient>
        ))}
      </defs>
      <Ground />
      {bars.map((b, i) => (
        <g key={b.top}>
          <rect x={b.x + 3} y={b.y + 3} width="21" height={b.h} rx="7" fill={b.side} />
          <rect x={b.x} y={b.y} width="21" height={b.h} rx="7" fill={`url(#${id}${i})`} />
          <rect x={b.x + 4} y={b.y + 4} width="5" height={Math.max(b.h - 18, 8)} rx="2.5" fill="#fff" opacity="0.4" />
        </g>
      ))}
    </Svg>
  );
}

export function GaugeArt(props: ArtProps) {
  const arcs = [
    { d: "M14 64A36 36 0 0 1 32 32.82", face: "#3fd18a", side: "#1f9a5d" },
    { d: "M32 32.82A36 36 0 0 1 68 32.82", face: "#ffcf3d", side: "#cf960f" },
    { d: "M68 32.82A36 36 0 0 1 86 64", face: "#ff6b6b", side: "#c73e3e" },
  ];
  return (
    <Svg {...props}>
      <Ground />
      <g fill="none" strokeWidth="15" strokeLinecap="round">
        {arcs.map((a) => (
          <path key={a.face} d={a.d} stroke={a.side} transform="translate(0 6)" />
        ))}
        {arcs.map((a) => (
          <path key={`${a.face}f`} d={a.d} stroke={a.face} />
        ))}
      </g>
      <path d="M50 66L36 38" stroke="#161616" strokeWidth="6" strokeLinecap="round" />
      <circle cx="50" cy="68" r="10" fill="#0b0b0b" />
      <circle cx="50" cy="66" r="10" fill="#2a2a2a" />
      <ellipse cx="46.5" cy="62.5" rx="3.5" ry="2" fill="#fff" opacity="0.35" />
    </Svg>
  );
}

export function BubbleArt(props: ArtProps) {
  const id = useArtId();
  const bubble = "M20 18H80A12 12 0 0 1 92 30V58A12 12 0 0 1 80 70H48L30 86V70H20A12 12 0 0 1 8 58V30A12 12 0 0 1 20 18Z";
  return (
    <Svg {...props}>
      <defs>
        <radialGradient id={`${id}a`} cx="30%" cy="25%" r="85%">
          <stop offset="0" stopColor="#f1ecff" />
          <stop offset="0.5" stopColor="#b7a1ff" />
          <stop offset="1" stopColor="#7d5cf0" />
        </radialGradient>
      </defs>
      <Ground />
      <path d={bubble} fill="#5a3cc9" transform="translate(2.5 4.5)" />
      <path d={bubble} fill={`url(#${id}a)`} />
      <circle cx="33" cy="44" r="5.5" fill="#fff" />
      <circle cx="50" cy="44" r="5.5" fill="#fff" />
      <circle cx="67" cy="44" r="5.5" fill="#fff" />
      <ellipse cx="25" cy="26" rx="8" ry="3.5" fill="#fff" opacity="0.5" transform="rotate(-12 25 26)" />
    </Svg>
  );
}

export function BoltArt(props: ArtProps) {
  const id = useArtId();
  const bolt = "M60 6L20 54H45L36 94L80 41H55Z";
  return (
    <Svg {...props}>
      <defs>
        <linearGradient id={`${id}a`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#fff5a3" />
          <stop offset="0.45" stopColor="#ffd21f" />
          <stop offset="1" stopColor="#ff9a1a" />
        </linearGradient>
      </defs>
      <Ground />
      <path d={bolt} fill="#c86a0c" transform="translate(3 4)" strokeLinejoin="round" />
      <path d={bolt} fill={`url(#${id}a)`} stroke="#ffe680" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M57 14L30 48" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
    </Svg>
  );
}

export const ART = {
  coin: CoinArt,
  sprout: SproutArt,
  shield: ShieldArt,
  pie: PieArt,
  bars: BarsArt,
  gauge: GaugeArt,
  bubble: BubbleArt,
  bolt: BoltArt,
} as const;

export type ArtName = keyof typeof ART;

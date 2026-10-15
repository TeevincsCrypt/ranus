"use client";

import { useId } from "react";

/** The RANUS "R": one continuous rounded stroke — stem, bowl and leg — extruded in navy. */
const R_PATH = "M12 93V34A23 23 0 0 1 35 11H67C83 11 93 21 93 33C93 46 83 55 68 55H54C46 55 41 61 41 69C41 79 51 85 70 85H91";
const DEPTH = [1, 2, 3, 4, 5, 6, 7, 8];

function useSvgId() {
  return useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

export function RanusMark({ size = 40, className, title }: { size?: number | string; className?: string; title?: string }) {
  const id = useSvgId();
  return (
    <svg
      viewBox="-6 -2 112 112"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}f`} x1="10" y1="96" x2="92" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2a5296" />
          <stop offset="0.5" stopColor="#3b86c5" />
          <stop offset="1" stopColor="#56c8ee" />
        </linearGradient>
        <linearGradient id={`${id}r`} x1="10" y1="96" x2="92" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4c8fd0" />
          <stop offset="1" stopColor="#a8eefc" />
        </linearGradient>
        <filter id={`${id}s`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <g fill="none" strokeWidth="19" strokeLinejoin="round">
        <path d={R_PATH} stroke="#5b6478" opacity="0.28" transform="translate(-4 7)" filter={`url(#${id}s)`} />
        <g stroke="#1a1462">
          {DEPTH.map((i) => (
            <path key={i} d={R_PATH} transform={`translate(${i * 0.4} ${i})`} />
          ))}
        </g>
        <path d={R_PATH} stroke={`url(#${id}r)`} />
        <path d={R_PATH} stroke={`url(#${id}f)`} strokeWidth="15" />
      </g>
    </svg>
  );
}

export function RanusLogo({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <span className={`ranus-logo ${className ?? ""}`}>
      <RanusMark size={size} />
      <span className="ranus-wordmark">RANUS</span>
    </span>
  );
}

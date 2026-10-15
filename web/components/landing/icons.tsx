export function ArrowIcon({ direction, size = 22 }: { direction: "left" | "right" | "up-right"; size?: number }) {
  const rotate = direction === "left" ? 180 : direction === "up-right" ? -45 : 0;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 5.5V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

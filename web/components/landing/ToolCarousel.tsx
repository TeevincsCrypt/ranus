"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { ART } from "@/components/brand/Art";
import { TOOL_THEMES } from "@/lib/brand";
import { ArrowIcon } from "./icons";

/** Tilted card carousel of the seven MCP tools: the active card faces front, its neighbours lean out. */
export function ToolCarousel() {
  const [index, setIndex] = useState(0);
  const count = TOOL_THEMES.length;
  const go = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count]);
  const active = TOOL_THEMES[index];

  return (
    <div
      className="carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="RANUS tools"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
    >
      <button type="button" className="round-btn" onClick={() => go(-1)} aria-label="Previous tool">
        <ArrowIcon direction="left" />
      </button>

      <div className="carousel-stage">
        {TOOL_THEMES.map((t, i) => {
          let offset = i - index;
          if (offset > count / 2) offset -= count;
          if (offset < -count / 2) offset += count;
          const pos = offset === 0 ? "center" : offset === -1 ? "left" : offset === 1 ? "right" : offset < 0 ? "far-left" : "far-right";
          const Art = ART[t.art];
          return (
            <article
              key={t.tool}
              className={`tool-tile pos-${pos}`}
              style={{ "--tile-bg": t.bg, "--tile-ink": t.ink } as CSSProperties}
              aria-hidden={offset !== 0}
              onClick={Math.abs(offset) === 1 ? () => go(offset) : undefined}
            >
              <Art className="tile-art" size={128} />
              <span className="tile-side-title">{t.title}</span>
              <div className="tile-main">
                <h3>{t.title}</h3>
                <p>{t.blurb}</p>
                <code>{t.tool}</code>
              </div>
            </article>
          );
        })}
      </div>

      <button type="button" className="round-btn" onClick={() => go(1)} aria-label="Next tool">
        <ArrowIcon direction="right" />
      </button>

      <p className="carousel-count" aria-live="polite">
        <span className="sr-only">
          {active.title}: {active.blurb}{" "}
        </span>
        {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
      </p>
    </div>
  );
}

import React, { useEffect, useMemo, useRef } from "react";
import { speechBatches } from "./speech.mjs";

export default function HighlightedScript({ text, activeRange }) {
  const containerRef = useRef(null);

  const pieces = useMemo(() => {
    const result = [];
    let cursor = 0;

    for (const batch of speechBatches(text)) {
      // Keep the exact whitespace and paragraph breaks in the original script.
      if (batch.start > cursor) {
        result.push({
          text: text.slice(cursor, batch.start),
          start: cursor,
          spoken: false,
        });
      }
      result.push({ ...batch, spoken: true });
      cursor = batch.end;
    }

    if (cursor < text.length) {
      result.push({ text: text.slice(cursor), start: cursor, spoken: false });
    }
    return result;
  }, [text]);

  useEffect(() => {
    const container = containerRef.current;
    const highlighted = container?.querySelector(".spoken-active");
    if (!highlighted) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    container.scrollTo({
      top: Math.max(0, highlighted.offsetTop - container.clientHeight * 0.35),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [activeRange?.start]);

  return (
    <article ref={containerRef} className="reading-text highlighted-script">
      {pieces.map((piece) =>
        piece.spoken ? (
          <span
            key={piece.start}
            className={
              activeRange?.start === piece.start
                ? "spoken-batch spoken-active"
                : "spoken-batch"
            }
          >
            {piece.text}
          </span>
        ) : (
          <React.Fragment key={piece.start}>{piece.text}</React.Fragment>
        ),
      )}
    </article>
  );
}

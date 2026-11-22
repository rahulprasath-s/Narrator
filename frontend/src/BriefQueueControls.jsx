import React from "react";
import { Play, SkipBack, SkipForward, Square } from "lucide-react";

export function BriefQueueStart({ label, disabled, onStart, onResume }) {
  return (
    <div className="brief-queue-controls">
      <button className="new-button" disabled={disabled} onClick={onStart}>
        <Play size={14} />
        {label}
      </button>
      {onResume && (
        <button className="new-button" disabled={disabled} onClick={onResume}>
          Resume brief
        </button>
      )}
    </div>
  );
}

export function BriefQueueControls({
  index,
  total,
  onPrevious,
  onNext,
  onStop,
}) {
  return (
    <div className="brief-queue-controls" role="group" aria-label="Brief queue">
      <span role="status">
        Story {index + 1} of {total}
      </span>
      <button
        className="icon-button"
        aria-label="Previous story"
        title="Previous story"
        onClick={onPrevious}
        disabled={index === 0}
      >
        <SkipBack size={16} />
      </button>
      <button
        className="icon-button"
        aria-label="Next story"
        title="Next story"
        onClick={onNext}
        disabled={index + 1 === total}
      >
        <SkipForward size={16} />
      </button>
      <button
        className="icon-button"
        aria-label="Stop brief"
        title="Stop brief"
        onClick={onStop}
      >
        <Square size={14} />
      </button>
    </div>
  );
}

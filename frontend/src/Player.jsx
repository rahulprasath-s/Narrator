import React, { useState } from "react";
import { Pause, Play, Settings2, Square } from "lucide-react";
import { clock, wordCount } from "./speech.mjs";

export default function Player({ text, speech }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const duration = Math.max(
    1,
    Math.round((wordCount(text) / (150 * speech.rate)) * 60),
  );
  const fraction = text.length ? speech.position / text.length : 0;
  const hasVoice = speech.voices.length > 0 && speech.supported;
  return (
    <div className="audio-player">
      <div className="player-main">
        <button
          className={`listen-button ${speech.status === "playing" ? "is-playing" : ""}`}
          onClick={speech.toggle}
          disabled={!hasVoice || !text.trim()}
        >
          {speech.status === "playing" ? (
            <Pause size={16} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
          {speech.status === "playing"
            ? "Pause"
            : speech.status === "paused"
              ? "Resume"
              : "Listen"}
        </button>
        <div className="playback-track">
          <div className="track-line">
            <span style={{ width: `${fraction * 100}%` }} />
          </div>
          <div className="track-times">
            <span>{clock(fraction * duration)}</span>
            <span>~{clock(duration)}</span>
          </div>
        </div>
        <button
          className="icon-button"
          onClick={speech.stop}
          disabled={speech.status === "idle"}
          aria-label="Stop playback"
          title="Stop"
        >
          <Square size={14} />
        </button>
        <button
          className={`speed-button ${settingsOpen ? "selected" : ""}`}
          onClick={() => setSettingsOpen(!settingsOpen)}
          aria-expanded={settingsOpen}
          aria-label="Voice and speed settings"
        >
          {speech.rate.toFixed(1)}× <Settings2 size={14} />
        </button>
      </div>
      {settingsOpen && (
        <div className="voice-settings">
          <label>
            Voice
            <select
              value={speech.voiceName}
              disabled={!hasVoice}
              onChange={(event) => speech.setVoiceName(event.target.value)}
            >
              {!hasVoice && <option>Google voices unavailable</option>}
              {speech.voices.map((voice) => (
                <option value={voice.name} key={voice.name}>
                  {voice.label}
                </option>
              ))}
            </select>
          </label>
          <label className="speed-setting">
            Speed <output>{speech.rate.toFixed(1)}×</output>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={speech.rate}
              onChange={(event) => speech.setRate(Number(event.target.value))}
            />
          </label>
          <p>
            Changing voice or speed stops playback. Press Listen to restart.
            Time shown is an estimate.
          </p>
        </div>
      )}
      {!hasVoice && (
        <p className="voice-notice">
          {speech.supported
            ? "Google online voices aren’t available in this browser. Try Google Chrome."
            : "This browser doesn’t support read-aloud playback."}
        </p>
      )}
      {speech.error && (
        <p className="voice-notice error-text" role="alert">
          {speech.error}
        </p>
      )}
      {speech.timingMode === "estimated" && (
        <p className="voice-notice">
          Highlight timing is estimated because this voice isn’t reporting word
          positions.
        </p>
      )}
    </div>
  );
}

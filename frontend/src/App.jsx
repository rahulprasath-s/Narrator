import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudUpload,
  Copy,
  FileText,
  FolderOpen,
  Headphones,
  Layers3,
  LoaderCircle,
  Menu,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  WandSparkles,
  X,
} from "lucide-react";
import { api } from "./api.mjs";
import { SAMPLE } from "./sample.mjs";
import { clock, readingMinutes, wordCount } from "./speech.mjs";
import { useSpeech } from "./useSpeech.js";
import HighlightedScript from "./HighlightedScript.jsx";

const activeStates = ["queued", "processing"];
const formatDate = (date) =>
  new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

function Wave({ animated = false, className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`wave ${animated ? "animated" : ""} ${className}`}
    >
      {[20, 34, 55, 28, 76, 48, 92, 62, 40, 72, 52, 30, 18].map((height, i) => (
        <i
          key={i}
          style={{ "--bar-height": `${height}%`, "--delay": `${i * 0.09}s` }}
        />
      ))}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = bodyOverflow;
      previous?.focus();
    };
  }, []);
  function onKeyDown(event) {
    if (event.key === "Escape") onClose();
    if (event.key !== "Tab") return;
    const focusable = [
      ...dialog.current.querySelectorAll(
        "button:not(:disabled), input, select, textarea, a[href]",
      ),
    ];
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0],
      last = focusable.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === dialog.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        document.activeElement === dialog.current)
    ) {
      event.preventDefault();
      first.focus();
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={onKeyDown}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Player({ text, speech }) {
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
            Changing voice or speed restarts playback. Time shown is an
            estimate.
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
    </div>
  );
}

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("studio");
  const [mode, setMode] = useState("pdf");
  const [draft, setDraft] = useState("");
  const [draftName, setDraftName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [connection, setConnection] = useState("connecting");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [outputTab, setOutputTab] = useState("script");
  const [preferences, setPreferences] = useState({
    first_page: 1,
    last_page: 0,
    remove_footnotes: true,
  });
  const fileInput = useRef(null);
  const toastTimer = useRef(null);
  const active =
    selectedId === "sample"
      ? SAMPLE
      : documents.find((doc) => doc.id === selectedId);
  const busy = active && activeStates.includes(active.state);
  const script = active?.script || "";
  const speech = useSpeech(view === "studio" && !busy ? script : "");

  useEffect(() => {
    speech.stop();
  }, [selectedId, speech.stop]);

  const updateDocument = useCallback((doc) => {
    setDocuments((previous) => {
      const index = previous.findIndex((item) => item.id === doc.id);
      if (index < 0) return [doc, ...previous];
      return previous.map((item) => (item.id === doc.id ? doc : item));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api("/status"), api("/documents")]).then(
      ([status, history]) => {
        if (cancelled) return;
        setConnection(
          status.status === "fulfilled"
            ? status.value.configured
              ? "ready"
              : "unconfigured"
            : "offline",
        );
        if (history.status === "fulfilled") setDocuments(history.value);
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedId || selectedId === "sample" || !busy) return;
    let cancelled = false,
      timer;
    const controller = new AbortController();
    async function poll() {
      try {
        const doc = await api(`/documents/${selectedId}`, {
          signal: controller.signal,
        });
        if (cancelled) return;
        updateDocument(doc);
        if (activeStates.includes(doc.state)) timer = setTimeout(poll, 1400);
      } catch (failure) {
        if (cancelled) return;
        setError(failure.message);
        timer = setTimeout(poll, 4000);
      }
    }
    timer = setTimeout(poll, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [selectedId, Boolean(busy), updateDocument]);

  function flash(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  }
  function select(doc) {
    setSelectedId(doc.id);
    setOutputTab("script");
    setView("studio");
    setError("");
    setMobileNav(false);
  }
  function newDocument() {
    setSelectedId(null);
    setView("studio");
    setDraft("");
    setDraftName("");
    setError("");
    setOutputTab("script");
    setMobileNav(false);
  }
  function trySample() {
    select(SAMPLE);
    flash("A prewritten example. No credits used.");
  }

  async function upload(file) {
    if (!file || uploading) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose a PDF file, or use Paste text for a passage.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError(
        "This PDF is larger than twenty megabytes. Try a smaller document.",
      );
      return;
    }
    setUploading(true);
    setError("");
    setMode("pdf");
    const body = new FormData();
    body.append("file", file);
    for (const [key, value] of Object.entries(preferences))
      body.append(key, value);
    try {
      const doc = await api("/documents", { method: "POST", body });
      updateDocument(doc);
      select(doc);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submitText(event) {
    event.preventDefault();
    if (!draft.trim() || uploading) return;
    setUploading(true);
    setError("");
    try {
      const doc = await api("/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: draft,
          name: draftName || "Untitled thought",
        }),
      });
      updateDocument(doc);
      select(doc);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setUploading(false);
    }
  }

  async function retry() {
    if (!active || uploading) return;
    setUploading(true);
    setError("");
    try {
      const doc = await api(`/documents/${active.id}/retry`, {
        method: "POST",
      });
      updateDocument(doc);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setUploading(false);
    }
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(script);
      flash("Copied. Take the idea with you.");
    } catch {
      flash(
        "Clipboard unavailable. Select the translation and copy it manually.",
      );
    }
  }

  function downloadScript() {
    const url = URL.createObjectURL(
      new Blob([script], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(active?.name || "narrator")
      .replace(/\.pdf$/i, "")
      .replace(/[^\p{L}\p{N}\s._-]/gu, "")
      .slice(0, 100)}-translation.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "nav-open" : ""}`}>
        <button
          className="brand"
          onClick={newDocument}
          aria-label="Narrator home"
        >
          <span className="brand-symbol">
            <AudioLines size={25} strokeWidth={2.2} />
          </span>
          <span>
            narrator<span className="brand-period">.</span>
          </span>
        </button>
        <div className="workspace-label">YOUR PERSONAL STUDIO</div>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${view === "studio" ? "active" : ""}`}
            onClick={() => {
              setView("studio");
              setMobileNav(false);
            }}
          >
            <Layers3 size={18} />
            The studio
            <span className="nav-active-dot" />
          </button>
          <button
            className={`nav-item ${view === "library" ? "active" : ""}`}
            onClick={() => {
              setView("library");
              setMobileNav(false);
            }}
          >
            <BookOpen size={18} />
            Your library<span className="nav-count">{documents.length}</span>
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="recent-label">
          RECENTLY ON YOUR MIND{" "}
          <span>{documents.length > 0 && documents.length}</span>
        </div>
        <div className="sidebar-documents">
          {documents.slice(0, 5).map((doc) => (
            <button
              className={`sidebar-document ${selectedId === doc.id ? "selected" : ""}`}
              key={doc.id}
              onClick={() => select(doc)}
            >
              {activeStates.includes(doc.state) ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <FileText size={15} />
              )}
              <span>{doc.name.replace(/\.pdf$/i, "")}</span>
            </button>
          ))}
          {!documents.length && (
            <p className="sidebar-empty">
              A fresh page.
              <br />
              Your documents will appear here.
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="thought-card">
            <span className="tiny-star">✦</span>
            <p>
              A little less jargon.
              <br />
              <em>A lot more meaning.</em>
            </p>
            <Wave />
          </div>
          <button className="sidebar-help" onClick={() => setModal("help")}>
            <CircleHelp size={16} />A little guidance
            <ArrowUpRight size={14} />
          </button>
          <div className="workspace-profile">
            <div className="profile-symbol">
              <Headphones size={17} />
            </div>
            <div>
              <strong>Your workspace</strong>
              <span>Made for curious minds</span>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{view === "studio" ? "The studio" : "Your library"}</strong>
          </div>
          <div className="topbar-actions">
            <button className="how-button" onClick={() => setModal("help")}>
              How it works <ArrowUpRight size={13} />
            </button>
            <button className="new-button" onClick={newDocument}>
              <Plus size={15} />
              New document
            </button>
          </div>
        </header>
        <main>
          {view === "studio" ? (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span className="eyebrow-spark">✦</span> BIG IDEAS. A LITTLE
                    MORE HUMAN.
                  </div>
                  <h1>
                    A clearer way
                    <br />
                    to <em>understand.</em>
                  </h1>
                  <p>
                    Turn the text you wrestle with into words you can follow.
                    <br className="wide-break" /> The same depth. A whole new
                    way to listen.
                  </p>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orb-glow" />
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="hero-orb">
                    <Wave />
                  </div>
                  <span className="floating-note note-one">
                    <Sparkles size={12} />A little clarity
                  </span>
                  <span className="floating-note note-two">
                    ideas, out loud <AudioLines size={13} />
                  </span>
                  <span className="art-star star-one">✦</span>
                  <span className="art-star star-two">✧</span>
                </div>
              </section>

              <div className="section-label">
                <span>LET’S MAKE SENSE OF IT</span>
                <span>
                  <ShieldCheck size={13} />
                  Your words. Your pace.
                </span>
              </div>
              <div className="studio-grid">
                <section className="source-card card">
                  <div className="card-heading">
                    <h2>
                      <span className="step-number">01</span>Start with an idea
                    </h2>
                    <button
                      className="icon-button"
                      onClick={() => setModal("settings")}
                      title="Document settings"
                      aria-label="Document settings"
                    >
                      <Settings2 size={16} />
                    </button>
                  </div>
                  <div
                    className="source-tabs"
                    role="tablist"
                    aria-label="Source type"
                  >
                    <button
                      role="tab"
                      aria-selected={mode === "pdf"}
                      className={mode === "pdf" ? "selected" : ""}
                      onClick={() => setMode("pdf")}
                    >
                      <FileText size={14} />
                      Upload PDF
                    </button>
                    <button
                      role="tab"
                      aria-selected={mode === "text"}
                      className={mode === "text" ? "selected" : ""}
                      onClick={() => setMode("text")}
                    >
                      <BookOpen size={14} />
                      Paste text
                    </button>
                  </div>
                  {mode === "pdf" ? (
                    <div
                      className={`dropzone ${dragging ? "dragging" : ""}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragging(false);
                        upload(event.dataTransfer.files[0]);
                      }}
                    >
                      <div className="upload-icon">
                        {uploading ? (
                          <LoaderCircle size={28} className="spin" />
                        ) : (
                          <CloudUpload size={29} strokeWidth={1.6} />
                        )}
                        <span className="icon-spark">✦</span>
                      </div>
                      <h3>
                        Drop a little
                        <br />
                        complexity here.
                      </h3>
                      <p>
                        A paper, a chapter, a big idea.
                        <br />
                        We’ll help you find the thread.
                      </p>
                      <button
                        className="upload-button"
                        disabled={uploading}
                        onClick={() => fileInput.current?.click()}
                      >
                        {uploading ? "Opening your document…" : "Choose a PDF"}
                        {!uploading && <ArrowUpRight size={15} />}
                      </button>
                      <span className="file-limit">
                        or drag and drop · PDF up to 20 MB
                      </span>
                      <input
                        ref={fileInput}
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={(event) => upload(event.target.files?.[0])}
                        hidden
                      />
                    </div>
                  ) : (
                    <form className="paste-form" onSubmit={submitText}>
                      <label className="sr-only" htmlFor="thought-title">
                        Title
                      </label>
                      <input
                        id="thought-title"
                        className="thought-title"
                        placeholder="Give your idea a title (optional)"
                        maxLength={120}
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                      />
                      <label className="sr-only" htmlFor="source-text">
                        Source passage
                      </label>
                      <textarea
                        id="source-text"
                        placeholder="Paste the passage you want to understand…"
                        maxLength={40000}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                      />
                      <span className="character-count">
                        {draft.length.toLocaleString()} / 40,000 characters
                      </span>
                      <button
                        className="upload-button"
                        disabled={!draft.trim() || uploading}
                      >
                        {uploading ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <WandSparkles size={15} />
                        )}
                        Make it clear
                        <ArrowRight size={15} />
                      </button>
                    </form>
                  )}
                  {active && (
                    <div className="current-document">
                      <div
                        className={`file-icon ${active.kind === "text" ? "text-file" : ""}`}
                      >
                        <FileText size={18} />
                      </div>
                      <div>
                        <strong>{active.name}</strong>
                        <span>
                          {active.id === "sample"
                            ? "Prewritten example"
                            : active.kind === "pdf"
                              ? "PDF document"
                              : "Text passage"}
                          {active.source &&
                            ` · ${wordCount(active.source).toLocaleString()} words`}
                        </span>
                      </div>
                      {active.state === "ready" ? (
                        <CheckCheck size={16} className="document-check" />
                      ) : busy ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : null}
                    </div>
                  )}
                  <div className="source-footer">
                    <ShieldCheck size={13} />
                    <span>
                      Uploads are translated with Claude using your API credits.
                    </span>
                  </div>
                </section>

                <section
                  className={`output-card card ${script ? "has-script" : ""}`}
                  aria-label="Translation"
                >
                  <div className="card-heading">
                    <h2>
                      <span className="step-number">02</span>A fresh perspective
                    </h2>
                    <span className="ear-tag">
                      <Headphones size={11} />
                      MADE FOR THE EAR
                    </span>
                  </div>
                  {active && (script || active.source) && (
                    <div
                      className="output-tabs"
                      role="tablist"
                      aria-label="Reading view"
                    >
                      <button
                        role="tab"
                        aria-selected={outputTab === "script"}
                        className={outputTab === "script" ? "selected" : ""}
                        onClick={() => setOutputTab("script")}
                      >
                        Spoken version
                      </button>
                      <button
                        role="tab"
                        aria-selected={outputTab === "source"}
                        className={outputTab === "source" ? "selected" : ""}
                        onClick={() => setOutputTab("source")}
                      >
                        Original text
                      </button>
                      <span>
                        {outputTab === "script" &&
                          script &&
                          `~${readingMinutes(script)} min read`}
                      </span>
                    </div>
                  )}
                  {!active && (
                    <div className="output-empty">
                      <div className="empty-sound">
                        <div className="sound-halo" />
                        <Wave />
                      </div>
                      <h3>
                        Good ideas deserve
                        <br />
                        <em>a clear voice.</em>
                      </h3>
                      <p>
                        Your translation will appear here.
                        <br />
                        Ready to read. Even better to hear.
                      </p>
                      <button className="sample-button" onClick={trySample}>
                        See a little magic <Sparkles size={13} />
                      </button>
                      <span className="sample-hint">
                        Try a sample. No credits needed.
                      </span>
                    </div>
                  )}
                  {busy && (
                    <div className="processing-state" role="status">
                      <Wave animated />
                      <strong>
                        {active.state === "queued"
                          ? "Your idea is up next."
                          : active.source
                            ? "Finding the thread…"
                            : "Getting to know your document…"}
                      </strong>
                      <p>{active.stage}</p>
                      <div className="processing-track">
                        <span
                          style={{ width: `${Math.max(3, active.progress)}%` }}
                        />
                      </div>
                      <span className="processing-note">
                        Keeping the nuance. Making room for clarity.
                      </span>
                    </div>
                  )}
                  {active?.state === "error" && (
                    <div className="generation-error" role="alert">
                      <CircleHelp size={22} />
                      <h3>A little pause in the story.</h3>
                      <p>{active.error}</p>
                      <button
                        className="upload-button"
                        onClick={retry}
                        disabled={uploading}
                      >
                        <RotateCcw size={14} />
                        Try again
                      </button>
                    </div>
                  )}
                  {active &&
                    !busy &&
                    (outputTab === "source" ? active.source : script) &&
                    (outputTab === "source" ? (
                      <article
                        className="reading-text"
                        key={`${active.id}-source`}
                      >
                        {active.source
                          .split(/\n\s*\n/)
                          .map((paragraph, index) => (
                            <p key={index}>{paragraph}</p>
                          ))}
                      </article>
                    ) : (
                      <HighlightedScript
                        key={`${active.id}-script`}
                        text={script}
                        activeRange={speech.activeRange}
                      />
                    ))}
                  {active && !busy && active.state !== "ready" && script && (
                    <p className="partial-notice">
                      This is a partial translation. Retry to continue.
                    </p>
                  )}
                  {script && !busy && (
                    <div className="result-footer">
                      <div className="script-tools">
                        <span>
                          <Sparkles size={12} />
                          {wordCount(script).toLocaleString()} words, a little
                          clearer
                        </span>
                        <div>
                          <button
                            className="icon-button"
                            onClick={copyScript}
                            title="Copy translation"
                            aria-label="Copy translation"
                          >
                            <Copy size={15} />
                          </button>
                          <button
                            className="icon-button"
                            onClick={downloadScript}
                            title="Download text"
                            aria-label="Download translation"
                          >
                            <ArrowDownToLine size={16} />
                          </button>
                        </div>
                      </div>
                      <Player key={active.id} text={script} speech={speech} />
                    </div>
                  )}
                  {!script && !busy && (
                    <div className="empty-player">
                      <span className="empty-play">
                        <Play size={12} fill="currentColor" />
                      </span>
                      <span>Your next “oh, I get it” moment.</span>
                      <Wave />
                    </div>
                  )}
                </section>
              </div>
              {error && (
                <div className="error-banner" role="alert">
                  <CircleHelp size={16} />
                  <span>{error}</span>
                  <button
                    className="icon-button"
                    onClick={() => setError("")}
                    aria-label="Dismiss error"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
              <div className="studio-note">
                <span className={`connection-dot ${connection}`} />
                <span>
                  {connection === "ready"
                    ? "Claude connected. Your studio is ready."
                    : connection === "unconfigured"
                      ? "Add your Claude credentials to connect generation."
                      : connection === "offline"
                        ? "Python API offline. You can still explore the sample."
                        : "Connecting to your studio…"}
                </span>
                <span className="studio-note-right">
                  Thoughtfully translated. Never flattened.
                </span>
              </div>

              {active?.warnings?.length > 0 && (
                <details className="review-details">
                  <summary>
                    <ShieldCheck size={14} />
                    Source notes & cleanup
                    <ChevronDown size={14} />
                  </summary>
                  <div>
                    {active.warnings.map((warning, i) => (
                      <p key={i}>{warning}</p>
                    ))}
                    {active.removed?.length > 0 && (
                      <>
                        <h3>Removed lines · {active.removed.length}</h3>
                        {active.removed.map((line, i) => (
                          <p className="removed-line" key={i}>
                            <span>
                              Page {line.page} · {line.reason}
                            </span>
                            {line.text}
                          </p>
                        ))}
                      </>
                    )}
                  </div>
                </details>
              )}

              <section className="principles">
                <div className="principles-heading">
                  <span className="eyebrow">
                    A LITTLE THOUGHT BEHIND EVERY WORD
                  </span>
                  <h2>
                    Clarity, <em>without cutting corners.</em>
                  </h2>
                </div>
                <div className="principle-grid">
                  <div>
                    <span className="principle-icon purple">
                      <Layers3 size={18} />
                    </span>
                    <h3>The depth stays.</h3>
                    <p>
                      The argument, the nuance, the tension.
                      <br />
                      Everything that makes an idea matter.
                    </p>
                  </div>
                  <div>
                    <span className="principle-icon peach">
                      <Sparkles size={18} />
                    </span>
                    <h3>The abstract gets real.</h3>
                    <p>
                      Everyday examples give unfamiliar
                      <br />
                      concepts somewhere to land.
                    </p>
                  </div>
                  <div>
                    <span className="principle-icon green">
                      <Headphones size={18} />
                    </span>
                    <h3>Made to move with you.</h3>
                    <p>
                      Natural sentences and a human pace.
                      <br />A conversation you can follow.
                    </p>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <section className="library-view">
              <div className="eyebrow">GOOD IDEAS, WITHIN REACH</div>
              <h1>
                Your <em>library.</em>
              </h1>
              <p className="library-intro">
                A little collection of things you’re making sense of.
              </p>
              {documents.length ? (
                <div className="library-grid">
                  {documents.map((doc) => (
                    <button
                      className="library-card"
                      onClick={() => select(doc)}
                      key={doc.id}
                    >
                      <div className="library-card-top">
                        <div className="file-icon">
                          <FileText size={23} />
                        </div>
                        <ArrowUpRight size={18} />
                      </div>
                      <h2>{doc.name.replace(/\.pdf$/i, "")}</h2>
                      <span>
                        {formatDate(doc.created_at)} ·{" "}
                        {doc.state === "ready"
                          ? `${readingMinutes(doc.script)} min listening`
                          : doc.state === "error"
                            ? "Needs attention"
                            : "In progress"}
                      </span>
                      <div className="library-state">
                        <span
                          className={`connection-dot ${doc.state === "ready" ? "ready" : ""}`}
                        />
                        {doc.state === "ready" ? "Ready to revisit" : doc.stage}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="library-empty">
                  <FolderOpen size={38} strokeWidth={1} />
                  <h2>Room for your next big idea.</h2>
                  <p>
                    Your translated documents will live here during this server
                    session.
                  </p>
                  <button className="upload-button" onClick={newDocument}>
                    Open the studio
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
              <p className="library-footnote">
                Documents are held in memory on your Python server. Download
                translations you want to keep.
              </p>
            </section>
          )}
          <footer className="main-footer">
            <span>MADE FOR CURIOUS MINDS.</span>
            <span>
              Less friction. More understanding.{" "}
              <span className="footer-star">✦</span>
            </span>
          </footer>
        </main>
      </div>

      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {modal === "help" && (
        <Modal
          title="A clearer path to understanding."
          onClose={() => setModal(null)}
        >
          <p className="modal-intro">
            A small studio for the ideas that deserve a second listen.
          </p>
          <div className="help-step">
            <span>01</span>
            <div>
              <h3>Bring the idea.</h3>
              <p>
                Upload a text-based PDF or paste a passage. PDF extraction
                happens locally on your Python server.
              </p>
            </div>
          </div>
          <div className="help-step">
            <span>02</span>
            <div>
              <h3>Find the thread.</h3>
              <p>
                Claude rewrites your passage for listening, with instructions to
                preserve the argument and its nuance. Generation uses your API
                credits.
              </p>
            </div>
          </div>
          <div className="help-step">
            <span>03</span>
            <div>
              <h3>Read it. Hear it. Get it.</h3>
              <p>
                Listen through one of your three Google browser voices, adjust
                the pace, or download the text. Review against the original when
                accuracy matters.
              </p>
            </div>
          </div>
          <p className="modal-footnote">
            Generated scripts and PDF cleanup can make mistakes. Scanned pages
            need OCR, which this version does not provide.
          </p>
          <button
            className="upload-button"
            onClick={() => {
              setModal(null);
              trySample();
            }}
          >
            Try the sample
            <Sparkles size={15} />
          </button>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal
          title="Make room for your preferences."
          onClose={() => setModal(null)}
        >
          <p className="modal-intro">
            These settings apply to your next PDF upload.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (
                preferences.last_page !== 0 &&
                preferences.last_page < preferences.first_page
              )
                return;
              setModal(null);
              flash("Reading preferences saved for your next upload.");
            }}
          >
            <div className="page-range">
              <label>
                First page
                <input
                  type="number"
                  min="1"
                  required
                  value={preferences.first_page}
                  onChange={(event) =>
                    setPreferences({
                      ...preferences,
                      first_page: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Last page
                <input
                  type="number"
                  min="0"
                  required
                  value={preferences.last_page}
                  onChange={(event) =>
                    setPreferences({
                      ...preferences,
                      last_page: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <p className="field-hint">
              Set the last page to 0 for the end of the PDF. Up to 100 pages,
              using physical PDF page numbers.
            </p>
            {preferences.last_page !== 0 &&
              preferences.last_page < preferences.first_page && (
                <p className="error-text">
                  The last page must come after the first page.
                </p>
              )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={preferences.remove_footnotes}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    remove_footnotes: event.target.checked,
                  })
                }
              />
              <div>
                <strong>Leave the footnotes behind</strong>
                <span>
                  Remove likely notes using font size and position. You can
                  review removed lines afterward.
                </span>
              </div>
            </label>
            <button className="upload-button">
              Save preferences
              <Check size={15} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

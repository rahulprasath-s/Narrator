# Narrator

**Complex ideas, made for listening.**

Narrator turns demanding writing and saved AI news summaries into a focused reading and listening experience. Bring a philosophical passage, an academic paper, or a daily news brief, then follow it at your own pace.

The aim is clarity without losing the thinking behind an idea. Narrator asks Claude to preserve arguments, qualifications, and important distinctions while replacing unnecessary jargon with everyday language and concrete examples. The result is written for spoken delivery, with shorter sentences and natural transitions.

## From documents to understanding

Upload a text-based PDF to begin translation automatically, or paste a passage directly. PDF extraction happens locally, using layout and font-size rules to identify likely headers, footers, page numbers, and footnotes. The extracted source and removed lines remain available for review.

The React studio brings the original text, spoken translation, and playback controls into one quiet workspace. Longer documents are translated in sections, and failed translation jobs can resume from completed sections. Translations can be copied or downloaded to keep.

PDF cleanup is heuristic, and generated explanations can make mistakes. Scanned PDFs require OCR, which this version does not provide. The original source remains the reference for checking an interpretation.

## Your daily AI brief

Narrator connects to the Notion database populated by [AI-Daily-Brief](https://github.com/rahulprasath-s/AI-Daily-Brief). Choose a date to browse its ranked stories in a table, inspect summary and reading statuses, and open the original articles.

Select a story to read its saved summary and listen to it. Article extraction and summarization happen in AI-Daily-Brief; Narrator reads the results without sending those summaries to Claude again. Stories with pending, failed, or unavailable summaries retain their status rather than being presented as finished briefings.

## Free speech, native to your Mac

Listening uses the built-in macOS voices **Rishi** and **Samantha**, with short previews so you can choose the voice you prefer. A small native helper renders speech on the Mac running Narrator's Python server. The browser plays the resulting recording instead of selecting a speech voice itself.

- Continuous playback with pause and resume.
- Seven-word highlighting driven by native word timestamps and the audio clock.
- A draggable word-position bar and forward/back controls for seeking within the recording.
- Adjustable speed and voice switching that preserves the reading position.

Speech needs no paid TTS service, speech API key, or additional model download. This native playback path requires macOS and Apple command-line tools. Document rewriting still uses the configured Claude API and its credits.

Documents and recordings are cached temporarily on the Python server, not stored as a permanent library. Download translations you want to retain.

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

## Free, local neural speech

Listening uses **Luna** and **Hugo** from [KittenTTS Nano](https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8), a compact fifteen-million-parameter model running on the Python server's CPU. Preview either voice before listening. The browser plays a generated recording, so voice selection works consistently across Chrome and Safari.

Open a spoken script or a saved news summary, choose a voice, and click **Generate audio**. Narrator prepares the recording on demand and starts playback. Switching voices stops playback and keeps your reading position. Click **Generate audio** again to hear the newly selected voice.

- Continuous playback with pause and resume.
- Seven-word highlighting driven by the audio clock and model-predicted phoneme timings mapped to the original words. Highlight groups do not split playback into separate clips.
- A draggable word-position bar and forward/back controls that seek within the same recording.
- Adjustable playback speed without regenerating speech.

The approximately twenty-five-megabyte model is downloaded once and cached locally in an ignored model directory. Speech inference is free and runs offline after that download, without a speech API key, GPU, or PyTorch. Word timings are predictions for listening navigation, not forced alignment. Document rewriting still uses the configured Claude API and its credits.

The downloaded model remains cached between sessions. Uploaded documents, translations, and generated recordings are held temporarily in memory on the Python server, not stored as a permanent library. Download translations you want to retain.

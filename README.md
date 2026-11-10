# Narrator

**Complex ideas, made for listening.**

Academic and philosophical writing often asks readers to work through unfamiliar terminology, long sentences, and layers of abstraction before reaching the idea underneath. Narrator aims to make those ideas easier to follow by turning dense passages into clear, natural spoken explanations.

The goal is more than a shorter summary. Narrator is designed to preserve the thinking: the central claim, the reasons behind it, the objections, and the qualifications that give an argument its meaning. It replaces unnecessary jargon with everyday language and grounds abstract concepts in familiar examples, while keeping important distinctions intact.

## Written for the ear

An explanation that reads well on a page can still be difficult to follow aloud. Narrator shapes its scripts around shorter sentences, clear references, natural transitions, and a pace that lets one thought lead into the next. Citations and visual formatting give way to spoken attribution and continuous prose.

Users can review a generated script alongside the original, then listen through browser-based speech with a choice of three available Google voices and playback speeds. The aim is to make demanding material easier to revisit, whether someone prefers listening, wants another way into a difficult passage, or needs time to sit with an unfamiliar argument.

## From documents to understanding

The React listening studio brings uploading, reading, and listening into one space, with soft gradients, a focused reading pane, and a compact audio player. Drop in a PDF to begin translation automatically, or paste a passage. A Python API handles extraction and Claude requests, keeping credentials on the server. A prewritten sample lets visitors explore the interface without using API credits.

PDF extraction happens locally and identifies likely headers, footers, page numbers, and footnotes before rewriting. Cleanup is based on page layout and typography rather than language-model inference. Removed text remains available for review, because stripping away clutter should not silently strip away meaning. Longer documents are translated in sections; failed jobs can resume from completed sections. Documents stay in server memory for the current session, and translations can be downloaded to keep.

Narrator is a work in progress. Its direction is simple: help people engage with difficult writing while preserving what makes it worth understanding. Generated explanations and document cleanup remain open to review; the source text is always the reference for checking an interpretation.

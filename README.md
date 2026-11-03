# Narrator

Turn dense academic and philosophical passages into clear spoken narratives without losing the argument. A local web app with a Node.js server and no third-party dependencies.

## Run

Requires Node.js 22 or later.

```sh
cp .env.example .env
# Add your OpenAI API key to .env.
npm start
```

Open http://127.0.0.1:3000. The sample, editor, text export, and browser read-aloud work without an API key. New script generation requires a valid key and API credits. Set `OPENAI_MODEL` to a Responses-compatible text model available to your account; the default is `gpt-5.4-mini`. Set `PORT` to change the local port.

## Use

Paste source text or import a plain `.txt` file, up to forty thousand characters. Select **Make it listenable**, then edit, copy, download, or listen to the generated script. Playback uses your browser's speech synthesis, with pause, stop, and speed controls. Available voices and playback quality depend on your browser and operating system. This version exports text, not audio files.

The generation prompt privately deconstructs the argument and then reconstructs it for listening. It requires everyday examples, preserves objections and uncertainty, and returns only the script. It treats commands embedded in source material as data. Generated work still needs human review for fidelity; prompt instructions cannot guarantee philosophical accuracy. The server rejects incomplete responses and common non-spoken formatting rather than presenting truncated text as finished.

## Data and architecture

`server.mjs` serves the app and proxies generation to the [OpenAI Responses API](https://developers.openai.com/api/docs/guides/text). `prompt.mjs` holds the translation contract. `public/` contains the browser UI. The API key stays in the server environment. Source text is sent to OpenAI only when generating, with `store: false`; provider retention policies still apply. Browser speech voices may use an operating-system or remote speech service. Narrator does not persist source text or scripts; refreshing loses the current session. Download anything you want to keep.

The server binds to loopback, restricts request hosts and origins, and allows one generation at a time. It is intended for local use. Public hosting would require authentication, per-user limits, and deployment-specific security configuration.

## Verify

```sh
npm test
```

Tests exercise the real HTTP routes against a mocked provider: request validation, key isolation, prompt delivery, successful script extraction, provider failures, formatting rejection, and incomplete responses. Live generation requires your key and is not covered by mocked tests.

import base64
import streamlit as st

def render_player(script: str)-> None:
    if not script.strip():
        return
    
    encoded_script = base64.b64encode(
        script.encode("utf-8")    
    ).decode("ascii")

    player_html = """
    <!doctype html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <style>
            :root {
                color-scheme: light dark;
            }

            body {
                font-family: sans-serif;
                margin: 0;
                padding: 8px;
            }

            button {
                padding: 10px 16px;
                margin-right: 8px;
                cursor: pointer;
                border: 1px solid #8886;
                border-radius: 8px;
            }

            #play {
                background: #e63b50;
                border-color: #e63b50;
                color: white;
                font-weight: 600;
            }

            summary {
                cursor: pointer;
                padding: 8px 0;
                font-size: 14px;
            }

            details[open] summary {
                margin-bottom: 12px;
            }

            .setting {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
                margin-bottom: 16px;
            }

            select {
                max-width: 100%;
                min-width: 0;
                padding: 8px;
            }

            button:disabled {
                cursor: default;
            }

            #status {
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <button id="play" type="button">▶ Listen</button>
        <button id="pause" disabled>Pause</button>
        <button id="stop" disabled>Stop</button>

        <p id="status" role="status" aria-live="polite">
            Ready to listen.
        </p>

        <details>
            <summary>Voice and speed</summary>

            <div class="setting">
                <label for="voice">Voice</label>
                <select id="voice" disabled>
                    <option value="">Loading Google voices…</option>
                </select>
            </div>

            <div class="setting">
                <label for="speed">Speed</label>
                <input id="speed" type="range" min="0.5" max="2"
                       step="0.1" value="1">
                <output id="speed-value" for="speed">1.0×</output>
            </div>
        </details>

        <script>
        (() => {
            const playButton = document.getElementById("play");
            const pauseButton = document.getElementById("pause");
            const stopButton = document.getElementById("stop");
            const status = document.getElementById("status");
            const voiceSelect = document.getElementById("voice");
            const speedSlider = document.getElementById("speed");
            const speedValue = document.getElementById("speed-value");

            if (!("speechSynthesis" in window)) {
                playButton.disabled = true;
                voiceSelect.disabled = true;
                speedSlider.disabled = true;
                status.textContent =
                    "Speech playback is unavailable in this browser.";
                return;
            }

            const bytes = Uint8Array.from(
                atob("__SCRIPT_BASE64__"),
                character => character.charCodeAt(0)
            );

            const text = new TextDecoder().decode(bytes).trim();
            const speech = window.speechSynthesis;

            // Use short chunks rather than one very long utterance.
            const chunks = [];
            let chunk = "";

            for (const word of text.split(/\\s+/)) {
                if (chunk && chunk.length + word.length + 1 > 200) {
                    chunks.push(chunk);
                    chunk = "";
                }

                chunk += (chunk ? " " : "") + word;
            }

            if (chunk) {
                chunks.push(chunk);
            }

            let runId = 0;
            let paused = false;
            let currentUtterance = null;

            function reset(message) {
                runId += 1;
                speech.cancel();
                currentUtterance = null;
                paused = false;

                playButton.disabled = availableVoices.length === 0;
                pauseButton.disabled = true;
                stopButton.disabled = true;
                pauseButton.textContent = "Pause";
                status.textContent = message;
            }

            let availableVoices = [];
            let hasChosenVoice = false;
            const preferredVoices = [
                { name: "Google US English", lang: "en-US" },
                { name: "Google UK English Male", lang: "en-GB" },
                { name: "Google UK English Female", lang: "en-GB" },
            ];

            function loadVoices() {
                const previousChoice = voiceSelect.value;
                const voices = speech.getVoices();

                availableVoices = preferredVoices.map(preferred =>
                    voices.find(voice =>
                        voice.name === preferred.name &&
                        voice.lang.replace("_", "-").toLowerCase() ===
                            preferred.lang.toLowerCase() &&
                        voice.localService === false
                    )
                ).filter(Boolean);

                voiceSelect.replaceChildren();
                voiceSelect.disabled = availableVoices.length === 0;

                if (availableVoices.length === 0) {
                    voiceSelect.add(new Option("Google voices unavailable", ""));
                    reset("These Google online voices are unavailable in this browser. Try Google Chrome.");
                    return;
                }

                for (const voice of availableVoices) {
                    const label = voice.name + " — " + voice.lang +
                        " (online)";
                    voiceSelect.add(new Option(label, voice.voiceURI));
                }

                if (hasChosenVoice && availableVoices.some(
                    voice => voice.voiceURI === previousChoice
                )) {
                    voiceSelect.value = previousChoice;
                } else {
                    // The allowlist puts Google US English first.
                    voiceSelect.value = availableVoices[0].voiceURI;
                }

                playButton.disabled = currentUtterance !== null;
                if (currentUtterance === null) {
                    status.textContent = "Ready to listen.";
                }
            }

            loadVoices();
            speech.addEventListener("voiceschanged", loadVoices);

            voiceSelect.addEventListener("change", () => {
                hasChosenVoice = true;
                reset("Voice changed. Press Listen to restart.");
            });

            speedSlider.addEventListener("input", () => {
                speedValue.textContent =
                    Number(speedSlider.value).toFixed(1) + "×";
                reset("Speed changed. Press Listen to restart.");
            });

            playButton.addEventListener("click", () => {
                reset("Reading aloud…");

                const activeRun = runId;
                const selectedVoice = availableVoices.find(
                    voice => voice.voiceURI === voiceSelect.value
                );
                if (!selectedVoice) {
                    reset("Choose an available Google voice to listen.");
                    return;
                }
                const selectedRate = Number(speedSlider.value);
                let index = 0;

                playButton.disabled = true;
                pauseButton.disabled = false;
                stopButton.disabled = false;

                function readNext() {
                    if (activeRun !== runId) {
                        return;
                    }

                    if (index >= chunks.length) {
                        reset("Finished reading.");
                        return;
                    }

                    currentUtterance =
                        new SpeechSynthesisUtterance(chunks[index]);

                    currentUtterance.voice = selectedVoice;
                    currentUtterance.lang = selectedVoice.lang;
                    currentUtterance.rate = selectedRate;

                    currentUtterance.onend = () => {
                        if (activeRun !== runId) {
                            return;
                        }
                        index += 1;
                        readNext();
                    };

                    currentUtterance.onerror = event => {
                        if (activeRun !== runId) {
                            return;
                        }

                        reset(
                            "Playback failed: " + event.error +
                            ". Try another browser or voice."
                        );
                    };

                    speech.speak(currentUtterance);
                }

                readNext();
            });

            pauseButton.addEventListener("click", () => {
                if (paused) {
                    speech.resume();
                    pauseButton.textContent = "Pause";
                    status.textContent = "Reading aloud…";
                } else {
                    speech.pause();
                    pauseButton.textContent = "Resume";
                    status.textContent = "Paused.";
                }

                paused = !paused;
            });

            stopButton.addEventListener("click", () => {
                reset("Stopped.");
            });

            window.addEventListener("pagehide", () => {
                runId += 1;
                speech.removeEventListener("voiceschanged", loadVoices);
                speech.cancel();
            });
        })();
        </script>
    </body>
    </html>
    """

    player_html = player_html.replace(
        "__SCRIPT_BASE64__",
        encoded_script,
    )

    st.iframe(
        player_html,
        height="content",
        alt="Listen to the translation and adjust voice or speed",
    )

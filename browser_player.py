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
            body {
                font-family: sans-serif;
                margin: 0;
                padding: 8px;
            }

            button {
                padding: 10px 16px;
                margin-right: 8px;
                cursor: pointer;
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
        <div class="setting">
            <label for="voice">Voice</label>
            <select id="voice">
                <option value="">Browser default</option>
            </select>
        </div>

        <div class="setting">
            <label for="speed">Speed</label>
            <input id="speed" type="range" min="0.5" max="2"
                   step="0.1" value="1">
            <output id="speed-value" for="speed">1.0×</output>
        </div>

        <button id="play">Read aloud</button>
        <button id="pause" disabled>Pause</button>
        <button id="stop" disabled>Stop</button>

        <p id="status" role="status" aria-live="polite">
            Ready to read.
        </p>

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

                playButton.disabled = false;
                pauseButton.disabled = true;
                stopButton.disabled = true;
                pauseButton.textContent = "Pause";
                status.textContent = message;
            }

            let availableVoices = [];

            function loadVoices() {
                const previousChoice = voiceSelect.value;
                const voices = speech.getVoices();
                const englishVoices = voices.filter(
                    voice => /^en(?:[-_]|$)/i.test(voice.lang)
                );

                availableVoices = (englishVoices.length
                    ? englishVoices
                    : voices).slice().sort((a, b) =>
                        a.name.localeCompare(b.name)
                    );

                voiceSelect.replaceChildren(
                    new Option("Browser default", "")
                );

                for (const voice of availableVoices) {
                    const location = voice.localService ? "device" : "online";
                    const label = voice.name + " — " + voice.lang +
                        " (" + location + ")";
                    voiceSelect.add(new Option(label, voice.voiceURI));
                }

                if (availableVoices.some(
                    voice => voice.voiceURI === previousChoice
                )) {
                    voiceSelect.value = previousChoice;
                }
            }

            loadVoices();
            speech.addEventListener("voiceschanged", loadVoices);

            voiceSelect.addEventListener("change", () => {
                reset("Voice changed. Press Read aloud to restart.");
            });

            speedSlider.addEventListener("input", () => {
                speedValue.textContent =
                    Number(speedSlider.value).toFixed(1) + "×";
                reset("Speed changed. Press Read aloud to restart.");
            });

            playButton.addEventListener("click", () => {
                reset("Reading aloud…");

                const activeRun = runId;
                const selectedVoice = availableVoices.find(
                    voice => voice.voiceURI === voiceSelect.value
                );
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

                    if (selectedVoice) {
                        currentUtterance.voice = selectedVoice;
                    }

                    currentUtterance.lang = selectedVoice
                        ? selectedVoice.lang
                        : "en-US";
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
        height=260,
        alt="Voice selection, speed, and script playback controls",
    )

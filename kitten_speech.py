"""CPU-only Nano synthesis with word markers from its phoneme-duration output.

The graph vocabulary/input convention follows KittenML's Apache-2.0 ONNX
reference: https://github.com/KittenML/KittenTTS (onnx_model.py).
No PyTorch, cloud speech request, or second alignment model is needed.
"""
from functools import lru_cache
from importlib.util import find_spec
from io import BytesIO
import json
from pathlib import Path
import re
from threading import RLock

from speech_jobs import AudioJobs

ROOT = Path(__file__).parent
MODEL = "KittenML/kitten-tts-nano-0.8-int8"
REVISION = "84781d74e29ee25217551556398b42f80593a813"
CACHE = ROOT / ".narrator-tts"
VOICES = ("Luna", "Hugo")
SAMPLE_RATE = 24000
FRAME_SAMPLES = 600
MAX_SAMPLES = SAMPLE_RATE * 60 * 20
MODEL_LOCK = RLock()


def installed_voices():
    missing = [name for name in ("numpy", "onnxruntime", "phonemizer", "espeakng_loader",
                                 "soundfile", "huggingface_hub") if find_spec(name) is None]
    if missing:
        raise RuntimeError("Install Narrator’s Python requirements, then restart the server to enable KittenTTS.")
    return [{"name": voice, "id": voice, "lang": "en-US"} for voice in VOICES]


@lru_cache(maxsize=1)
def load_model():
    import espeakng_loader
    import numpy as np
    import onnxruntime as ort
    from huggingface_hub import hf_hub_download
    from huggingface_hub.errors import LocalEntryNotFoundError
    from phonemizer.backend import EspeakBackend
    from phonemizer.backend.espeak.wrapper import EspeakWrapper
    import os

    EspeakWrapper.set_library(espeakng_loader.get_library_path())
    os.environ["ESPEAK_DATA_PATH"] = espeakng_loader.get_data_path()

    def asset(filename):
        options = dict(repo_id=MODEL, revision=REVISION, filename=filename,
                       cache_dir=str(CACHE), token=False)
        try:
            return hf_hub_download(**options, local_files_only=True)
        except LocalEntryNotFoundError:
            return hf_hub_download(**options)

    config = json.loads(Path(asset("config.json")).read_text())
    session = ort.InferenceSession(asset(config["model_file"]), providers=["CPUExecutionProvider"])
    with np.load(asset(config["voices"]), allow_pickle=False) as archive:
        voices = {key: archive[key] for key in archive.files}
    phonemizer = EspeakBackend(language="en-us", preserve_punctuation=True, with_stress=True)
    # Token IDs are part of this pinned model's format, including the duplicate
    # symbols in the original vocabulary. Do not reorder or deduplicate them.
    symbols = ("$" + ';:,.!?¡¿—…"«»"" ' + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
               + "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ")
    vocabulary = {symbol: index for index, symbol in enumerate(symbols)}
    return session, phonemizer, voices, config, vocabulary


def text_chunks(text):
    """Keep source offsets; inference boundaries follow sentences, never highlights."""
    group = []
    for word in re.finditer(r"\S+", text):
        if group and word.end() - group[0].start() > 280:
            yield group
            group = []
        group.append(word)
        if re.search(r'[.!?][\"”\u2019\)]*$', word.group()) and word.group().lower() not in {
            "mr.", "mrs.", "ms.", "dr.", "prof.", "e.g.", "i.e.", "vs.", "etc."
        }:
            yield group
            group = []
    if group:
        yield group


def prepare_tokens(words, phonemes, vocabulary):
    """Map phonemes to the original whitespace words, including expanded numbers.

    Phonemize source words separately, then synthesize all their phonemes together
    as one sentence. This keeps exact source ownership for contractions, digits,
    and punctuation without rendering separate word audio clips.
    """
    tokens, spans = [0], []
    for word, phones in zip(words, phonemes, strict=True):
        phones = " ".join(re.findall(r"\w+|[^\w\s]", phones))
        ids = [vocabulary[char] for char in phones if char in vocabulary]
        if len(tokens) > 1 and ids:
            tokens.append(vocabulary[" "])
        start = len(tokens)
        tokens.extend(ids)
        spans.append((word, start, len(tokens)))
    if len(tokens) == 1:
        raise RuntimeError("This passage has no pronounceable English text.")
    tokens.extend([10, 0])
    if len(tokens) > 510:
        raise RuntimeError("A word or sentence is too complex to pronounce. Try splitting it into shorter sentences.")
    return tokens, spans


def utf16_offsets(text):
    offsets = [0]
    for char in text:
        offsets.append(offsets[-1] + (2 if ord(char) > 0xFFFF else 1))
    return offsets


def synthesize(text, voice, model):
    import numpy as np
    import soundfile as sf

    session, phonemizer, voices, config, vocabulary = model
    voice_id = config["voice_aliases"][voice]
    source_offsets = utf16_offsets(text)
    words = []
    samples_written = 0
    output = BytesIO()
    with sf.SoundFile(output, mode="w", samplerate=SAMPLE_RATE, channels=1,
                      format="WAV", subtype="PCM_16") as recording:
        for chunk in text_chunks(text):
            phonemes = phonemizer.phonemize([word.group() for word in chunk])
            tokens, spans = prepare_tokens(chunk, phonemes, vocabulary)
            style = voices[voice_id]
            reference = min(chunk[-1].end() - chunk[0].start(), len(style) - 1)
            waveform, durations = session.run(["waveform", "duration"], {
                "input_ids": np.array([tokens], dtype=np.int64),
                "style": style[reference:reference + 1],
                "speed": np.array([config["speed_priors"][voice_id]], dtype=np.float32),
            })
            waveform = np.asarray(waveform).reshape(-1)
            durations = np.asarray(durations).reshape(-1)
            if (len(durations) != len(tokens) or not np.isfinite(waveform).all()
                    or not np.isfinite(durations).all() or np.any(durations < 0)
                    or abs(int(durations.sum()) * FRAME_SAMPLES - len(waveform)) > FRAME_SAMPLES):
                raise RuntimeError("KittenTTS returned invalid audio timings. Please try again.")
            # Match the reference renderer's tail trim, using the same crop for
            # audio and timestamps. No silence is inserted between sentences.
            waveform = waveform[:-5000]
            if not len(waveform):
                raise RuntimeError("KittenTTS returned an empty recording.")
            if samples_written + len(waveform) > MAX_SAMPLES:
                raise RuntimeError("This recording is too long. Listen to a smaller passage.")
            boundaries = np.concatenate(([0], np.cumsum(durations))) * FRAME_SAMPLES
            for word, start, end in spans:
                timestamp = min(int(boundaries[start]), len(waveform) - 1)
                words.append({"start": source_offsets[word.start()], "end": source_offsets[word.end()],
                              "time": (samples_written + timestamp) / SAMPLE_RATE})
            recording.write(waveform)
            samples_written += len(waveform)
    if not samples_written:
        raise RuntimeError("There is no text to speak.")
    return output.getvalue(), {"voice": voice, "duration": samples_written / SAMPLE_RATE,
                               "timing": "model-predicted", "words": words}


def render_speech(text, voice):
    if voice not in VOICES:
        raise ValueError("Choose Luna or Hugo.")
    installed_voices()
    # One model/session is shared by the single rendering worker. The lock also
    # makes direct callers safe; eSpeak and NumPy voice arrays are shared state.
    with MODEL_LOCK:
        try:
            return synthesize(text, voice, load_model())
        except RuntimeError:
            raise
        except Exception as error:
            raise RuntimeError("Could not prepare KittenTTS. Check the local speech dependencies and, for the first model download, your internet connection.") from error


class KittenAudioJobs(AudioJobs):
    def __init__(self, renderer=render_speech):
        super().__init__(renderer)

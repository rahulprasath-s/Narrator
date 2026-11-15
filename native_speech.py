"""Free macOS audio rendering, bypassing browser voice selection entirely."""
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import RLock

ROOT = Path(__file__).parent
VOICE_IDS = {"Rishi": "com.apple.voice.compact.en-IN.Rishi", "Samantha": "com.apple.voice.compact.en-US.Samantha"}
BUILD_LOCK = RLock()


def helper():
    if sys.platform != "darwin":
        raise RuntimeError("Built-in Mac speech requires the Python server to run on macOS.")
    source = ROOT / "native" / "macos_speech.swift"
    cache = ROOT / ".narrator-native"
    cache.mkdir(exist_ok=True)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()[:16]
    binary = cache / f"speech-{digest}"
    with BUILD_LOCK:
        if not binary.is_file():
            try:
                subprocess.run(["/usr/bin/xcrun", "swiftc", "-module-cache-path", str(cache / "modules"),
                                str(source), "-o", str(binary)], capture_output=True, check=True, timeout=120)
            except (OSError, subprocess.SubprocessError) as error:
                raise RuntimeError("Could not prepare the native speech helper. The installed Apple command-line tools are required; nothing is downloaded automatically.") from error
    return binary


@lru_cache(maxsize=1)
def installed_voices():
    try:
        response = subprocess.run([str(helper())], capture_output=True, text=True, check=True, timeout=20)
        return [voice for voice in json.loads(response.stdout) if voice.get("id") == VOICE_IDS.get(voice.get("name"))]
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        raise RuntimeError("Could not list the installed Mac voices.") from error


def validate_markers(text, metadata, voice):
    if metadata.get("voice") != VOICE_IDS[voice]:
        raise RuntimeError("macOS did not use the requested voice. Playback was stopped instead of substituting another voice.")
    words = metadata.get("words", [])
    duration = metadata.get("duration")
    if not isinstance(duration, (float, int)) or not math.isfinite(duration) or duration <= 0 or not words:
        raise RuntimeError("Native speech returned invalid audio timings.")
    length = len(text.encode("utf-16-le")) // 2
    previous_time, previous_position = -1, -1
    for word in words:
        start, end, timestamp = word.get("start"), word.get("end"), word.get("time")
        if (not isinstance(start, int) or not isinstance(end, int) or not 0 <= start < end <= length
                or not isinstance(timestamp, (float, int)) or not math.isfinite(timestamp)
                or not 0 <= timestamp <= duration or timestamp < previous_time or start < previous_position):
            raise RuntimeError("Native speech returned invalid word markers.")
        previous_time, previous_position = timestamp, start


def render_speech(text, voice):
    if voice not in VOICE_IDS:
        raise ValueError("Choose Rishi or Samantha.")
    with TemporaryDirectory(prefix="narrator-speech-") as temporary:
        folder = Path(temporary)
        try:
            result = subprocess.run([str(helper()), str(folder / "speech.caf")],
                                    input=json.dumps({"text": text, "voice": voice}), text=True,
                                    capture_output=True, check=True, timeout=190)
            metadata = json.loads(result.stdout)
            validate_markers(text, metadata, voice)
            subprocess.run(["/usr/bin/afconvert", "-f", "WAVE", "-d", "LEI16",
                            str(folder / "speech.caf"), str(folder / "speech.wav")],
                           capture_output=True, check=True, timeout=30)
            output = folder / "speech.wav"
            if output.stat().st_size > 128 * 1024 * 1024:
                raise RuntimeError("This recording is too large. Listen to a smaller passage.")
            return output.read_bytes(), metadata
        except subprocess.TimeoutExpired as error:
            raise RuntimeError("Native speech took too long. Try a shorter passage.") from error
        except (OSError, subprocess.CalledProcessError, ValueError) as error:
            raise RuntimeError("Could not render this Mac voice. Check that Rishi and Samantha are available on the Mac running Narrator.") from error


class NativeAudioJobs:
    def __init__(self, renderer=render_speech):
        self.renderer = renderer
        self.jobs = {}
        self.lock = RLock()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mac-speech")

    def submit(self, text, voice, session):
        identifier = hashlib.sha256(json.dumps([session, text, voice, 1]).encode()).hexdigest()
        with self.lock:
            existing = self.jobs.get(identifier)
            if existing and existing["state"] != "error":
                return self.snapshot(existing)
            if sum(job["state"] in ("queued", "rendering") for job in self.jobs.values()) >= 4:
                raise ValueError("Several recordings are already queued. Try again shortly.")
            while self.jobs and (len(self.jobs) >= 16 or sum(len(job["audio"]) for job in self.jobs.values()) >= 64 * 1024 * 1024):
                finished = next((key for key, job in self.jobs.items() if job["state"] in ("ready", "error")), None)
                if finished is None:
                    break
                del self.jobs[finished]
            job = {"id": identifier, "session": session, "state": "queued", "error": None, "audio": b"", "metadata": None}
            self.jobs[identifier] = job
            self.executor.submit(self.run, job, text, voice)
            return self.snapshot(job)

    def run(self, job, text, voice):
        with self.lock:
            job["state"] = "rendering"
        try:
            audio, metadata = self.renderer(text, voice)
            with self.lock:
                job.update(state="ready", audio=audio, metadata=metadata)
        except Exception as error:
            with self.lock:
                job.update(state="error", error=str(error) if isinstance(error, RuntimeError) else "Native speech could not be prepared.")

    def get(self, identifier, session):
        with self.lock:
            job = self.jobs.get(identifier)
            if not job or job["session"] != session:
                raise KeyError(identifier)
            return job

    def snapshot(self, job):
        with self.lock:
            return {key: job[key] for key in ("id", "state", "error", "metadata")}

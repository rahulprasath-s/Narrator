"""Bounded, session-private background audio recordings."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from threading import RLock


class AudioJobs:
    def __init__(self, renderer):
        self.renderer = renderer
        self.jobs = {}
        self.lock = RLock()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="narrator-speech")

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
                job.update(state="error", error=str(error) if isinstance(error, RuntimeError) else "Speech could not be prepared.")

    def get(self, identifier, session):
        with self.lock:
            job = self.jobs.get(identifier)
            if not job or job["session"] != session:
                raise KeyError(identifier)
            return job

    def snapshot(self, job):
        with self.lock:
            return {key: job[key] for key in ("id", "state", "error", "metadata")}

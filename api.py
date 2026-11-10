"""Local Python API for the React listening studio.

Jobs and uploaded content live in memory and disappear when the process stops.
Only this module calls the existing PDF parser and Claude translator.
"""

from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
from threading import RLock
import uuid

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from pdf_parser import extract_pdf_text
from prompts import SCRIPT_INSTRUCTIONS
from translator import generate_script


ROOT = Path(__file__).parent
MAX_FILE_BYTES = 20 * 1024 * 1024


def split_text(text: str, limit: int = 12000) -> list[str]:
    remaining = text.strip()
    sections = []
    while len(remaining) > limit:
        cut = remaining.rfind("\n\n", 0, limit)
        if cut < limit // 2:
            cut = remaining.rfind(" ", 0, limit)
        if cut < limit // 2:
            cut = limit
        sections.append(remaining[:cut].strip())
        remaining = remaining[cut:].lstrip()
    if remaining:
        sections.append(remaining)
    return sections


class JobManager:
    def __init__(self, extractor=extract_pdf_text, translator=generate_script):
        self.extractor = extractor
        self.translator = translator
        self.jobs = {}
        self.lock = RLock()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="narrator")

    def snapshot(self, job):
        with self.lock:
            return {
                key: job[key] for key in (
                    "id", "name", "kind", "state", "stage", "progress", "source",
                    "script", "error", "warnings", "removed", "sections_total",
                    "sections_done", "created_at",
                )
            }

    def get(self, identifier, session):
        with self.lock:
            job = self.jobs.get(identifier)
            if not job or job["session"] != session:
                raise HTTPException(404, "This document is no longer available. Upload it again.")
            return job

    def submit(self, session, name, kind, content, settings):
        identity = hashlib.sha256(content)
        identity.update(json.dumps({
            "session": session, "settings": settings, "kind": kind,
            "model": os.getenv("ANTHROPIC_MODEL", ""),
            "prompt": SCRIPT_INSTRUCTIONS, "version": 1,
        }, sort_keys=True).encode())
        identifier = identity.hexdigest()
        with self.lock:
            if identifier in self.jobs:
                return self.snapshot(self.jobs[identifier])
            if sum(j["state"] in ("queued", "processing") for j in self.jobs.values()) >= 8:
                raise HTTPException(429, "The studio has several documents in progress. Try again shortly.")
            # Keep the local cache bounded. Never evict an active document.
            if len(self.jobs) >= 32:
                finished = [key for key, j in self.jobs.items() if j["state"] in ("ready", "error")]
                if finished:
                    del self.jobs[finished[0]]
            job = {
                "id": identifier, "session": session, "name": name, "kind": kind,
                "content": content, "settings": settings, "state": "queued",
                "stage": "Waiting for the studio", "progress": 0, "source": "",
                "script": "", "error": None, "warnings": [], "removed": [],
                "sections": [], "translations": [], "sections_total": 0,
                "sections_done": 0, "created_at": datetime.now(timezone.utc).isoformat(),
            }
            self.jobs[identifier] = job
            self.executor.submit(self.run, identifier)
            return self.snapshot(job)

    def run(self, identifier):
        with self.lock:
            job = self.jobs[identifier]
            job.update(state="processing", stage="Reading your document", error=None)
        try:
            if not job["source"]:
                if job["kind"] == "pdf":
                    extraction = self.extractor(job["content"], **job["settings"])
                else:
                    extraction = {"text": job["content"].decode(), "removed": [], "warnings": []}
                sections = split_text(extraction["text"])
                if not sections:
                    raise ValueError("There is no readable text in this document.")
                with self.lock:
                    job.update(
                        source=extraction["text"], warnings=extraction["warnings"],
                        removed=extraction["removed"], sections=sections,
                        sections_total=len(sections), progress=12,
                    )
                    if len(sections) > 1:
                        job["warnings"].append(
                            "This document is translated in sections. Review transitions and references across section boundaries."
                        )
            for index in range(len(job["translations"]), len(job["sections"])):
                with self.lock:
                    job["stage"] = f"Finding the meaning · section {index + 1} of {len(job['sections'])}"
                translated = self.translator(job["sections"][index])
                with self.lock:
                    job["translations"].append(translated)
                    job.update(
                        script="\n\n".join(job["translations"]), sections_done=index + 1,
                        progress=12 + round(88 * (index + 1) / len(job["sections"])),
                    )
            with self.lock:
                job.update(state="ready", stage="Ready to listen", progress=100, content=b"")
        except (ValueError, RuntimeError) as error:
            with self.lock:
                job.update(state="error", stage="A little attention needed", error=str(error))
        except Exception:
            with self.lock:
                job.update(
                    state="error", stage="A little attention needed",
                    error="We couldn’t process this document. Try a different PDF or a smaller page range.",
                )

    def retry(self, identifier, session):
        with self.lock:
            job = self.get(identifier, session)
            if job["state"] == "error":
                job.update(state="queued", stage="Picking up where we left off", error=None)
                self.executor.submit(self.run, identifier)
            return self.snapshot(job)


class TextInput(BaseModel):
    text: str = Field(min_length=1, max_length=40000)
    name: str = Field(default="Untitled thought", max_length=120)


def create_app(manager=None):
    jobs = manager or JobManager()

    @asynccontextmanager
    async def lifespan(app):
        yield
        jobs.executor.shutdown(wait=False, cancel_futures=True)

    app = FastAPI(title="Narrator", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.jobs = jobs

    @app.middleware("http")
    async def local_access(request: Request, call_next):
        host = request.headers.get("host", "")
        if not re.fullmatch(r"(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?", host):
            return JSONResponse({"detail": "This studio is available on localhost only."}, status_code=403)
        origin = request.headers.get("origin")
        if origin and not re.fullmatch(r"http://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?", origin):
            return JSONResponse({"detail": "Use your local Narrator studio."}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def session_id(value):
        if not value or not re.fullmatch(r"[a-zA-Z0-9-]{16,80}", value):
            raise HTTPException(400, "Please refresh the studio to start a session.")
        return value

    @app.get("/api/status")
    def status():
        return {"configured": bool(os.getenv("ANTHROPIC_API_KEY") and os.getenv("ANTHROPIC_MODEL"))}

    @app.get("/api/documents")
    def documents(x_narrator_session: str = Header(default="")):
        session = session_id(x_narrator_session)
        with jobs.lock:
            return [jobs.snapshot(j) for j in reversed(list(jobs.jobs.values())) if j["session"] == session]

    @app.post("/api/documents", status_code=202)
    async def upload(
        file: UploadFile = File(...),
        first_page: int = Form(default=1, ge=1),
        last_page: int = Form(default=0, ge=0),
        remove_footnotes: bool = Form(default=True),
        x_narrator_session: str = Header(default=""),
    ):
        session = session_id(x_narrator_session)
        if last_page and last_page < first_page:
            raise HTTPException(400, "The last page must come after the first page.")
        if last_page and last_page - first_page + 1 > 100:
            raise HTTPException(400, "Choose up to one hundred pages per document.")
        content = await file.read(MAX_FILE_BYTES + 1)
        await file.close()
        if len(content) > MAX_FILE_BYTES:
            raise HTTPException(413, "Choose a PDF smaller than twenty megabytes.")
        if not content.startswith(b"%PDF-"):
            raise HTTPException(400, "This file isn’t a readable PDF. Choose a PDF with selectable text.")
        return jobs.submit(session, (file.filename or "Untitled.pdf")[:180], "pdf", content, {
            "start_page": first_page, "end_page": last_page or None,
            "remove_footnotes": remove_footnotes,
        })

    @app.post("/api/text", status_code=202)
    def translate_text(payload: TextInput, x_narrator_session: str = Header(default="")):
        session = session_id(x_narrator_session)
        if not payload.text.strip():
            raise HTTPException(400, "Add a passage first.")
        return jobs.submit(session, payload.name.strip() or "Untitled thought", "text", payload.text.strip().encode(), {})

    @app.get("/api/documents/{identifier}")
    def document(identifier: str, x_narrator_session: str = Header(default="")):
        return jobs.snapshot(jobs.get(identifier, session_id(x_narrator_session)))

    @app.post("/api/documents/{identifier}/retry", status_code=202)
    def retry(identifier: str, x_narrator_session: str = Header(default="")):
        return jobs.retry(identifier, session_id(x_narrator_session))

    @app.get("/{path:path}")
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "Not found")
        dist = (ROOT / "frontend" / "dist").resolve()
        asset = (dist / path).resolve()
        if not asset.is_relative_to(dist):
            raise HTTPException(404, "Not found")
        if path and asset.is_file():
            return FileResponse(asset)
        index = dist / "index.html"
        if not index.is_file():
            raise HTTPException(503, "The React interface is not built yet. Use npm run dev or npm run build.")
        return FileResponse(index)

    return app


app = create_app()

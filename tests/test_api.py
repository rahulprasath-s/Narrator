"""Exercise the local API without making any paid generation requests."""
import time
import unittest
from unittest.mock import Mock

from fastapi.testclient import TestClient

from api import JobManager, create_app, split_text
from pdf_parser import extract_pdf_text


SESSION = {"X-Narrator-Session": "test-session-12345678"}
OTHER = {"X-Narrator-Session": "other-session-12345678"}


def sample_pdf():
    """A real one-page PDF with body text and a removable bottom page number."""
    stream = b"BT /F1 12 Tf 72 650 Td (A belief can be true without knowledge.) Tj ET\nBT /F1 10 Tf 300 20 Td (1) Tj ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    content, offsets = b"%PDF-1.4\n", [0]
    for index, value in enumerate(objects, 1):
        offsets.append(len(content))
        content += f"{index} 0 obj\n".encode() + value + b"\nendobj\n"
    xref = len(content)
    content += f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode()
    content += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    return content + f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()


class StudioTests(unittest.TestCase):
    def setUp(self):
        self.extractor = Mock(return_value={
            "text": "A belief can be true without being knowledge.",
            "warnings": ["Review cleaned text."],
            "removed": [{"page": 1, "reason": "footer", "text": "Page one"}],
        })
        self.translator = Mock(return_value="A lucky guess can be right. Knowing takes more.")
        self.manager = JobManager(self.extractor, self.translator)
        self.client = TestClient(create_app(self.manager), base_url="http://127.0.0.1")
        self.client.__enter__()

    def tearDown(self):
        self.manager.executor.shutdown(wait=True)
        self.client.__exit__(None, None, None)

    def finished(self, identifier):
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            response = self.client.get(f"/api/documents/{identifier}", headers=SESSION)
            self.assertEqual(response.status_code, 200)
            job = response.json()
            if job["state"] in ("ready", "error"):
                return job
            time.sleep(.01)
        self.fail("Background job did not finish")

    def text_job(self, text="The source passage."):
        response = self.client.post("/api/text", headers=SESSION, json={"text": text})
        self.assertEqual(response.status_code, 202)
        return response.json()["id"]

    def test_pdf_extracts_translates_and_deduplicates(self):
        options = dict(headers=SESSION, files={"file": ("Ethics.pdf", b"%PDF-fake", "application/pdf")},
                       data={"first_page": 2, "last_page": 4, "remove_footnotes": "false"})
        response = self.client.post("/api/documents", **options)
        self.assertEqual(response.status_code, 202)
        identifier = response.json()["id"]
        job = self.finished(identifier)
        self.assertEqual(job["state"], "ready")
        self.assertEqual(job["progress"], 100)
        self.assertEqual(job["script"], self.translator.return_value)
        self.assertEqual(job["removed"][0]["text"], "Page one")
        self.extractor.assert_called_once_with(b"%PDF-fake", start_page=2, end_page=4, remove_footnotes=False)
        duplicate = self.client.post("/api/documents", **options)
        self.assertEqual(duplicate.json()["id"], identifier)
        self.translator.assert_called_once()
        self.assertNotIn("content", job)
        self.assertNotIn("session", job)

    def test_real_pdf_parser_through_upload_endpoint(self):
        self.manager.extractor = extract_pdf_text
        response = self.client.post("/api/documents", headers=SESSION,
                                    files={"file": ("Knowledge.pdf", sample_pdf(), "application/pdf")})
        self.assertEqual(response.status_code, 202)
        job = self.finished(response.json()["id"])
        self.assertEqual(job["state"], "ready")
        self.assertEqual(job["source"], "A belief can be true without knowledge.")
        self.assertEqual(job["removed"][0]["reason"], "Likely page number")
        self.translator.assert_called_once_with(job["source"])

    def test_session_isolation_and_validation(self):
        identifier = self.text_job()
        self.finished(identifier)
        self.assertEqual(self.client.get("/api/documents", headers=OTHER).json(), [])
        self.assertEqual(self.client.get(f"/api/documents/{identifier}", headers=OTHER).status_code, 404)
        self.assertEqual(self.client.post(f"/api/documents/{identifier}/retry", headers=OTHER).status_code, 404)
        self.assertEqual(self.client.get("/api/documents").status_code, 400)
        self.assertEqual(self.client.post("/api/text", headers=SESSION, json={"text": "  "}).status_code, 400)
        self.assertEqual(self.client.post("/api/text", headers=SESSION, json={"text": "x" * 40001}).status_code, 422)

    def test_retry_preserves_completed_sections(self):
        source = "first idea " * 1500
        sections = split_text(source)
        self.assertGreater(len(sections), 1)
        self.translator.side_effect = ["Part one.", RuntimeError("Temporary failure."), "Part two."]
        identifier = self.text_job(source)
        failed = self.finished(identifier)
        self.assertEqual(failed["state"], "error")
        self.assertEqual(failed["script"], "Part one.")
        self.assertEqual(failed["sections_done"], 1)
        response = self.client.post(f"/api/documents/{identifier}/retry", headers=SESSION)
        self.assertEqual(response.status_code, 202)
        ready = self.finished(identifier)
        self.assertEqual(ready["state"], "ready")
        self.assertEqual(ready["script"], "Part one.\n\nPart two.")
        self.assertEqual(self.translator.call_count, 3)
        self.assertEqual(self.translator.call_args_list[1], self.translator.call_args_list[2])

    def test_invalid_files_and_page_ranges_do_not_generate(self):
        for data, content in [({}, b"not a pdf"), ({"first_page": 5, "last_page": 2}, b"%PDF-x"),
                              ({"last_page": 101}, b"%PDF-x")]:
            response = self.client.post("/api/documents", headers=SESSION, data=data,
                                        files={"file": ("test.pdf", content, "application/pdf")})
            self.assertEqual(response.status_code, 400)
        self.translator.assert_not_called()

    def test_local_only_and_safe_status(self):
        response = self.client.get("/api/status")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()), {"configured"})
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(self.client.get("/api/status", headers={"Host": "foreign.example"}).status_code, 403)
        self.assertEqual(self.client.post("/api/text", headers={**SESSION, "Origin": "https://foreign.example"},
                                          json={"text": "No request should run."}).status_code, 403)
        self.translator.assert_not_called()

    def test_unexpected_errors_are_safe_to_display(self):
        self.translator.side_effect = Exception("Private implementation details")
        job = self.finished(self.text_job())
        self.assertEqual(job["state"], "error")
        self.assertNotIn("Private", job["error"])


class SplitTests(unittest.TestCase):
    def test_split_preserves_words_and_respects_limit(self):
        text = ("A difficult idea becomes clear.\n\n" * 1000).strip()
        chunks = split_text(text)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk) <= 12000 for chunk in chunks))
        self.assertEqual(" ".join(chunks).split(), text.split())
        self.assertEqual(split_text(" \n "), [])


if __name__ == "__main__":
    unittest.main()

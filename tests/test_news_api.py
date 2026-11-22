"""Date-based news reads and status writes with mocked Notion responses."""
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from api import create_app


class NewsAPITests(unittest.TestCase):
    PAGE_ID = "d10cd0a2-b2e6-4f23-aca2-c030b030b030"
    STATUS_PATH = f"/api/news/2026-11-14/{PAGE_ID}/status"

    def setUp(self):
        self.client = TestClient(create_app(), base_url="http://127.0.0.1")
        self.client.__enter__()
        self.headers = {"X-Narrator-Session": "news-test-session-1234"}
        self.patch = patch("api.get_news_for_date")
        self.reader = self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.client.__exit__(None, None, None)

    def test_requested_date_and_stories_are_returned(self):
        stories = [{
            "id": "story-one", "rank": 1, "title": "Example story",
            "summary": "A saved explanation from Notion.",
            "summary_status": "Ready", "summarized_at": "2026-11-14T09:00:00+01:00",
            "status": "NOT YET",
        }]
        self.reader.return_value = stories
        response = self.client.get("/api/news/2026-11-14", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"date": "2026-11-14", "count": 1, "stories": stories})
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.reader.assert_called_once_with("2026-11-14")

    def test_date_without_news_is_successful_and_empty(self):
        self.reader.return_value = []
        response = self.client.get("/api/news/2026-11-14", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 0)
        self.assertEqual(response.json()["stories"], [])

    def test_reading_status_writes_only_the_notion_status_property(self):
        story = {"id": self.PAGE_ID, "status": "NOT YET", "summary_status": "Ready"}
        self.reader.return_value = [story]
        request = httpx.Request("PATCH", f"https://api.notion.com/v1/pages/{self.PAGE_ID}")
        upstream = httpx.Response(200, request=request, json={
            "properties": {"Status": {"status": {"name": "NOT INTERESTED"}}},
        })
        with patch("notion_news.os.getenv", return_value="fake-token"), \
                patch("notion_news.httpx.patch", return_value=upstream) as write:
            response = self.client.patch(self.STATUS_PATH, headers=self.headers,
                                         json={"status": "NOT INTERESTED"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"id": self.PAGE_ID, "status": "NOT INTERESTED"})
        self.reader.assert_called_once_with("2026-11-14")
        self.assertEqual(write.call_args.args[0], str(request.url))
        self.assertEqual(write.call_args.kwargs["json"], {
            "properties": {"Status": {"status": {"name": "NOT INTERESTED"}}},
        })

    def test_invalid_or_out_of_brief_status_change_never_writes(self):
        self.reader.return_value = []
        with patch("api.update_reading_status") as write:
            response = self.client.patch(self.STATUS_PATH, headers=self.headers,
                                         json={"status": "Ready"})
            self.assertEqual(response.status_code, 422)
            self.reader.assert_not_called()
            response = self.client.patch(self.STATUS_PATH, headers=self.headers,
                                         json={"status": "In Progress"})
            self.assertEqual(response.status_code, 404)
            write.assert_not_called()

    def test_invalid_date_does_not_contact_notion(self):
        for day in ("2026-02-30", "not-a-date"):
            response = self.client.get(f"/api/news/{day}", headers=self.headers)
            self.assertEqual(response.status_code, 422)
        self.reader.assert_not_called()

    def test_session_is_required(self):
        response = self.client.get("/api/news/2026-11-14")
        self.assertEqual(response.status_code, 400)
        self.reader.assert_not_called()

    def test_missing_configuration_is_reported_without_private_details(self):
        self.reader.side_effect = RuntimeError("Private configuration details")
        response = self.client.get("/api/news/2026-11-14", headers=self.headers)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("Private", response.text)

    def test_timeout_is_reported(self):
        self.reader.side_effect = httpx.ReadTimeout("Private request details")
        response = self.client.get("/api/news/2026-11-14", headers=self.headers)
        self.assertEqual(response.status_code, 504)
        self.assertNotIn("Private", response.text)

    def test_connection_failure_is_reported(self):
        self.reader.side_effect = httpx.ConnectError("Private request details")
        response = self.client.get("/api/news/2026-11-14", headers=self.headers)
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("Private", response.text)

    def test_notion_http_error_is_reported_without_exposing_its_body(self):
        request = httpx.Request("POST", "https://api.notion.com/v1/data_sources/example/query")
        upstream = httpx.Response(403, request=request, text="Private upstream details")
        self.reader.side_effect = httpx.HTTPStatusError("Private error", request=request, response=upstream)
        response = self.client.get("/api/news/2026-11-14", headers=self.headers)
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("Private", response.text)

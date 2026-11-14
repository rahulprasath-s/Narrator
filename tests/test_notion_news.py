"""Read saved Notion summaries without contacting Notion or Claude."""
from copy import deepcopy
import unittest
from unittest.mock import MagicMock, patch

import httpx

from notion_news import get_news_for_date


def story_page():
    return {
        "id": "story-one",
        "properties": {
            "Rank": {"rich_text": [{"plain_text": "N1"}]},
            "Title": {"title": [{"plain_text": "A news story"}]},
            "Description": {"rich_text": [{"plain_text": "Original feed description"}]},
            "Link": {"url": "https://example.com/story"},
            "Source": {"select": {"name": "Hacker News"}},
            "Summary": {"rich_text": [
                {"plain_text": "First paragraph.\n\n"},
                {"plain_text": "Second paragraph."},
            ]},
            "Summary Status": {"select": {"name": "Ready"}},
            "Summarized At": {"date": {"start": "2026-11-14T09:00:00+01:00"}},
            "Status": {"status": {"name": "NOT YET"}},
        },
    }


class NotionNewsTests(unittest.TestCase):
    def read_pages(self, *batches):
        client = MagicMock()
        client.__enter__.return_value = client
        client.post.side_effect = [
            httpx.Response(
                200,
                json={"results": pages, "has_more": i < len(batches) - 1, "next_cursor": "next-page"},
                request=httpx.Request("POST", "https://api.notion.com"),
            )
            for i, pages in enumerate(batches)
        ]
        with patch.dict("os.environ", {"NOTION_API_KEY": "test-token", "NOTION_NEWS_DATA_SOURCE_ID": "test-source"}), \
             patch("notion_news.httpx.Client", return_value=client):
            return get_news_for_date("2026-11-14")

    def test_saved_summary_fragments_and_status_properties(self):
        story = self.read_pages([story_page()])[0]
        self.assertEqual(story["summary"], "First paragraph.\n\nSecond paragraph.")
        self.assertEqual(story["summary_status"], "Ready")
        self.assertEqual(story["summarized_at"], "2026-11-14T09:00:00+01:00")
        self.assertEqual(story["status"], "NOT YET")
        self.assertEqual(story["description"], "Original feed description")

    def test_older_and_empty_summary_properties_have_safe_defaults(self):
        for missing in (False, True):
            with self.subTest(missing=missing):
                page = story_page()
                if missing:
                    for name in ("Summary", "Summary Status", "Summarized At", "Status"):
                        del page["properties"][name]
                else:
                    page["properties"].update({
                        "Summary": {"rich_text": []},
                        "Summary Status": {"select": None},
                        "Summarized At": {"date": None},
                        "Status": {"status": None},
                    })
                story = self.read_pages([page])[0]
                self.assertEqual(story["summary"], "")
                self.assertEqual(story["summary_status"], "Pending")
                self.assertIsNone(story["summarized_at"])
                self.assertEqual(story["status"], "")

    def test_summaries_survive_pagination_and_numeric_rank_sorting(self):
        first = story_page()
        later = deepcopy(first)
        later["id"] = "story-ten"
        later["properties"]["Rank"]["rich_text"][0]["plain_text"] = "N10"
        later["properties"]["Summary Status"]["select"]["name"] = "Failed"
        stories = self.read_pages([later], [first])
        self.assertEqual([story["rank"] for story in stories], [1, 10])
        self.assertEqual(stories[1]["summary_status"], "Failed")
        self.assertTrue(all(story["summary"] for story in stories))

import os
import re
from datetime import date
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

def plain_text(parts: list[dict]) -> str:
    return "".join(part.get("plain_text", "") for part in parts)

def get_news_for_date(day:str) -> list[dict]:
    selected_date = date.fromisoformat(day).isoformat()

    token = os.getenv("NOTION_API_KEY")
    source_id = os.getenv("NOTION_NEWS_DATA_SOURCE_ID")

    if not token or not source_id:
        raise RuntimeError("The Notion settings are missing from .env.")

    payload = {
        "page_size":100,
        "filter": {
            "and": [
                {
                    "property":"Date",
                    "date":{"equals": selected_date},
                },
                {
                    "property":"Type",
                    "select":{"equals": "NEWS"},
                },
            ]
        },
    }

    stories = []

    with httpx.Client(
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": "2026-03-11",
        },
        timeout=30,
    ) as client:
        while True:
            response = client.post(
                f"https://api.notion.com/v1/data_sources/{source_id}/query",
                json=payload,
            )

            response.raise_for_status()
            data = response.json()

            for page in data["results"]:
                properties = page["properties"]

                rank_text = plain_text(properties["Rank"]["rich_text"])
                rank_match = re.search(r"\d+", rank_text)
                source = properties["Source"].get("select") or {}

                summary_status = (
                    properties.get("Summary Status", {}).get("select") or {}
                )

                summarized_at = properties.get("Summarized At", {}).get("date")
                reading_status = properties.get("Status", {}).get("status") or {}

                stories.append({
                    "id":page["id"],
                    "date": selected_date,
                    "rank": int(rank_match.group()) if rank_match else 999,
                    "title": plain_text(properties["Title"]["title"]),
                    "description": plain_text(
                        properties["Description"]["rich_text"]
                    ),
                    "url": properties["Link"].get("url"),
                    "source":source.get("name", ""),
                    "summary": plain_text(
                        properties.get("Summary", {}).get("rich_text", [])
                    ),
                    "summary_status": summary_status.get("name", "Pending"),
                    "summarized_at": (
                        summarized_at.get("start") if summarized_at else None
                    ),
                    "status": reading_status.get("name", ""),
                })

            if not data.get("has_more"):
                break

            payload["start_cursor"] = data["next_cursor"]

        return sorted(stories, key=lambda story: story["rank"])[:10]


def update_reading_status(page_id: str, status: str) -> str:
    token = os.getenv("NOTION_API_KEY")
    if not token:
        raise RuntimeError("The Notion API key is missing from .env.")

    response = httpx.patch(
        f"https://api.notion.com/v1/pages/{page_id}",
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": "2026-03-11",
        },
        json={"properties": {"Status": {"status": {"name": status}}}},
        timeout=15,
    )
    response.raise_for_status()

    return response.json()["properties"]["Status"]["status"]["name"]

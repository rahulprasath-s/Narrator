import httpx
from trafilatura import extract

MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024

def extract_article(url: str) -> str:
    """Download an HTML page and return its main article text."""

    parsed_url = httpx.URL(url)

    if parsed_url.scheme not in {"http", "https"} or not parsed_url.host:
        raise ValueError("Provide a valid HTTP or HTTPS article URL.")

    try:
        with httpx.Client(
            follow_redirects=True,
            timeout=httpx.Timeout(30, connect=10),
            headers={
                "User-Agent": "Narrator/0.2 (article reader)",
                "Accept": "text/html,application/xhtml+xml",
            },
        ) as client:
            with client.stream("GET", url) as response:
                response.raise_for_status()

                content_type = response.headers.get(
                    "content-type", ""
                ).lower()

                if not content_type.startswith(
                    ("text/html", "application/xhtml+xml")
                ):
                    raise ValueError(
                        "This URL did not return an HTML page."
                    )

                encoding = response.encoding or "utf-8"
                downloaded = bytearray()

                for chunk in response.iter_bytes():
                    downloaded.extend(chunk)

                    if len(downloaded) > MAX_DOWNLOAD_BYTES:
                        raise ValueError(
                            "The article page exceeds five megabytes."
                        )


    except httpx.TimeoutException as error:
        raise RuntimeError(
            "The website took too long to respond."
        ) from error

    except httpx.HTTPStatusError as error:
        raise RuntimeError(
            "The website rejected the download "
            f"(HTTP {error.response.status_code})."
        ) from error

    except httpx.RequestError as error:
        raise RuntimeError(
            "Could not connect to the article website."
        ) from error

    html = downloaded.decode(encoding, errors="replace")

    article_text = extract(
        html,
        url=str(response.url),
        include_comments=False,
        include_tables=False,
        include_links=False,
    )

    if not article_text or not article_text.strip():
        raise ValueError(
            "No article text could be extracted. "
            "The page may require JavaScript or a subscription."
        )
    return article_text.strip()

import os
from pathlib import Path

import anthropic
from dotenv import load_dotenv

from prompts import SCRIPT_INSTRUCTIONS


load_dotenv(Path(__file__).parent / ".env")


def generate_script(source_text: str) -> str:
    text = source_text.strip()

    if not text:
        raise ValueError("Please enter some source text.")

    if len(text) > 40000:
        raise ValueError("Please use forty thousand characters or fewer.")

    api_key = os.getenv("ANTHROPIC_API_KEY")
    model = os.getenv("ANTHROPIC_MODEL")

    if not api_key or not model:
        raise ValueError(
            "Configure ANTHROPIC_API_KEY and ANTHROPIC_MODEL in .env."
        )

    try:
        with anthropic.Anthropic(
            api_key=api_key,
            timeout=120.0,
            max_retries=0,
        ) as client:
            response = client.messages.create(
                model=model,
                max_tokens=8000,
                system=SCRIPT_INSTRUCTIONS,
                messages=[{"role": "user", "content": text}],
            )

    except anthropic.AuthenticationError as error:
        raise RuntimeError(
            "Claude rejected the API key. Check your .env file."
        ) from error

    except anthropic.RateLimitError as error:
        raise RuntimeError(
            "Claude's rate limit was reached. Wait before trying again."
        ) from error

    except anthropic.APITimeoutError as error:
        raise RuntimeError(
            "Claude took too long to respond. Try a shorter passage."
        ) from error

    except anthropic.APIConnectionError as error:
        raise RuntimeError(
            "Could not connect to Claude. Check your connection."
        ) from error

    except anthropic.APIStatusError as error:
        raise RuntimeError(
            f"Claude could not complete the request "
            f"(HTTP {error.status_code}). "
            "Check your Console balance and model access."
        ) from error

    if response.stop_reason != "end_turn":
        raise RuntimeError(
            "Claude did not finish normally. Try a shorter passage."
        )

    text_parts = []

    for block in response.content:
        if block.type == "text":
            text_parts.append(block.text)

    script = "\n\n".join(text_parts).strip()

    if not script:
        raise RuntimeError("Claude returned no spoken script.")

    return script

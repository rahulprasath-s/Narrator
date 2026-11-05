import re
from collections import Counter
from io import BytesIO

import pdfplumber

def normalize_margin_text(text:str) -> str:
    # Normalize changing page numbers in repeated headers and footers
    text = re.sub(r"\d+", "#", text)
    return " ".join(text.lower().split())

def get_line_font_size(line: dict) -> float:
    # Find the most common font size among a line's visible characters.
    sizes = [
        round(character["size"], 1)
        for character in line["chars"]
        if character["text"].strip()
    ]

    if not sizes:
        return 0.0
    
    return Counter(sizes).most_common(1)[0][0]

def extract_pdf_text(
        pdf_bytes: bytes,
        start_page: int = 1,
        end_page: int | None = None,
        remove_footnotes: bool = True,
) -> dict:
    """
    Extract text with conservative header, footer and footnote cleanup. Page numbers are inclusive and start at one.

    Returns:
    {
        "text": extracted_text,
        "removed": removed lines with page numbers and reasons,
        "warnings": extraction limitations encountered,
    }
    """
    if not pdf_bytes:
        raise ValueError("The uploaded PDF is empty.")
    
    if len(pdf_bytes) > 20 * 1024 * 1024:
        raise ValueError("Please upload a PDF smaller than twenty megabytes.")
    
    if start_page < 1:
        raise ValueError("The starting page must be at least one.")
    
    try:
        pdf = pdfplumber.open(BytesIO(pdf_bytes))
    except Exception as error:
        raise ValueError(
            "Could not open this PDF. It may be damaged or password-protected."
        ) from error
    
    with pdf:
        total_pages = len(pdf.pages)

        if end_page is None:
            end_page = total_pages

        if not start_page <= end_page <= total_pages:
            raise ValueError(
                f"Choose a page range between one and {total_pages}."
            )
        if end_page - start_page + 1 > 100:
            raise ValueError("Please extract at most one hundred pages at a time.")
        
        pages_data = []
        margin_occurrences = Counter()
        warnings = []
        removed = []

        #First pass : collect text lines and repated margin candidates.
        for page_number in range(start_page, end_page + 1):
            page = pdf.pages[page_number - 1].dedupe_chars()

            lines = page.extract_text_lines(
                layout=False,
                strip=True,
                return_chars=True,
            )

            body_sizes = [
                round(character["size"], 1)
                for character in page.chars
                if character["text"].strip()
                and page.height * 0.15
                < character["top"]
                < page.height * 0.75
            ]

            body_font_size = (
                Counter(body_sizes).most_common(1)[0][0]
                if body_sizes
                else 0.0
            )

            margin_keys = set()

            for line in lines:
                if line["top"] < page.height * 0.08:
                    margin_keys.add(
                        ("header", normalize_margin_text(line["text"]))
                    )
                elif line["bottom"] > page.height * 0.92:
                    margin_keys.add(
                        ("footer", normalize_margin_text(line["text"]))
                    )
            margin_occurrences.update(margin_keys)

            pages_data.append(
                {
                    "number":page_number,
                    "height": page.height,
                    "body_font_size": body_font_size,
                    "lines": lines,
                }
            )

            if not lines:
                warnings.append(
                    f"Page {page_number} contains no extractable text. "
                    "It may be blank, scanned or require OCR."
                )
            
        minimum_repetitions = max(
            2,
            (len(pages_data) * 3 + 4) // 5,
        )

        repeated_margins = {
            key
            for key , count in margin_occurrences.items()
            if count >= minimum_repetitions
        }

        page_texts = []

        for page_data in pages_data:
            kept_lines = []
            in_footnote = False
            previous_bottom = None

            for line in page_data["lines"]:
                text = line["text"].strip()

                if not text:
                    continue

                height = page_data["height"]
                body_size = page_data["body_font_size"]
                line_size = get_line_font_size(line)

                region = None

                if line["top"] < height * 0.08:
                    region = "header"
                elif line["bottom"] > height * 0.92:
                    region = "footer"

                reason = None

                if region and (
                    region,
                    normalize_margin_text(text),
                ) in repeated_margins:
                    reason = f"Repeated {region}"

                elif region and re.fullmatch(
                    r"(?:page\s+)?\d+(?:\s+of\s+\d+)?",
                    text,
                    flags=re.IGNORECASE,
                ):
                    reason = "Likely page number"

                if remove_footnotes and reason is None:
                    near_bottom  = line["top"] > height * 0.65

                    smaller_font = (
                        body_size > 0
                        and 0 < line_size < body_size * 0.9
                    )

                    starts_with_marker = bool(
                        re.match(r"^(?:\d{1,3}[.)]?|[*†‡])\s+", text)
                    )

                    if near_bottom and smaller_font:
                        if starts_with_marker:
                            in_footnote = True
                        
                        if in_footnote:
                            reason = "Likely footnote"
                    else:
                        in_footnote = False

                if reason:
                    removed.append(
                        {
                            "page": page_data["number"],
                            "reason": reason,
                            "text": text,
                        }
                    )
                    continue
                #Preserve visible paragraph gaps.
                if (
                    previous_bottom is not None
                    and body_size > 0
                    and line["top"] - previous_bottom > body_size * 0.8
                ):
                    kept_lines.append("")
                
                kept_lines.append(text)
                previous_bottom = line["bottom"]

            page_text = "\n".join(kept_lines).strip()

            if page_text:
                page_texts.append(page_text)

        text = "\n\n".join(page_texts).strip()

        if not text:
            raise ValueError(
                "No usable text was extracted. Try disabling footnote removal "
                "or check whether this PDF needs OCR."
            )
        
        warnings.append(
            "Cleanup uses layout and font-size rules. Review the extracted "
            "text and removed lines, especially for multi-column pages."
        )

        return{
            "text": text,
            "removed": removed,
            "warnings": warnings,
        }
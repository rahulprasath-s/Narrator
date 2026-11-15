import hashlib
import json
import os
from pathlib import Path

import streamlit as st

from translator import generate_script
from browser_player import render_player
from pdf_parser import extract_pdf_text
from prompts import SCRIPT_INSTRUCTIONS

st.set_page_config(page_title="Narrator", page_icon="🎧", layout="centered",)

def split_text(text: str, limit: int = 12000) -> list[str]:
    remaining = text.strip()
    sections = []

    while len(remaining) > limit:
        cut = remaining.rfind("\n\n", 0 , limit)

        if cut < limit // 2:
            cut = remaining.rfind(" ", 0, limit)
        if cut < limit // 2:
            cut = limit

        sections.append(remaining[:cut].strip())
        remaining = remaining[cut:].lstrip()

    if remaining:
        sections.append(remaining)

    return sections

st.title("Narrator")
st.write("Turn complex ideas into words made for listening.")

st.caption(
    "Upload a PDF to translate it automatically using Claude. "
    "Translation uses your API credits; listening does not."
)

with st.sidebar:
    st.subheader("Document settings")

    with st.form("document_settings"):
        first_page = st.number_input(
            "First page",
            min_value=1,
            value=1,
        )

        last_page = st.number_input(
            "Last page",
            min_value=0,
            value=0,
            help="Zero means the final page. Use physical PDF page numbers.",
        )

        remove_footnotes = st.checkbox(
            "Remove likely footnotes",
            value=True,
        )

        st.form_submit_button("Apply settings")

    st.caption(
        "Text-based PDFs only. Maximum twenty megabytes "
        "and one hundred selected pages."
    )

uploaded_pdf = st.file_uploader(
    "Drop a PDF here, or choose a file",
    type=["pdf"],
    max_upload_size=20,
)

if "documents" not in st.session_state:
    st.session_state["documents"] = {}

if uploaded_pdf is None:
    st.info("Add a document to get started.")
    st.stop()

settings = {
    "first_page":int(first_page),
    "last_page": int(last_page),
    "remove_footnotes":remove_footnotes,
    "model":os.getenv("ANTHROPIC_MODEL", ""),
    "instructions":SCRIPT_INSTRUCTIONS,
    "pipeline_version":1,
}

pdf_bytes = uploaded_pdf.getvalue()

identity = hashlib.sha256(pdf_bytes)
identity.update(
    json.dumps(settings, sort_keys=True).encode("utf-8")
)
document_id = identity.hexdigest()

if document_id not in st.session_state["documents"]:
    st.session_state["documents"][document_id] = {
        "extraction":None,
        "sections":[],
        "translations": [],
        "error": None,
        "done": False,
    }

job = st.session_state["documents"][document_id]

st.caption(uploaded_pdf.name)

if job["error"]:
    st.error(job["error"])

    if st.button("Retry"):
        job["error"] = None

if not job["done"] and job["error"] is None:
    status = st.status(
        "Reading your document..",
        expanded=False,
    )

    try:
        if job["extraction"] is None:
            extraction = extract_pdf_text(
                pdf_bytes,
                start_page=int(first_page),
                end_page=int(last_page) or None,
                remove_footnotes = remove_footnotes,
            )

            job["extraction"] = extraction
            job["sections"] = split_text(extraction["text"])

        total = len(job["sections"])

        for index in range(len(job["translations"]), total):
            status.update(
                label=(
                    "Preparing your translation..."
                    f"{index + 1} of {total}"
                )
            )

            translation = generate_script(
                job["sections"][index]
            )

            job["translations"].append(translation)

        job["done"] = True

        status.update(
            label="Your translation is ready",
            state="complete",
        )

    except (ValueError, RuntimeError) as error:
        job["error"] = str(error)

        status.update(
            label="Your document needs attention",
            state="error",
        )

        st.rerun()

    except Exception:
        job["error"] = (
            "This document could not be processed. "
            "Try another PDF or a smaller page range."
        )

        status.update(
            label = "Could not process the document",
            state="error",
        )

        st.rerun()

if job["translations"]:
    script = "\n\n".join(job["translations"])

    st.subheader("Your translation")

    if not job["done"]:
        st.warning(
            "This is a partial translation. "
            "Retry to continue with the remaining sections."
        )
    elif len(job["sections"]) > 1:
        st.caption(
            "Translated in sections. Review transitions "
            "and references across section boundaries."
        )

    st.markdown(script)
    render_player(script)
    filename = (
        Path(uploaded_pdf.name).stem + "-translation.txt")

    st.download_button(
        "Download text",
        data = script,
        file_name = filename,
        mime = "text/plain",
        on_click = "ignore",
    )

if job["extraction"]:
    with st.expander("View source and cleanup"):
        extraction = job["extraction"]

        st.text_area(
            "Extracted source",
            value=extraction["text"],
            height=250,
            disabled=True,
        )

        for warning in extraction["warnings"]:
            st.warning(warning)

        if extraction["removed"]:
            st.write("Removed lines")

            st.dataframe(
                extraction["removed"],
                hide_index=True,
            )

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
    

st.title("Narrator")
st.write("Turn complex ideas into words made for listening.")

if "script" not in st.session_state:
    st.session_state["script"]=""

if "source_text" not in st.session_state:
    st.session_state["source_text"] = None

if "pdf_result" not in st.session_state:
    st.session_state["pdf_result"] = None

def clear_pdf_preview():
    st.session_state["pdf_result"] = None

st.subheader("Import a PDF")

uploaded_pdf = st.file_uploader(
    "Choose a text-based PDF",
    type=["pdf"],
    max_upload_size=20,
    on_change=clear_pdf_preview,
)

if uploaded_pdf is not None:
    st.caption(
        "Use physical PDF page numbers, starting at one. "
        "These may differ from printed page numbers."
    )

    with st.form("pdf_extraction"):
        left, right = st.columns(2)

        with left:
            start_page = st.number_input(
                "First page",
                min_value=1,
                value=1,
                step=1,
            )
        with right:
            end_page = st.number_input(
                "Last page",
                min_value=1,
                value=1,
                step=1,
            )
        
        remove_footnotes = st.checkbox(
            "Remove likely footnotes",
            value=True,
        )

        extract_clicked = st.form_submit_button("Extract PDF text")

    if extract_clicked:
        st.session_state["pdf_result"] = None

        try:
            with st.spinner("Extracting and cleaning PDF text..."):
                result = extract_pdf_text(
                    pdf_bytes=uploaded_pdf.getvalue(),
                    start_page = int(start_page),
                    end_page = int(end_page),
                    remove_footnotes=remove_footnotes,
                )
            result["description"] = (
                f"{uploaded_pdf.name} - "
                f"pages {int(start_page)} to {int(end_page)}"
            )

            st.session_state["pdf_result"] = result

        except ValueError as error:
            st.error(str(error))

        except Exception:
            st.error(
                "The PDF could not be processed. "
                "Trry another file or a smaller page range."
            )
        
pdf_result = st.session_state["pdf_result"]

if pdf_result is not None:
    st.caption(pdf_result["description"])
    extracted_text = pdf_result["text"]
    character_count = len(extracted_text)

    st.success(
        f"Extracted {character_count:,} characters. "
        f"Removed {len(pdf_result['removed'])} likely non-content lines."
    )

    with st.expander("Preview extracted text", expanded=True):
        st.text_area(
            "Extracted content",
            value=extracted_text,
            height=250,
            disabled=True,
        )
    with st.expander("Review removed lines"):
        if pdf_result["removed"]:
            st.dataframe(
                pdf_result["removed"],
                hide_index=True,
            )
        else:
            st.write("No lines were removed.")
            

source_text = st.text_area(
    "Source text",
    placeholder = "Paste an academic or philospohical passage here.",
    height = 250,
    max_chars=40000,
)

if st.button("Generate Script"):
    if not source_text.strip():
        st.warning("Please enter some text first.")
    else:
        try:
            with st.spinner("Turning your passage into a spoken script..."):
                script = generate_script(source_text)
            
            st.session_state["script"] = script
            st.success("Your script is ready.")

        except (ValueError, RuntimeError) as error:
            st.error(str(error))

if st.session_state["script"]:
    st.subheader("Spoken Script")

    st.text_area(
        "Review and edit your script",
        key="script",
        height=350,
    )

    render_player(st.session_state["script"])
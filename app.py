import streamlit as st
from anthropic import (APIConnectionError, APIStatusError, AuthenticationError, RateLimitError)
from translator import generate_script
from browser_player import render_player

st.set_page_config(page_title="Narrator", page_icon="🎧")
st.title("Narrator")
st.write("Turn complex ideas into words made for listening.")

if "script" not in st.session_state:
    st.session_state["script"]=""

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

        except AuthenticationError:
            st.error("Claude rejected the API key. Check your .env file")
        except RateLimitError:
            st.error("Claude's usage limit was reached. Wait before trying again.")
        except APIConnectionError:
            st.error("Could not reach Claude. Check your internet connection.")
        except APIStatusError:
            st.error(
                "Claude could not complete the request. "
                "Check your Console balance and model access."     
            )
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
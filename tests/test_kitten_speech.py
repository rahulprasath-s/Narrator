"""Test the audio/source mapping without downloading or executing a model."""
from io import BytesIO
import re
import unittest
from unittest.mock import Mock, patch

import numpy as np
import soundfile as sf

from kitten_speech import FRAME_SAMPLES, prepare_tokens, synthesize, text_chunks, utf16_offsets


class KittenTimingTests(unittest.TestCase):
    def model(self):
        vocabulary = {char: i for i, char in enumerate("$ abcdefghijklmnopqrstuvwxyz.,!?0123456789🌟")}
        phonemizer = Mock()
        phonemizer.phonemize.side_effect = lambda words: [word.lower() for word in words]
        session = Mock()

        def run(names, inputs):
            # Distinct per-token durations ensure markers cannot be implemented
            # as uniform word spacing. Output lengths follow Nano's graph.
            durations = np.arange(len(inputs["input_ids"][0])) % 4 + 1
            return np.full(int(durations.sum()) * FRAME_SAMPLES, .2), durations

        session.run.side_effect = run
        return session, phonemizer, {"luna": np.zeros((8, 4))}, {
            "voice_aliases": {"Luna": "luna"}, "speed_priors": {"luna": .8}
        }, vocabulary

    def test_sentence_chunks_keep_original_offsets_and_never_follow_seven_word_batches(self):
        text = "Dr. Ada explains one two three four five six seven eight nine.\n\nThen another idea."
        chunks = list(text_chunks(text))
        self.assertEqual(len(chunks), 2)
        self.assertGreater(len(chunks[0]), 7)
        self.assertEqual([word.group() for chunk in chunks for word in chunk], text.split())
        long = "a long passage " * 100
        self.assertTrue(all(c[-1].end() - c[0].start() <= 280 for c in text_chunks(long)))

    def test_phoneme_expansion_keeps_source_ownership(self):
        words = list(re.finditer(r"\S+", "42 cats"))
        vocabulary = {char: index for index, char in enumerate("$ fortywocats")}
        tokens, spans = prepare_tokens(words, ["forty two", "cats"], vocabulary)
        self.assertEqual(len(spans), 2)
        self.assertEqual(spans[0][0].group(), "42")
        self.assertGreater(spans[0][2] - spans[0][1], 2)
        self.assertLess(spans[0][2], spans[1][1])
        self.assertEqual(tokens[-2:], [10, 0])

    def test_audio_and_markers_share_cropped_chunk_lengths_and_utf16_offsets(self):
        text = "🌟 hello there.\n\nMore words follow here!"
        model = self.model()
        data, metadata = synthesize(text, "Luna", model)
        audio, sample_rate = sf.read(BytesIO(data))
        self.assertEqual(sample_rate, 24000)
        self.assertAlmostEqual(metadata["duration"], len(audio) / sample_rate)
        self.assertEqual(metadata["timing"], "model-predicted")
        self.assertEqual(len(metadata["words"]), len(text.split()))
        offsets = utf16_offsets(text)
        for word, marker in zip(re.finditer(r"\S+", text), metadata["words"], strict=True):
            self.assertEqual(marker["start"], offsets[word.start()])
            self.assertEqual(marker["end"], offsets[word.end()])
            self.assertLess(marker["time"], metadata["duration"])
        times = [word["time"] for word in metadata["words"]]
        self.assertEqual(times, sorted(times))
        # The second sentence starts after exactly the first cropped recording,
        # not after a fresh timer or the uncropped model output.
        first_inputs = model[0].run.call_args_list[0].args[1]
        count = len(first_inputs["input_ids"][0])
        first_samples = int((np.arange(count) % 4 + 1).sum()) * FRAME_SAMPLES - 5000
        self.assertAlmostEqual(times[3], (first_samples + FRAME_SAMPLES) / sample_rate)
        self.assertEqual(model[0].run.call_count, 2)

    def test_invalid_model_timings_fail_instead_of_guessing(self):
        model = self.model()
        model[0].run.side_effect = None
        model[0].run.return_value = (np.ones(12000), np.array([1]))
        with self.assertRaisesRegex(RuntimeError, "invalid audio timings"):
            synthesize("hello there", "Luna", model)

    def test_voice_options_are_only_luna_and_hugo(self):
        from kitten_speech import installed_voices, render_speech
        with patch("kitten_speech.find_spec", return_value=object()):
            self.assertEqual([v["name"] for v in installed_voices()], ["Luna", "Hugo"])
        with self.assertRaises(ValueError):
            render_speech("hello", "Samantha")

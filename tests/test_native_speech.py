import time
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from api import create_app
from native_speech import NativeAudioJobs, validate_markers, VOICE_IDS


class NativeSpeechTests(unittest.TestCase):
    def setUp(self):
        self.metadata = {"voice": VOICE_IDS["Samantha"], "duration": 1.0,
                         "words": [{"start": 0, "end": 5, "time": 0.0}]}
        self.renderer = Mock(return_value=(b"RIFF-fake-wave", self.metadata))
        self.manager = NativeAudioJobs(self.renderer)
        self.client = TestClient(create_app(speech_manager=self.manager), base_url="http://127.0.0.1")
        self.client.__enter__()
        self.headers = {"X-Narrator-Session": "native-voice-test-1234"}

    def tearDown(self):
        self.manager.executor.shutdown(wait=True)
        self.client.__exit__(None, None, None)

    def finished(self, identifier):
        for attempt in range(100):
            result = self.client.get(f"/api/speech/{identifier}", headers=self.headers).json()
            if result["state"] in ("ready", "error"):
                return result
            time.sleep(.01)
        self.fail("Native audio did not finish")

    def test_recordings_are_cached_and_private_to_the_session(self):
        result = self.client.post("/api/speech", headers=self.headers, json={"text": "hello", "voice": "Samantha"})
        self.assertEqual(result.status_code, 202)
        identifier = result.json()["id"]
        self.assertEqual(self.finished(identifier)["metadata"], self.metadata)
        response = self.client.get(f"/api/speech/{identifier}/file", headers=self.headers)
        self.assertEqual(response.content, b"RIFF-fake-wave")
        self.assertEqual(response.headers["content-type"], "audio/wav")
        again = self.client.post("/api/speech", headers=self.headers, json={"text": "hello", "voice": "Samantha"})
        self.assertEqual(again.json()["id"], identifier)
        self.renderer.assert_called_once_with("hello", "Samantha")
        other = {"X-Narrator-Session": "different-session-1234"}
        self.assertEqual(self.client.get(f"/api/speech/{identifier}/file", headers=other).status_code, 404)

    def test_native_voice_options_and_request_validation(self):
        with patch("api.installed_voices", return_value=[{"name": "Samantha", "id": VOICE_IDS["Samantha"], "lang": "en-US"}]):
            self.assertEqual(self.client.get("/api/speech/voices").json()["voices"][0]["name"], "Samantha")
        self.assertEqual(self.client.post("/api/speech", json={"text": "hello"}).status_code, 400)
        self.assertEqual(self.client.post("/api/speech", headers=self.headers, json={"text": "hello", "voice": "unknown"}).status_code, 422)
        self.assertEqual(self.client.post("/api/speech", headers=self.headers, json={"text": " "}).status_code, 400)
        self.renderer.assert_not_called()

    def test_failures_do_not_expose_internal_details(self):
        self.renderer.side_effect = Exception("Private process details")
        result = self.client.post("/api/speech", headers=self.headers, json={"text": "hello"})
        failure = self.finished(result.json()["id"])
        self.assertEqual(failure["state"], "error")
        self.assertNotIn("Private", failure["error"])

    def test_wrong_voice_and_invalid_word_timestamps_are_rejected(self):
        validate_markers("hello", self.metadata, "Samantha")
        with self.assertRaises(RuntimeError):
            validate_markers("hello", self.metadata, "Rishi")
        with self.assertRaises(RuntimeError):
            validate_markers("hi", self.metadata, "Samantha")
        unicode_metadata = {"voice": VOICE_IDS["Samantha"], "duration": 1.0,
                            "words": [{"start": 3, "end": 7, "time": .1}]}
        validate_markers("🌟 café", unicode_metadata, "Samantha")

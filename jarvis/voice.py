"""
Stem voor Jarvis (Fase 3).

- Spraak → tekst met faster-whisper (lokaal, gratis).
- Tekst → spraak met ElevenLabs (mooiste stem) of pyttsx3 als gratis fallback.

De zware pakketten worden pas geïmporteerd als je ze echt gebruikt, zodat
Fase 1/2 blijven werken zonder deze installatie. Installeer met:
    pip install faster-whisper sounddevice elevenlabs pyttsx3
"""
from __future__ import annotations

import queue
import sys
import tempfile
import wave

import config

SAMPLE_RATE = 16000


# ------------------------------------------------------------------
#  Spraak → tekst
# ------------------------------------------------------------------
class Ears:
    """Neemt op via de microfoon en zet spraak om naar tekst (Whisper)."""

    def __init__(self, model_size: str = "base") -> None:
        try:
            from faster_whisper import WhisperModel
        except ImportError:  # pragma: no cover
            raise SystemExit(
                "faster-whisper ontbreekt. Installeer met:\n"
                "    pip install faster-whisper sounddevice"
            )
        print("   · Whisper-model laden (eenmalig even geduld)...")
        self._model = WhisperModel(model_size, device="cpu", compute_type="int8")

    def listen(self, seconds: float = 5.0) -> str:
        """Neem `seconds` seconden op en geef de herkende tekst terug."""
        try:
            import sounddevice as sd
        except ImportError:  # pragma: no cover
            raise SystemExit("sounddevice ontbreekt. Installeer met: pip install sounddevice")

        print(f"   · Luisteren ({seconds:.0f}s)... spreek nu.")
        audio = sd.rec(int(seconds * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype="int16")
        sd.wait()

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            path = tmp.name
        with wave.open(path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(audio.tobytes())

        segments, _ = self._model.transcribe(path, language="nl")
        return "".join(seg.text for seg in segments).strip()


# ------------------------------------------------------------------
#  Tekst → spraak
# ------------------------------------------------------------------
class Voice:
    """Spreekt tekst uit. Gebruikt ElevenLabs indien beschikbaar, anders pyttsx3."""

    def __init__(self) -> None:
        self.backend = None
        if config.ELEVENLABS_API_KEY:
            try:
                from elevenlabs.client import ElevenLabs

                self._el = ElevenLabs(api_key=config.ELEVENLABS_API_KEY)
                self.backend = "elevenlabs"
            except ImportError:
                pass
        if self.backend is None:
            try:
                import pyttsx3

                self._engine = pyttsx3.init()
                self.backend = "pyttsx3"
            except Exception:  # noqa: BLE001
                self.backend = None

    def say(self, text: str) -> None:
        if not text:
            return
        if self.backend == "elevenlabs":
            from elevenlabs import play

            audio = self._el.text_to_speech.convert(
                text=text,
                voice_id="JBFqnCBsd6RMkjVDRZzb",  # standaard stem; pas aan naar smaak
                model_id="eleven_multilingual_v2",
            )
            play(audio)
        elif self.backend == "pyttsx3":
            self._engine.say(text)
            self._engine.runAndWait()
        else:
            print("   · (geen TTS beschikbaar — installeer elevenlabs of pyttsx3)")

"""OpenAI Whisper (code + weights both MIT licensed,
https://github.com/openai/whisper) for English/multilingual transcription,
and as the fallback for Hindi/Telugu when IndicConformer isn't configured.
"""
from __future__ import annotations

import logging
import math

from app.config import settings
from app.services.transcription.base import TranscriptionProvider, TranscriptionResult

logger = logging.getLogger(__name__)

_model = None


def _load():
    global _model
    if _model is None:
        import whisper

        _model = whisper.load_model(settings.whisper_model, device=settings.device)
    return _model


class WhisperProvider(TranscriptionProvider):
    name = "whisper"

    def transcribe(self, wav_path: str, language: str | None) -> TranscriptionResult:
        model = _load()
        result = model.transcribe(wav_path, language=language, fp16=settings.device == "cuda")

        segments = result.get("segments") or []
        if segments:
            avg_logprob = sum(s.get("avg_logprob", 0.0) for s in segments) / len(segments)
            confidence = max(0.0, min(1.0, math.exp(avg_logprob)))
        else:
            confidence = None

        return TranscriptionResult(text=(result.get("text") or "").strip(), confidence=confidence)

"""pyannote.audio (MIT-licensed toolkit; individual pretrained models/pipelines
carry their own model-card terms which must be checked separately —
https://github.com/pyannote/pyannote-audio) for speaker diarization. Uses the
open `pyannote/speaker-diarization-community-1` pipeline by default.
Requires a Hugging Face token with access to the pipeline's gated model card.
"""
from __future__ import annotations

import logging

from app.config import settings
from app.services.diarization.base import DiarizationProvider, RawSpeakerSegment

logger = logging.getLogger(__name__)

_pipeline = None


def _load():
    global _pipeline
    if _pipeline is None:
        from pyannote.audio import Pipeline

        _pipeline = Pipeline.from_pretrained(
            settings.pyannote_pipeline,
            use_auth_token=settings.huggingface_token or None,
        )
        if settings.device == "cuda":
            import torch

            _pipeline.to(torch.device("cuda"))
    return _pipeline


class PyannoteProvider(DiarizationProvider):
    name = "pyannote-community-1"

    def diarize(self, wav_path: str) -> list[RawSpeakerSegment]:
        pipeline = _load()
        diarization = pipeline(wav_path)

        segments: list[RawSpeakerSegment] = []
        for turn, _track, speaker in diarization.itertracks(yield_label=True):
            segments.append(RawSpeakerSegment(start=float(turn.start), end=float(turn.end), speaker=str(speaker)))
        return segments

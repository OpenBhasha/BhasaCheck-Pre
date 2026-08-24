"""pyannote.audio (MIT-licensed toolkit; individual pretrained models/pipelines
carry their own model-card terms which must be checked separately —
https://github.com/pyannote/pyannote-audio) for speaker diarization. Uses the
open `pyannote/speaker-diarization-community-1` pipeline by default, which
requires pyannote.audio>=4.0 (its PLDA-based clustering isn't supported by
3.x). Requires a Hugging Face token with access to the pipeline's gated
model card (and its dependency models, e.g. pyannote/segmentation-3.0).
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

        loaded = Pipeline.from_pretrained(
            settings.pyannote_pipeline,
            token=settings.huggingface_token or None,
        )
        if loaded is None:
            # pyannote.audio does NOT raise on auth/access failure here — it
            # prints a warning and returns None. Turn that into a real error
            # instead of letting callers do `None(wav_path)` later.
            raise RuntimeError(
                f"Pipeline.from_pretrained('{settings.pyannote_pipeline}') returned None. "
                "This almost always means either: (1) HUGGINGFACE_TOKEN is unset/invalid in "
                "ml-service/.env, or (2) you haven't accepted the gated model terms for "
                f"'{settings.pyannote_pipeline}' (and its dependency models, e.g. "
                "pyannote/segmentation-3.0) on huggingface.co while logged in as that token's user."
            )
        _pipeline = loaded
        if settings.device == "cuda":
            import torch

            _pipeline.to(torch.device("cuda"))
    return _pipeline


def _load_waveform(wav_path: str):
    """Reads audio via soundfile into the {waveform, sample_rate} dict form
    pyannote.audio accepts directly. Deliberately avoids passing a bare file
    path to the pipeline: pyannote 4.x decodes those via torchcodec, which
    requires a CUDA nvrtc library that isn't present on a CPU-only host —
    this bypasses that decode path entirely, exactly as pyannote's own
    warning recommends.
    """
    import soundfile as sf
    import torch

    data, sample_rate = sf.read(wav_path, dtype="float32", always_2d=True)
    waveform = torch.from_numpy(data.T)  # (channel, time)
    return {"waveform": waveform, "sample_rate": sample_rate}


class PyannoteProvider(DiarizationProvider):
    name = "pyannote-community-1"

    def diarize(self, wav_path: str) -> list[RawSpeakerSegment]:
        pipeline = _load()
        result = pipeline(_load_waveform(wav_path))
        # pyannote.audio 4.x wraps the result in DiarizeOutput; the plain
        # Annotation (with overlap preserved, not the "exclusive" variant)
        # lives on .speaker_diarization.
        diarization = result.speaker_diarization

        segments: list[RawSpeakerSegment] = []
        for turn, _track, speaker in diarization.itertracks(yield_label=True):
            segments.append(RawSpeakerSegment(start=float(turn.start), end=float(turn.end), speaker=str(speaker)))
        return segments

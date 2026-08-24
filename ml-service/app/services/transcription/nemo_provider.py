"""NVIDIA NeMo (Apache-2.0 toolkit, https://github.com/NVIDIA/NeMo; individual
pretrained checkpoints carry their own licenses that must be verified before
production use — see README) as a third, optional transcription provider.
Configured via NEMO_MODEL_PATH: a local ".nemo" checkpoint path is restored
directly, anything else is treated as a NGC/HuggingFace pretrained model
name. Not routed to by default for any language — wired in for deployments
that specifically want it (see pipelines/audio_pipeline.py).
"""
from __future__ import annotations

import logging

from app.config import settings
from app.services.transcription.base import TranscriptionProvider, TranscriptionResult

logger = logging.getLogger(__name__)

_model = None


def is_configured() -> bool:
    return bool(settings.nemo_model_path)


def _load():
    global _model
    if _model is None:
        if not is_configured():
            raise RuntimeError("NEMO_MODEL_PATH is not configured")
        import nemo.collections.asr as nemo_asr

        if settings.nemo_model_path.endswith(".nemo"):
            _model = nemo_asr.models.ASRModel.restore_from(settings.nemo_model_path)
        else:
            _model = nemo_asr.models.ASRModel.from_pretrained(settings.nemo_model_path)
        if settings.device == "cuda":
            _model = _model.cuda()
        _model.eval()
    return _model


class NeMoProvider(TranscriptionProvider):
    name = "nemo"

    def transcribe(self, wav_path: str, language: str | None) -> TranscriptionResult:
        model = _load()
        hypotheses = model.transcribe([wav_path])
        text = hypotheses[0] if hypotheses else ""
        if hasattr(text, "text"):
            text = text.text
        return TranscriptionResult(text=str(text).strip(), confidence=None)

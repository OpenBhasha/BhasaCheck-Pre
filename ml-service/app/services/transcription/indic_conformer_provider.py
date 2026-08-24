"""IndicConformer (AI4Bharat, https://github.com/AI4Bharat/IndicConformerASR)
for Hindi/Telugu transcription. Requires a local NeMo (.nemo) checkpoint —
IndicConformer's code is Apache-2.0, but the released checkpoints have their
own model-card terms that must be verified independently before production
use (see README). Not loaded unless INDIC_CONFORMER_MODEL_PATH is set, so a
deployment without the checkpoint simply routes Hindi/Telugu to Whisper
instead (see pipelines/audio_pipeline.py).
"""
from __future__ import annotations

import logging

from app.config import settings
from app.services.transcription.base import TranscriptionProvider, TranscriptionResult

logger = logging.getLogger(__name__)

_model = None


def is_configured() -> bool:
    return bool(settings.indic_conformer_model_path)


def _load():
    global _model
    if _model is None:
        if not is_configured():
            raise RuntimeError("INDIC_CONFORMER_MODEL_PATH is not configured")
        import nemo.collections.asr as nemo_asr

        _model = nemo_asr.models.EncDecCTCModel.restore_from(settings.indic_conformer_model_path)
        if settings.device == "cuda":
            _model = _model.cuda()
        _model.eval()
    return _model


class IndicConformerProvider(TranscriptionProvider):
    name = "indic-conformer"

    def transcribe(self, wav_path: str, language: str | None) -> TranscriptionResult:
        model = _load()
        hypotheses = model.transcribe([wav_path])
        text = hypotheses[0] if hypotheses else ""
        if hasattr(text, "text"):  # newer NeMo versions return Hypothesis objects
            text = text.text
        return TranscriptionResult(text=str(text).strip(), confidence=None)

"""Silero VAD (MIT licensed, https://github.com/snakers4/silero-vad) for
binary speech/non-speech segmentation. Loaded once per process via
torch.hub and reused across requests.
"""
from __future__ import annotations

import logging

from app.services.vad.base import VadProvider

logger = logging.getLogger(__name__)

_model = None
_utils = None


def _load():
    global _model, _utils
    if _model is None:
        import torch

        _model, _utils = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            force_reload=False,
            onnx=False,
        )
    return _model, _utils


class SileroVadProvider(VadProvider):
    name = "silero-vad"

    def get_speech_spans(self, wav_path: str) -> list[tuple[float, float]]:
        model, utils = _load()
        get_speech_timestamps, _, read_audio, *_ = utils

        wav = read_audio(wav_path, sampling_rate=16000)
        timestamps = get_speech_timestamps(wav, model, sampling_rate=16000, return_seconds=True)
        return [(float(t["start"]), float(t["end"])) for t in timestamps]

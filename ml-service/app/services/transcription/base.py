from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TranscriptionResult:
    text: str
    confidence: float | None


class TranscriptionProvider(ABC):
    """A single provider transcribes one already-cut audio segment at a time
    (segments are produced upstream by FFmpeg from the VAD/diarization
    timestamps — see utils/ffmpeg.py). Providers never decide segment
    boundaries themselves.
    """

    name: str

    @abstractmethod
    def transcribe(self, wav_path: str, language: str | None) -> TranscriptionResult:
        raise NotImplementedError

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class RawSpeakerSegment:
    start: float
    end: float
    speaker: str


class DiarizationProvider(ABC):
    """Speaker diarization — who spoke when. May return overlapping segments
    (different speakers with intersecting time ranges); the pipeline
    preserves that overlap rather than collapsing it into one speaker.
    """

    name: str

    @abstractmethod
    def diarize(self, wav_path: str) -> list[RawSpeakerSegment]:
        raise NotImplementedError

from __future__ import annotations

from abc import ABC, abstractmethod


class VadProvider(ABC):
    """Binary speech/non-speech detection. Returns only the speech spans
    (in seconds); the pipeline fills the gaps in as non-speech to build the
    full timeline.
    """

    name: str

    @abstractmethod
    def get_speech_spans(self, wav_path: str) -> list[tuple[float, float]]:
        raise NotImplementedError

from __future__ import annotations

from abc import ABC, abstractmethod


class MusicRemovalProvider(ABC):
    """Separates speech/vocals from background music. Swappable — the
    pipeline only depends on this interface, never on a specific provider.
    """

    name: str

    @abstractmethod
    def separate_vocals(self, input_wav_path: str, work_dir: str) -> str:
        """Returns the filesystem path to a vocals-only WAV file."""
        raise NotImplementedError

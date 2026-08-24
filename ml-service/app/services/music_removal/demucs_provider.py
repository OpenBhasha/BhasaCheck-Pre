"""Demucs (MIT licensed, https://github.com/facebookresearch/demucs) run in
its two-stem mode to extract a vocals-only track. Demucs is a music
source-separation model first and foremost — it is not guaranteed to cleanly
remove every kind of background music from every recording. If it fails or
produces no usable output, `separate_vocals` raises so the pipeline records
the error rather than silently passing through un-separated audio.
"""
from __future__ import annotations

import glob
import logging
import os
import subprocess

from app.config import settings
from app.services.music_removal.base import MusicRemovalProvider

logger = logging.getLogger(__name__)


class DemucsProvider(MusicRemovalProvider):
    name = "demucs"

    def __init__(self, model: str | None = None):
        self.model = model or settings.demucs_model

    def separate_vocals(self, input_wav_path: str, work_dir: str) -> str:
        out_dir = os.path.join(work_dir, "demucs_out")
        os.makedirs(out_dir, exist_ok=True)

        cmd = [
            "python", "-m", "demucs.separate",
            "-n", self.model,
            "--two-stems", "vocals",
            "-o", out_dir,
            "-d", settings.device,
            input_wav_path,
        ]
        logger.info("Running Demucs: %s", " ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"Demucs failed (exit {result.returncode}): {result.stderr[-2000:]}")

        matches = glob.glob(os.path.join(out_dir, self.model, "*", "vocals.wav"))
        if not matches:
            raise RuntimeError("Demucs completed but no vocals.wav output was found")
        return matches[0]

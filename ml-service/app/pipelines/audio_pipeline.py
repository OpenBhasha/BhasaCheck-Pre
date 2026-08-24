"""Orchestrates the full preprocessing pipeline for one uploaded audio file:

    Cloudinary (download)
        -> Music Removal (Demucs)
        -> Binary Speech Segmentation (Silero VAD)
        -> Speaker Diarization (pyannote.audio)
        -> combine binary + speaker segments
        -> Audio Segment Creation (FFmpeg, cutting on the ML-determined timestamps)
        -> Transcription (Whisper / IndicConformer / NeMo, routed by language)
        -> stage callbacks into Node's internal API at every step

Each stage is wrapped so a failure anywhere reports {stage, error} to Node
and stops the run, rather than silently producing partial/wrong results.
"""
from __future__ import annotations

import logging
import os
import shutil
import uuid

from app.config import settings
from app.services.diarization.pyannote_provider import PyannoteProvider
from app.services.music_removal.demucs_provider import DemucsProvider
from app.services.transcription.base import TranscriptionProvider
from app.services.transcription.indic_conformer_provider import IndicConformerProvider
from app.services.transcription.indic_conformer_provider import is_configured as indic_configured
from app.services.transcription.nemo_provider import NeMoProvider
from app.services.transcription.whisper_provider import WhisperProvider
from app.services.vad.silero_provider import SileroVadProvider
from app.pipelines.segment_merger import combine_segments
from app.utils import ffmpeg
from app.utils.cloudinary_client import download, upload_processed_audio
from app.utils.node_callback import post_stage_update

logger = logging.getLogger(__name__)

MIN_SEGMENT_DURATION_SEC = 0.2

_music_removal_provider = DemucsProvider()
_vad_provider = SileroVadProvider()
_diarization_provider = PyannoteProvider()
_whisper_provider = WhisperProvider()
_indic_conformer_provider = IndicConformerProvider()
_nemo_provider = NeMoProvider()


def _pick_transcription_provider(language: str | None) -> TranscriptionProvider:
    if language in settings.indic_languages and indic_configured():
        return _indic_conformer_provider
    return _whisper_provider


class PipelineError(Exception):
    def __init__(self, stage: str, message: str):
        super().__init__(message)
        self.stage = stage
        self.message = message


def run_pipeline(
    task_id: str,
    dataset_id: str,
    audio_url: str,
    language: str | None,
    callback_url: str,
    callback_secret: str,
) -> None:
    def report(stage: str, **fields) -> None:
        post_stage_update(callback_url, callback_secret, {"stage": stage, **fields})

    work_dir = os.path.join(settings.work_dir, f"{dataset_id}-{uuid.uuid4().hex[:8]}")
    os.makedirs(work_dir, exist_ok=True)

    try:
        original_path = os.path.join(work_dir, "original")
        download(audio_url, original_path)

        normalized_path = os.path.join(work_dir, "normalized.wav")
        try:
            ffmpeg.to_wav_mono_16k(original_path, normalized_path)
        except Exception as exc:  # noqa: BLE001
            raise PipelineError("processing", f"Failed to normalize input audio: {exc}") from exc

        # --- Music removal (Demucs) ---
        report("music_removal", progress=10)
        try:
            vocals_path = _music_removal_provider.separate_vocals(normalized_path, work_dir)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Demucs failed for dataset %s, falling back to normalized audio: %s", dataset_id, exc)
            vocals_path = normalized_path

        processed_upload = None
        if vocals_path != normalized_path:
            try:
                processed_upload = upload_processed_audio(vocals_path, folder=f"rsml/processed/{task_id}")
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to upload processed audio for dataset %s: %s", dataset_id, exc)

        report(
            "music_removal",
            progress=25,
            modelUsed=_music_removal_provider.name,
            **({"processedAudio": processed_upload} if processed_upload else {}),
        )

        # --- Binary speech segmentation (Silero VAD) ---
        try:
            speech_spans = _vad_provider.get_speech_spans(vocals_path)
        except Exception as exc:  # noqa: BLE001
            raise PipelineError("binary_segmentation", f"Silero VAD failed: {exc}") from exc

        audio_info = ffmpeg.probe(vocals_path)
        binary_segments = _fill_gaps_as_non_speech(speech_spans, audio_info.duration_sec)

        report(
            "binary_segmentation",
            progress=45,
            modelUsed=_vad_provider.name,
            binarySegments=[{"startTime": s, "endTime": e, "isSpeech": sp} for s, e, sp in binary_segments],
        )

        # --- Speaker diarization (pyannote.audio) ---
        try:
            raw_speaker_segments = _diarization_provider.diarize(vocals_path)
        except Exception as exc:  # noqa: BLE001
            raise PipelineError("speaker_diarization", f"pyannote diarization failed: {exc}") from exc

        report(
            "speaker_diarization",
            progress=65,
            modelUsed=_diarization_provider.name,
            speakerSegments=[
                {
                    "startTime": s.start,
                    "endTime": s.end,
                    "speaker": s.speaker,
                    "overlappingSpeakers": [],
                }
                for s in raw_speaker_segments
            ],
        )

        # --- Combine binary + speaker segments, then cut + transcribe ---
        combined = combine_segments(binary_segments, raw_speaker_segments)
        provider = _pick_transcription_provider(language)

        transcript_segments = []
        for idx, seg in enumerate(combined):
            duration = seg.end - seg.start
            if not seg.is_speech or duration < MIN_SEGMENT_DURATION_SEC:
                transcript_segments.append(
                    {
                        "startTime": seg.start,
                        "endTime": seg.end,
                        "isSpeech": seg.is_speech,
                        "speaker": seg.speaker,
                        "overlappingSpeakers": seg.overlapping_speakers,
                        "language": None,
                        "text": "",
                        "transcriptionModel": None,
                        "confidence": None,
                    }
                )
                continue

            segment_path = os.path.join(work_dir, f"segment-{idx}.wav")
            try:
                ffmpeg.extract_segment(vocals_path, segment_path, seg.start, seg.end)
                result = provider.transcribe(segment_path, language)
            except Exception as exc:  # noqa: BLE001
                raise PipelineError("transcription", f"Transcription failed on segment {idx}: {exc}") from exc

            transcript_segments.append(
                {
                    "startTime": seg.start,
                    "endTime": seg.end,
                    "isSpeech": True,
                    "speaker": seg.speaker,
                    "overlappingSpeakers": seg.overlapping_speakers,
                    "language": language,
                    "text": result.text,
                    "transcriptionModel": provider.name,
                    "confidence": result.confidence,
                }
            )

        report(
            "transcription",
            progress=90,
            modelUsed=provider.name,
            transcriptSegments=transcript_segments,
        )

        report("completed", progress=100)

    except PipelineError as exc:
        logger.error("Pipeline failed for dataset %s at stage %s: %s", dataset_id, exc.stage, exc.message)
        report("failed", error=f"[{exc.stage}] {exc.message}")
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected pipeline failure for dataset %s", dataset_id)
        report("failed", error=str(exc))
        raise
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _fill_gaps_as_non_speech(
    speech_spans: list[tuple[float, float]], total_duration: float
) -> list[tuple[float, float, bool]]:
    spans = sorted(speech_spans)
    segments: list[tuple[float, float, bool]] = []
    cursor = 0.0

    for start, end in spans:
        if start > cursor:
            segments.append((cursor, start, False))
        segments.append((start, end, True))
        cursor = max(cursor, end)

    if cursor < total_duration:
        segments.append((cursor, total_duration, False))

    return segments

"""Merges the binary VAD timeline with the (possibly overlapping) speaker
diarization segments into one combined timeline, preserving both pieces of
information rather than collapsing one into the other (per the system
design's explicit rule: never replace "is speech present" with "who is
speaking", or vice versa — keep both).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.services.diarization.base import RawSpeakerSegment


@dataclass
class CombinedSegment:
    start: float
    end: float
    is_speech: bool
    speaker: str | None
    overlapping_speakers: list[str] = field(default_factory=list)


def _overlaps(a_start: float, a_end: float, b_start: float, b_end: float) -> bool:
    return a_start < b_end and b_start < a_end


def combine_segments(
    binary_segments: list[tuple[float, float, bool]],
    speaker_segments: list[RawSpeakerSegment],
) -> list[CombinedSegment]:
    breakpoints: set[float] = {0.0}
    for start, end, _ in binary_segments:
        breakpoints.add(round(start, 3))
        breakpoints.add(round(end, 3))
    for seg in speaker_segments:
        breakpoints.add(round(seg.start, 3))
        breakpoints.add(round(seg.end, 3))

    ordered = sorted(breakpoints)

    raw_intervals: list[CombinedSegment] = []
    for t0, t1 in zip(ordered, ordered[1:]):
        if t1 - t0 < 1e-3:
            continue

        is_speech = False
        for b_start, b_end, b_is_speech in binary_segments:
            if _overlaps(t0, t1, b_start, b_end):
                is_speech = is_speech or b_is_speech

        speakers_here = [s.speaker for s in speaker_segments if _overlaps(t0, t1, s.start, s.end)]
        # Preserve first-seen order, de-duplicated.
        seen: list[str] = []
        for sp in speakers_here:
            if sp not in seen:
                seen.append(sp)

        primary = seen[0] if seen else None
        overlapping = seen[1:] if len(seen) > 1 else []

        raw_intervals.append(
            CombinedSegment(start=t0, end=t1, is_speech=is_speech, speaker=primary, overlapping_speakers=overlapping)
        )

    return _coalesce(raw_intervals)


def _coalesce(intervals: list[CombinedSegment]) -> list[CombinedSegment]:
    """Merges consecutive intervals that share the same (is_speech, speaker,
    overlapping_speakers) signature, so a fine breakpoint partition doesn't
    turn into hundreds of near-duplicate micro-segments.
    """
    merged: list[CombinedSegment] = []
    for interval in intervals:
        if merged:
            last = merged[-1]
            same_signature = (
                last.is_speech == interval.is_speech
                and last.speaker == interval.speaker
                and last.overlapping_speakers == interval.overlapping_speakers
                and abs(last.end - interval.start) < 1e-3
            )
            if same_signature:
                last.end = interval.end
                continue
        merged.append(interval)
    return merged

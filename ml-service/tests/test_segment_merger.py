from app.pipelines.segment_merger import combine_segments
from app.services.diarization.base import RawSpeakerSegment


def test_combine_segments_basic_speech_and_silence():
    binary = [(0.0, 2.0, False), (2.0, 8.0, True), (8.0, 10.0, False)]
    speakers = [RawSpeakerSegment(start=2.0, end=8.0, speaker="SPEAKER_00")]

    combined = combine_segments(binary, speakers)

    assert [(round(c.start, 2), round(c.end, 2), c.is_speech, c.speaker) for c in combined] == [
        (0.0, 2.0, False, None),
        (2.0, 8.0, True, "SPEAKER_00"),
        (8.0, 10.0, False, None),
    ]


def test_combine_segments_preserves_overlapping_speakers():
    binary = [(0.0, 10.0, True)]
    speakers = [
        RawSpeakerSegment(start=0.0, end=6.0, speaker="SPEAKER_00"),
        RawSpeakerSegment(start=4.0, end=10.0, speaker="SPEAKER_01"),
    ]

    combined = combine_segments(binary, speakers)

    overlap_segment = next(c for c in combined if c.start == 4.0)
    assert overlap_segment.speaker == "SPEAKER_00"
    assert overlap_segment.overlapping_speakers == ["SPEAKER_01"]

    # non-overlapping regions still report just their own speaker
    solo_start = next(c for c in combined if c.start == 0.0)
    assert solo_start.speaker == "SPEAKER_00"
    assert solo_start.overlapping_speakers == []


def test_combine_segments_coalesces_identical_adjacent_signatures():
    # Binary VAD breakpoint at 5.0 doesn't correspond to any speaker change,
    # so the two resulting sub-intervals should merge back into one.
    binary = [(0.0, 5.0, True), (5.0, 10.0, True)]
    speakers = [RawSpeakerSegment(start=0.0, end=10.0, speaker="SPEAKER_00")]

    combined = combine_segments(binary, speakers)

    assert len(combined) == 1
    assert combined[0].start == 0.0
    assert combined[0].end == 10.0

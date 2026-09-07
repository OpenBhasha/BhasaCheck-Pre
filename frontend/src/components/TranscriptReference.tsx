import type { TranscriptSegment } from '../types';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface TranscriptReferenceProps {
  segments: TranscriptSegment[];
  /** Called with a segment's start time (seconds) when its timestamp is clicked. */
  onSeek?: (startTime: number) => void;
}

export function TranscriptReference({ segments, onSeek }: TranscriptReferenceProps) {
  const speechSegments = segments.filter((s) => s.isSpeech);

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>ML-drafted transcript (reference)</h3>
      <p className="hint" style={{ marginBottom: 12 }}>
        Machine-generated — use it as a starting point, not ground truth. Add RSML tags in the text pane
        below.
        {onSeek && ' Click a timestamp to jump the audio there.'}
      </p>
      {speechSegments.length === 0 ? (
        <p className="empty">No speech detected.</p>
      ) : (
        speechSegments.map((seg, i) => (
          <div className="transcript-line" key={i}>
            {onSeek ? (
              <button
                type="button"
                className="ts ts-link"
                onClick={() => onSeek(seg.startTime)}
                title={`Play from ${formatTime(seg.startTime)}`}
              >
                {formatTime(seg.startTime)}–{formatTime(seg.endTime)}
              </button>
            ) : (
              <span className="ts">
                {formatTime(seg.startTime)}–{formatTime(seg.endTime)}
              </span>
            )}
            {seg.speaker && <span className="speaker">{seg.speaker}</span>}
            {seg.overlappingSpeakers.length > 0 && (
              <span className="hint">(+{seg.overlappingSpeakers.join(', ')})</span>
            )}
            <span>{seg.text || <em>(no transcript)</em>}</span>
          </div>
        ))
      )}
    </div>
  );
}

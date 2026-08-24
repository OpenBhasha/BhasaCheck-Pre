import type { TranscriptSegment } from '../types';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TranscriptReference({ segments }: { segments: TranscriptSegment[] }) {
  const speechSegments = segments.filter((s) => s.isSpeech);

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>ML-drafted transcript (reference)</h3>
      <p className="hint" style={{ marginBottom: 12 }}>
        Machine-generated — use it as a starting point, not ground truth. Add RSML tags in the text pane
        below.
      </p>
      {speechSegments.length === 0 ? (
        <p className="empty">No speech detected.</p>
      ) : (
        speechSegments.map((seg, i) => (
          <div className="transcript-line" key={i}>
            <span className="ts">
              {formatTime(seg.startTime)}–{formatTime(seg.endTime)}
            </span>
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

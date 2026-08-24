import type { Dataset } from '../types';
import { StatusBadge } from './StatusBadge';

const STAGES = [
  'pending',
  'processing',
  'music_removal',
  'binary_segmentation',
  'speaker_diarization',
  'transcription',
  'completed',
];

export function ProcessingStatusPanel({ dataset }: { dataset: Dataset }) {
  const { status, progress, error } = dataset.processing;
  const isFailed = status === 'failed';
  const stageIndex = STAGES.indexOf(status);

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Audio preprocessing</h3>
        <StatusBadge status={status} />
      </div>

      {isFailed ? (
        <div className="error-banner">{error ?? 'Processing failed.'}</div>
      ) : (
        <>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Stage {Math.max(stageIndex, 0) + 1} of {STAGES.length}: {status.replace(/_/g, ' ')} — this page
            checks for updates automatically.
          </p>
        </>
      )}

      <p className="hint">
        Annotation opens automatically once music removal, speech segmentation, speaker diarization, and
        transcription have all finished.
      </p>
    </div>
  );
}

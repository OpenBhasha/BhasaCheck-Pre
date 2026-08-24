const TONE_BY_STATUS: Record<string, 'success' | 'danger' | 'warn' | 'muted' | 'default'> = {
  approved: 'success',
  accepted: 'success',
  completed: 'success',
  active: 'success',

  rejected: 'danger',
  failed: 'danger',
  deactivated: 'danger',

  pending: 'warn',
  processing: 'warn',
  music_removal: 'warn',
  binary_segmentation: 'warn',
  speaker_diarization: 'warn',
  transcription: 'warn',
  to_correct: 'warn',
  review_in_progress: 'warn',
  annotation_in_progress: 'warn',
  submitted: 'warn',

  draft: 'muted',
  unassigned: 'muted',
  archived: 'muted',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = TONE_BY_STATUS[status] ?? 'default';
  const className = tone === 'default' ? 'badge' : `badge badge-${tone}`;
  return <span className={className}>{status.replace(/_/g, ' ')}</span>;
}

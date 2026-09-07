export type GlobalRole = 'super_admin' | 'admin' | 'reviewer' | 'annotator';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'deactivated';
export type ProjectRole = 'admin' | 'reviewer' | 'annotator';
export type ProjectStatus = 'active' | 'archived';

export type TaskStatus =
  | 'unassigned'
  | 'annotation_in_progress'
  | 'annotated'
  | 'review_in_progress'
  | 'accepted'
  | 'rejected';

export type AnnotationType = 'annotation' | 'review';
export type AnnotationStatus = 'draft' | 'submitted' | 'accepted' | 'rejected' | 'to_correct';
export type ReviewDecision = 'accept' | 'reject' | 'to_correct';

export type ProcessingStatus =
  | 'pending'
  | 'processing'
  | 'music_removal'
  | 'binary_segmentation'
  | 'speaker_diarization'
  | 'transcription'
  | 'completed'
  | 'failed';

export type AudioStorageProvider = 'cloudinary' | 'local';

export interface AccessTokenPayload {
  sub: string;
  role: GlobalRole;
  status: UserStatus;
}

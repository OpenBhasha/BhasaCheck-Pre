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

export type AudioStorageProvider = 'cloudinary' | 'local';

export type ProcessingStatus =
  | 'pending'
  | 'processing'
  | 'music_removal'
  | 'binary_segmentation'
  | 'speaker_diarization'
  | 'transcription'
  | 'completed'
  | 'failed';

export interface User {
  id: string;
  name: string;
  email: string;
  role: GlobalRole;
  status: UserStatus;
  approvedBy?: string | null;
  createdAt?: string;
}

export interface ProjectMember {
  user: { id: string; name: string; email: string } | string;
  projectRole: ProjectRole;
  addedAt: string;
}

export interface Project {
  _id: string;
  name: string;
  description?: string;
  language?: string;
  createdBy: string;
  members: ProjectMember[];
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegment {
  startTime: number;
  endTime: number;
  isSpeech: boolean;
  speaker: string | null;
  overlappingSpeakers: string[];
  language: string | null;
  text: string;
  transcriptionModel: string | null;
  confidence: number | null;
}

export interface Dataset {
  _id: string;
  task: string;
  project: string;
  originalAudio: { url: string; publicId: string; provider?: AudioStorageProvider; durationSec?: number | null };
  processedAudio: { url: string; publicId: string; provider?: AudioStorageProvider } | null;
  processing: {
    status: ProcessingStatus;
    progress: number;
    error: string | null;
    retryCount: number;
    startedAt: string | null;
    completedAt: string | null;
    modelsUsed: Record<string, string | undefined>;
  };
  binarySegments: { startTime: number; endTime: number; isSpeech: boolean }[];
  speakerSegments: { startTime: number; endTime: number; speaker: string; overlappingSpeakers: string[] }[];
  transcriptSegments: TranscriptSegment[];
}

export interface Task {
  _id: string;
  project: string;
  dataset: string | null;
  audioUrl: string;
  audioDurationSec: number | null;
  rsmlTextOriginal: string;
  language?: string;
  speakerLabel?: string;
  assignedAnnotator: string | null;
  assignedReviewer: string | null;
  status: TaskStatus;
  currentAnnotation: string | Annotation | null;
  createdAt: string;
  updatedAt: string;
}

export interface EditHistoryEntry {
  editedAt: string;
  previousText: string;
}

export interface Annotation {
  _id: string;
  task: string;
  user: string;
  type: AnnotationType;
  rsmlText: string;
  parentAnnotation: string | null;
  status: AnnotationStatus;
  reviewComment: string | null;
  editHistory: EditHistoryEntry[];
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

import { Dataset, IBinarySegment, ISpeakerSegment, ITranscriptSegment, IProcessedAudioRef } from '../../models/Dataset';
import { Task } from '../../models/Task';
import { ApiError } from '../../utils/ApiError';
import { ProcessingStatus } from '../../types';

type ModelKey = 'musicRemoval' | 'vad' | 'diarization' | 'transcription';

const STAGE_TO_MODEL_KEY: Partial<Record<ProcessingStatus, ModelKey>> = {
  music_removal: 'musicRemoval',
  binary_segmentation: 'vad',
  speaker_diarization: 'diarization',
  transcription: 'transcription',
};

export interface StageUpdatePayload {
  stage: ProcessingStatus;
  progress?: number;
  error?: string;
  modelUsed?: string;
  processedAudio?: IProcessedAudioRef;
  binarySegments?: IBinarySegment[];
  speakerSegments?: ISpeakerSegment[];
  transcriptSegments?: ITranscriptSegment[];
}

/**
 * Applies one stage-progress callback from the Python ML service onto its
 * Dataset document. Called both by the internal HTTP callback route (real
 * pipeline runs) and directly by the BullMQ worker for start/failure
 * bookkeeping that doesn't need a network round trip.
 */
export async function applyStageUpdate(datasetId: string, payload: StageUpdatePayload): Promise<void> {
  const dataset = await Dataset.findById(datasetId);
  if (!dataset) throw ApiError.notFound('Dataset not found');

  if (!dataset.processing.startedAt) {
    dataset.processing.startedAt = new Date();
  }

  if (payload.stage === 'failed') {
    dataset.processing.status = 'failed';
    dataset.processing.error = payload.error ?? 'Unknown processing error';
    dataset.processing.completedAt = new Date();
    await dataset.save();
    return;
  }

  dataset.processing.status = payload.stage;
  dataset.processing.error = null;
  if (payload.progress !== undefined) dataset.processing.progress = payload.progress;

  if (payload.processedAudio) dataset.processedAudio = payload.processedAudio;
  if (payload.binarySegments) dataset.binarySegments = payload.binarySegments;
  if (payload.speakerSegments) dataset.speakerSegments = payload.speakerSegments;
  if (payload.transcriptSegments) dataset.transcriptSegments = payload.transcriptSegments;

  const modelKey = STAGE_TO_MODEL_KEY[payload.stage];
  if (modelKey && payload.modelUsed) {
    dataset.processing.modelsUsed = { ...dataset.processing.modelsUsed, [modelKey]: payload.modelUsed };
  }

  if (payload.stage === 'completed') {
    dataset.processing.progress = 100;
    dataset.processing.completedAt = new Date();
  }

  await dataset.save();

  if (payload.stage === 'completed') {
    await seedTaskTranscriptDraft(dataset.task.toString(), dataset.transcriptSegments);
  }
}

/**
 * Seeds Task.rsmlTextOriginal with the plain-text transcript once
 * preprocessing completes, so the Annotator starts from a machine draft
 * instead of a blank pane. Only runs if the field is still empty — never
 * overwrites text that's already there (e.g. a re-run after manual edits
 * started shouldn't clobber them).
 */
async function seedTaskTranscriptDraft(taskId: string, segments: ITranscriptSegment[]): Promise<void> {
  const task = await Task.findById(taskId);
  if (!task || task.rsmlTextOriginal) return;

  const draft = segments
    .filter((s) => s.isSpeech && s.text)
    .map((s) => s.text.trim())
    .join(' ');

  task.rsmlTextOriginal = draft;
  await task.save();
}

export async function markProcessingStarted(datasetId: string): Promise<void> {
  await Dataset.findByIdAndUpdate(datasetId, {
    $set: { 'processing.status': 'processing', 'processing.startedAt': new Date(), 'processing.error': null },
  });
}

export async function markProcessingFailed(datasetId: string, error: string): Promise<void> {
  await Dataset.findByIdAndUpdate(datasetId, {
    $set: { 'processing.status': 'failed', 'processing.error': error, 'processing.completedAt': new Date() },
    $inc: { 'processing.retryCount': 1 },
  });
}

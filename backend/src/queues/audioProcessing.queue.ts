import { Queue } from 'bullmq';
import { getQueueConnection } from './connection';

export const AUDIO_PROCESSING_QUEUE = 'audio-processing';

export interface AudioProcessingJobData {
  taskId: string;
  datasetId: string;
  language?: string;
}

let queue: Queue<AudioProcessingJobData> | null = null;

function getQueue(): Queue<AudioProcessingJobData> {
  if (!queue) {
    queue = new Queue<AudioProcessingJobData>(AUDIO_PROCESSING_QUEUE, { connection: getQueueConnection() });
  }
  return queue;
}

/**
 * jobId = datasetId, so re-enqueuing the same dataset (e.g. a manual retry
 * after a failure) doesn't create a duplicate job while one is already
 * active/waiting.
 */
export async function enqueueAudioProcessing(data: AudioProcessingJobData) {
  return getQueue().add('process', data, {
    jobId: data.datasetId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  });
}

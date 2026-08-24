import { Job, Worker } from 'bullmq';
import { connectDB } from '../config/db';
import { logger } from '../config/logger';
import { getQueueConnection } from '../queues/connection';
import { AUDIO_PROCESSING_QUEUE, AudioProcessingJobData } from '../queues/audioProcessing.queue';
import { Dataset } from '../models/Dataset';
import { runPipeline } from '../services/ml/mlServiceClient';
import { markProcessingFailed, markProcessingStarted } from '../services/ml/audioProcessing.service';

const CONCURRENCY = Number(process.env.AUDIO_WORKER_CONCURRENCY ?? 2);

async function processJob(job: Job<AudioProcessingJobData>): Promise<void> {
  const { datasetId, taskId, language } = job.data;

  const dataset = await Dataset.findById(datasetId);
  if (!dataset) {
    logger.warn(`Dataset ${datasetId} no longer exists, skipping job ${job.id}`);
    return;
  }

  // Idempotency: if a previous attempt already finished this dataset (e.g. a
  // stale re-enqueue), don't redo the work.
  if (dataset.processing.status === 'completed') {
    logger.info(`Dataset ${datasetId} already completed, skipping`);
    return;
  }

  await markProcessingStarted(datasetId);
  await job.updateProgress(5);

  try {
    const result = await runPipeline({
      taskId,
      datasetId,
      audioUrl: dataset.originalAudio.url,
      language,
    });

    if (result.status === 'failed') {
      throw new Error(result.error ?? 'ML pipeline reported failure with no error message');
    }

    await job.updateProgress(100);
    logger.info(`Audio processing completed for dataset ${datasetId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Audio processing failed for dataset ${datasetId}: ${message}`);
    throw err; // let BullMQ retry with backoff
  }
}

export function startAudioProcessingWorker(): Worker<AudioProcessingJobData> {
  const worker = new Worker<AudioProcessingJobData>(AUDIO_PROCESSING_QUEUE, processJob, {
    connection: getQueueConnection(),
    concurrency: CONCURRENCY,
  });

  worker.on('completed', (job) => {
    logger.info(`Job ${job.id} completed`);
  });

  worker.on('failed', async (job, err) => {
    logger.error(`Job ${job?.id} failed: ${err.message}`);
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await markProcessingFailed(job.data.datasetId, err.message);
    }
  });

  return worker;
}

if (require.main === module) {
  connectDB()
    .then(() => {
      startAudioProcessingWorker();
      logger.info(`Audio processing worker started (concurrency=${CONCURRENCY})`);
    })
    .catch((err) => {
      logger.error('Failed to start audio processing worker', err);
      process.exit(1);
    });
}

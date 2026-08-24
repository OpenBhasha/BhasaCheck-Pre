import request from 'supertest';
import { createApp } from '../../src/app';
import { Task } from '../../src/models/Task';
import { Dataset } from '../../src/models/Dataset';
import { Project } from '../../src/models/Project';
import { env } from '../../src/config/env';

const app = createApp();

async function seedTaskAndDataset() {
  const project = await Project.create({ name: 'P', createdBy: '507f1f77bcf86cd799439011', members: [] });
  const task = await Task.create({
    project: project._id,
    audioUrl: 'https://res.cloudinary.com/demo/video/upload/v1/audio.wav',
    status: 'unassigned',
  });
  const dataset = await Dataset.create({
    task: task._id,
    project: project._id,
    originalAudio: { url: task.audioUrl, publicId: 'audio' },
    processing: { status: 'pending' },
  });
  task.dataset = dataset._id;
  await task.save();
  return { task, dataset };
}

describe('POST /api/internal/datasets/:datasetId/stage', () => {
  it('rejects requests without a valid internal secret', async () => {
    const { dataset } = await seedTaskAndDataset();

    const res = await request(app)
      .post(`/api/internal/datasets/${dataset._id.toString()}/stage`)
      .send({ stage: 'music_removal', progress: 25 });

    expect(res.status).toBe(401);
  });

  it('applies stage updates and seeds Task.rsmlTextOriginal once completed', async () => {
    const { task, dataset } = await seedTaskAndDataset();
    const headers = { 'X-Internal-Secret': env.internalServiceSecret };

    await request(app)
      .post(`/api/internal/datasets/${dataset._id.toString()}/stage`)
      .set(headers)
      .send({
        stage: 'binary_segmentation',
        progress: 45,
        modelUsed: 'silero-vad',
        binarySegments: [
          { startTime: 0, endTime: 2.3, isSpeech: false },
          { startTime: 2.3, endTime: 8.7, isSpeech: true },
        ],
      })
      .expect(204);

    await request(app)
      .post(`/api/internal/datasets/${dataset._id.toString()}/stage`)
      .set(headers)
      .send({
        stage: 'speaker_diarization',
        progress: 65,
        modelUsed: 'pyannote-community-1',
        speakerSegments: [{ startTime: 2.3, endTime: 8.7, speaker: 'SPEAKER_00', overlappingSpeakers: [] }],
      })
      .expect(204);

    await request(app)
      .post(`/api/internal/datasets/${dataset._id.toString()}/stage`)
      .set(headers)
      .send({
        stage: 'transcription',
        progress: 90,
        modelUsed: 'whisper',
        transcriptSegments: [
          {
            startTime: 0,
            endTime: 2.3,
            isSpeech: false,
            speaker: null,
            overlappingSpeakers: [],
            language: null,
            text: '',
            transcriptionModel: null,
            confidence: null,
          },
          {
            startTime: 2.3,
            endTime: 8.7,
            isSpeech: true,
            speaker: 'SPEAKER_00',
            overlappingSpeakers: [],
            language: 'en',
            text: 'hello there',
            transcriptionModel: 'whisper',
            confidence: 0.92,
          },
        ],
      })
      .expect(204);

    await request(app)
      .post(`/api/internal/datasets/${dataset._id.toString()}/stage`)
      .set(headers)
      .send({ stage: 'completed', progress: 100 })
      .expect(204);

    const finalDataset = await Dataset.findById(dataset._id);
    expect(finalDataset?.processing.status).toBe('completed');
    expect(finalDataset?.processing.progress).toBe(100);
    expect(finalDataset?.binarySegments).toHaveLength(2);
    expect(finalDataset?.speakerSegments).toHaveLength(1);
    expect(finalDataset?.transcriptSegments).toHaveLength(2);
    expect(finalDataset?.processing.modelsUsed.transcription).toBe('whisper');

    const finalTask = await Task.findById(task._id);
    expect(finalTask?.rsmlTextOriginal).toBe('hello there');
  });

  it('marks processing failed and records the error', async () => {
    const { dataset } = await seedTaskAndDataset();
    const headers = { 'X-Internal-Secret': env.internalServiceSecret };

    await request(app)
      .post(`/api/internal/datasets/${dataset._id.toString()}/stage`)
      .set(headers)
      .send({ stage: 'failed', error: '[music_removal] Demucs failed' })
      .expect(204);

    const finalDataset = await Dataset.findById(dataset._id);
    expect(finalDataset?.processing.status).toBe('failed');
    expect(finalDataset?.processing.error).toBe('[music_removal] Demucs failed');
  });
});

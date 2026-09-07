import request from 'supertest';
import { createApp } from '../../src/app';
import { authHeader, createUser } from '../helpers';
import { Project } from '../../src/models/Project';
import { Task } from '../../src/models/Task';
import { Dataset } from '../../src/models/Dataset';

const app = createApp();

async function setupTaskWithDataset(processingStatus: string, transcriptSegments: unknown[]) {
  const admin = await createUser({ email: `srt-${Date.now()}@example.com`, role: 'admin' });
  const outsider = await createUser({ email: `srt-outsider-${Date.now()}@example.com` });

  const project = await Project.create({
    name: 'SRT Corpus',
    createdBy: admin._id,
    members: [{ user: admin._id, projectRole: 'admin', addedAt: new Date() }],
  });

  const task = await Task.create({
    project: project._id,
    audioUrl: 'https://res.cloudinary.com/test/video/upload/v1/sample.wav',
    status: 'unassigned',
  });

  const dataset = await Dataset.create({
    task: task._id,
    project: project._id,
    originalAudio: { url: task.audioUrl, publicId: 'sample', provider: 'cloudinary' },
    processing: { status: processingStatus },
    transcriptSegments,
  });
  task.dataset = dataset._id;
  await task.save();

  return { admin, outsider, task };
}

const SEGMENTS = [
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
    endTime: 8.75,
    isSpeech: true,
    speaker: 'SPEAKER_00',
    overlappingSpeakers: ['SPEAKER_01'],
    language: 'hi',
    text: 'नमस्ते आप कैसे हैं',
    transcriptionModel: 'whisper',
    confidence: 0.912,
  },
  {
    startTime: 9.0,
    endTime: 14.2,
    isSpeech: true,
    speaker: 'SPEAKER_01',
    overlappingSpeakers: [],
    language: 'hi',
    text: 'मैं ठीक हूं',
    transcriptionModel: 'whisper',
    confidence: null,
  },
];

describe('GET /api/tasks/:id/export/srt', () => {
  it('generates a valid SRT with speaker/language/confidence metadata, skipping non-speech segments', async () => {
    const { admin, task } = await setupTaskWithDataset('completed', SEGMENTS);

    const res = await request(app).get(`/api/tasks/${task._id}/export/srt`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-subrip');
    expect(res.headers['content-disposition']).toContain('.srt');

    const body = res.text;
    const blocks = body.trim().split('\n\n');
    expect(blocks).toHaveLength(2); // only the two isSpeech segments become cues

    expect(blocks[0]).toBe(
      '1\n00:00:02,300 --> 00:00:08,750\nSpeaker: SPEAKER_00 | Overlapping: SPEAKER_01 | Language: hi | Model: whisper | Confidence: 0.91\nनमस्ते आप कैसे हैं'
    );
    expect(blocks[1]).toBe(
      '2\n00:00:09,000 --> 00:00:14,200\nSpeaker: SPEAKER_01 | Language: hi | Model: whisper\nमैं ठीक हूं'
    );
  });

  it('returns 409 if the dataset has not finished processing', async () => {
    const { admin, task } = await setupTaskWithDataset('processing', SEGMENTS);
    const res = await request(app).get(`/api/tasks/${task._id}/export/srt`).set(authHeader(admin));
    expect(res.status).toBe(409);
  });

  it('returns 404 if there are no transcript segments', async () => {
    const { admin, task } = await setupTaskWithDataset('completed', []);
    const res = await request(app).get(`/api/tasks/${task._id}/export/srt`).set(authHeader(admin));
    expect(res.status).toBe(404);
  });

  it('rejects a non-project-member', async () => {
    const { outsider, task } = await setupTaskWithDataset('completed', SEGMENTS);
    const res = await request(app).get(`/api/tasks/${task._id}/export/srt`).set(authHeader(outsider));
    expect(res.status).toBe(403);
  });
});

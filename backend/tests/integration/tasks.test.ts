jest.mock('../../src/services/cloudinary.service', () => ({
  uploadAudioBuffer: jest.fn().mockResolvedValue({
    secure_url: 'https://res.cloudinary.com/test-cloud/video/upload/v1/rsml/audio/fake.mp3',
    public_id: 'rsml/audio/fake',
    format: 'mp3',
    duration: 12.5,
  }),
  deleteAudio: jest.fn(),
}));

jest.mock('../../src/queues/audioProcessing.queue', () => ({
  enqueueAudioProcessing: jest.fn().mockResolvedValue({ id: 'job-1' }),
}));

import request from 'supertest';
import { createApp } from '../../src/app';
import { authHeader, createUser } from '../helpers';
import { Dataset } from '../../src/models/Dataset';
import { enqueueAudioProcessing } from '../../src/queues/audioProcessing.queue';

const app = createApp();

async function createProjectAsAdmin(admin: Awaited<ReturnType<typeof createUser>>) {
  const res = await request(app).post('/api/projects').set(authHeader(admin)).send({ name: 'Audio Corpus' });
  return res.body.project._id as string;
}

describe('Task audio upload', () => {
  it('uploads a single audio file, creates a Task + Dataset, and enqueues processing', async () => {
    const admin = await createUser({ email: 'taskadmin@example.com', role: 'admin' });
    const projectId = await createProjectAsAdmin(admin);

    const res = await request(app)
      .post(`/api/tasks?projectId=${projectId}`)
      .set(authHeader(admin))
      .attach('audio', Buffer.from('fake-audio-bytes'), 'sample.mp3');

    expect(res.status).toBe(201);
    expect(res.body.task.audioUrl).toContain('cloudinary.com');
    expect(res.body.task.status).toBe('unassigned');
    expect(res.body.dataset.processing.status).toBe('pending');

    const dataset = await Dataset.findById(res.body.dataset._id);
    expect(dataset?.task.toString()).toBe(res.body.task._id);
    expect(enqueueAudioProcessing).toHaveBeenCalledWith({
      datasetId: res.body.dataset._id,
      taskId: res.body.task._id,
    });
  });

  it('rejects upload from a non-admin project member', async () => {
    const admin = await createUser({ email: 'taskadmin2@example.com', role: 'admin' });
    const annotator = await createUser({ email: 'taskann@example.com', role: 'annotator' });
    const projectId = await createProjectAsAdmin(admin);

    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(authHeader(admin))
      .send({ userId: annotator._id.toString(), projectRole: 'annotator' });

    const res = await request(app)
      .post(`/api/tasks?projectId=${projectId}`)
      .set(authHeader(annotator))
      .attach('audio', Buffer.from('fake-audio-bytes'), 'sample.mp3');

    expect(res.status).toBe(403);
  });

  it('rejects upload with no file attached', async () => {
    const admin = await createUser({ email: 'taskadmin3@example.com', role: 'admin' });
    const projectId = await createProjectAsAdmin(admin);

    const res = await request(app).post(`/api/tasks?projectId=${projectId}`).set(authHeader(admin));
    expect(res.status).toBe(400);
  });
});

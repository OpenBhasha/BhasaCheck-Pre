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
  removeAudioProcessingJob: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import { createApp } from '../../src/app';
import { authHeader, createUser } from '../helpers';
import { Dataset } from '../../src/models/Dataset';
import { Task } from '../../src/models/Task';
import { Annotation } from '../../src/models/Annotation';
import { enqueueAudioProcessing, removeAudioProcessingJob } from '../../src/queues/audioProcessing.queue';
import { deleteAudio } from '../../src/services/cloudinary.service';

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
      .field('storageProvider', 'cloudinary')
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

describe('Task deletion', () => {
  it('deletes the task, its dataset, its annotations, its Cloudinary audio, and its queue job', async () => {
    const admin = await createUser({ email: 'delAdmin@example.com', role: 'admin' });
    const projectId = await createProjectAsAdmin(admin);

    const uploadRes = await request(app)
      .post(`/api/tasks?projectId=${projectId}`)
      .set(authHeader(admin))
      .field('storageProvider', 'cloudinary')
      .attach('audio', Buffer.from('fake-audio-bytes'), 'sample.mp3');
    const taskId = uploadRes.body.task._id as string;
    const datasetId = uploadRes.body.dataset._id as string;

    await Annotation.create({ task: taskId, user: admin._id, type: 'annotation', rsmlText: 'hi' });

    const res = await request(app).delete(`/api/tasks/${taskId}`).set(authHeader(admin));
    expect(res.status).toBe(204);

    expect(await Task.findById(taskId)).toBeNull();
    expect(await Dataset.findById(datasetId)).toBeNull();
    expect(await Annotation.find({ task: taskId })).toHaveLength(0);
    expect(deleteAudio).toHaveBeenCalledWith('rsml/audio/fake');
    expect(removeAudioProcessingJob).toHaveBeenCalledWith(datasetId);
  });

  it('rejects deletion from a non-admin project member', async () => {
    const admin = await createUser({ email: 'delAdmin2@example.com', role: 'admin' });
    const annotator = await createUser({ email: 'delAnn@example.com', role: 'annotator' });
    const projectId = await createProjectAsAdmin(admin);
    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(authHeader(admin))
      .send({ userId: annotator._id.toString(), projectRole: 'annotator' });

    const uploadRes = await request(app)
      .post(`/api/tasks?projectId=${projectId}`)
      .set(authHeader(admin))
      .attach('audio', Buffer.from('fake-audio-bytes'), 'sample.mp3');

    const res = await request(app)
      .delete(`/api/tasks/${uploadRes.body.task._id}`)
      .set(authHeader(annotator));
    expect(res.status).toBe(403);
    expect(await Task.findById(uploadRes.body.task._id)).not.toBeNull();
  });

  it('404s for a non-existent task', async () => {
    const admin = await createUser({ email: 'delAdmin3@example.com', role: 'admin' });
    const res = await request(app)
      .delete('/api/tasks/507f1f77bcf86cd799439011')
      .set(authHeader(admin));
    expect(res.status).toBe(404);
  });
});

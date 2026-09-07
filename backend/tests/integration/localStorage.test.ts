jest.mock('../../src/queues/audioProcessing.queue', () => ({
  enqueueAudioProcessing: jest.fn().mockResolvedValue({ id: 'job-1' }),
  removeAudioProcessingJob: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import { promises as fs } from 'fs';
import path from 'path';
import { createApp } from '../../src/app';
import { authHeader, createUser } from '../helpers';
import { Dataset } from '../../src/models/Dataset';
import { Task } from '../../src/models/Task';
import { env } from '../../src/config/env';

const app = createApp();

async function createProjectAsAdmin(admin: Awaited<ReturnType<typeof createUser>>) {
  const res = await request(app).post('/api/projects').set(authHeader(admin)).send({ name: 'Local Storage Corpus' });
  return res.body.project._id as string;
}

describe('Local audio storage (alternative to Cloudinary)', () => {
  it('stores the upload on disk and serves it back at the returned URL', async () => {
    const admin = await createUser({ email: 'localadmin@example.com', role: 'admin' });
    const projectId = await createProjectAsAdmin(admin);

    const res = await request(app)
      .post(`/api/tasks?projectId=${projectId}`)
      .set(authHeader(admin))
      .field('storageProvider', 'local')
      .attach('audio', Buffer.from('fake-audio-bytes'), 'sample.wav');

    expect(res.status).toBe(201);
    expect(res.body.dataset.originalAudio.provider).toBe('local');
    expect(res.body.task.audioUrl).toContain(env.publicBaseUrl);
    expect(res.body.task.audioUrl).toContain('/uploads/');

    const dataset = await Dataset.findById(res.body.dataset._id);
    const diskPath = path.join(env.localStorageRoot, dataset!.originalAudio.publicId);
    const bytes = await fs.readFile(diskPath);
    expect(bytes.toString()).toBe('fake-audio-bytes');

    // the file is actually servable over HTTP at the URL we returned
    // (express.static reports it as an audio content-type, so supertest
    // buffers it into res.body rather than res.text)
    const urlPath = new URL(res.body.task.audioUrl).pathname;
    const served = await request(app).get(urlPath);
    expect(served.status).toBe(200);
    const servedBytes = Buffer.isBuffer(served.body) ? served.body.toString() : served.text;
    expect(servedBytes).toBe('fake-audio-bytes');
  });

  it('defaults to local storage when no storageProvider is given and Cloudinary is unconfigured', async () => {
    const admin = await createUser({ email: 'localadmin2@example.com', role: 'admin' });
    const projectId = await createProjectAsAdmin(admin);

    const res = await request(app)
      .post(`/api/tasks?projectId=${projectId}`)
      .set(authHeader(admin))
      .attach('audio', Buffer.from('more-bytes'), 'sample.wav');

    expect(res.status).toBe(201);
    expect(res.body.dataset.originalAudio.provider).toBe(env.defaultAudioStorageProvider);
  });

  it('rejects an invalid storageProvider value', async () => {
    const admin = await createUser({ email: 'localadmin3@example.com', role: 'admin' });
    const projectId = await createProjectAsAdmin(admin);

    const res = await request(app)
      .post(`/api/tasks?projectId=${projectId}`)
      .set(authHeader(admin))
      .field('storageProvider', 's3')
      .attach('audio', Buffer.from('bytes'), 'sample.wav');

    expect(res.status).toBe(400);
  });

  it('deletes the file from disk when the task is deleted', async () => {
    const admin = await createUser({ email: 'localadmin4@example.com', role: 'admin' });
    const projectId = await createProjectAsAdmin(admin);

    const uploadRes = await request(app)
      .post(`/api/tasks?projectId=${projectId}`)
      .set(authHeader(admin))
      .field('storageProvider', 'local')
      .attach('audio', Buffer.from('to-be-deleted'), 'sample.wav');

    const dataset = await Dataset.findById(uploadRes.body.dataset._id);
    const diskPath = path.join(env.localStorageRoot, dataset!.originalAudio.publicId);
    await expect(fs.access(diskPath)).resolves.toBeUndefined();

    const del = await request(app).delete(`/api/tasks/${uploadRes.body.task._id}`).set(authHeader(admin));
    expect(del.status).toBe(204);

    await expect(fs.access(diskPath)).rejects.toThrow();
    expect(await Task.findById(uploadRes.body.task._id)).toBeNull();
  });
});

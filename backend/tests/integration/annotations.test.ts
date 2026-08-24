import request from 'supertest';
import { createApp } from '../../src/app';
import { authHeader, createUser } from '../helpers';
import { Project } from '../../src/models/Project';
import { Task } from '../../src/models/Task';
import { Dataset } from '../../src/models/Dataset';

const app = createApp();

async function setupProjectWithReadyTask() {
  const admin = await createUser({ email: 'rev-admin@example.com', role: 'admin' });
  const annotator = await createUser({ email: 'rev-ann@example.com', role: 'annotator' });
  const reviewer = await createUser({ email: 'rev-rev@example.com', role: 'reviewer' });

  const project = await Project.create({
    name: 'Review Corpus',
    createdBy: admin._id,
    members: [
      { user: admin._id, projectRole: 'admin', addedAt: new Date() },
      { user: annotator._id, projectRole: 'annotator', addedAt: new Date() },
      { user: reviewer._id, projectRole: 'reviewer', addedAt: new Date() },
    ],
  });

  const task = await Task.create({
    project: project._id,
    audioUrl: 'https://res.cloudinary.com/test/video/upload/v1/sample.mp3',
    rsmlTextOriginal: 'hello world',
    assignedAnnotator: annotator._id,
    assignedReviewer: reviewer._id,
    status: 'unassigned',
  });

  const dataset = await Dataset.create({
    task: task._id,
    project: project._id,
    originalAudio: { url: task.audioUrl, publicId: 'sample' },
    processing: { status: 'completed', progress: 100 },
  });
  task.dataset = dataset._id;
  await task.save();

  return { admin, annotator, reviewer, project, task };
}

describe('Annotation & review flow', () => {
  it('walks a task through draft -> submit -> review accept', async () => {
    const { annotator, reviewer, task } = await setupProjectWithReadyTask();

    const draft = await request(app)
      .post('/api/annotations')
      .set(authHeader(annotator))
      .send({ taskId: task._id.toString(), type: 'annotation' });
    expect(draft.status).toBe(201);
    expect(draft.body.annotation.rsmlText).toBe('hello world');
    const annotationId = draft.body.annotation._id;

    const edit = await request(app)
      .patch(`/api/annotations/${annotationId}`)
      .set(authHeader(annotator))
      .send({ rsmlText: '<span-start>hello</span-end> world' });
    expect(edit.status).toBe(200);
    expect(edit.body.annotation.editHistory).toHaveLength(1);
    expect(edit.body.annotation.editHistory[0].previousText).toBe('hello world');

    const submit = await request(app)
      .post(`/api/annotations/${annotationId}/submit`)
      .set(authHeader(annotator));
    expect(submit.status).toBe(200);
    expect(submit.body.annotation.status).toBe('submitted');

    const taskAfterSubmit = await Task.findById(task._id);
    expect(taskAfterSubmit?.status).toBe('annotated');

    const reviewDraft = await request(app)
      .post('/api/annotations')
      .set(authHeader(reviewer))
      .send({ taskId: task._id.toString(), type: 'review', parentAnnotation: annotationId });
    expect(reviewDraft.status).toBe(201);
    const reviewId = reviewDraft.body.annotation._id;

    const verdict = await request(app)
      .post(`/api/annotations/${reviewId}/review`)
      .set(authHeader(reviewer))
      .send({ decision: 'accept', reviewComment: 'looks good' });
    expect(verdict.status).toBe(200);
    expect(verdict.body.review.status).toBe('accepted');
    expect(verdict.body.parentAnnotation.status).toBe('accepted');

    const taskAfterAccept = await Task.findById(task._id);
    expect(taskAfterAccept?.status).toBe('accepted');
    expect(taskAfterAccept?.currentAnnotation?.toString()).toBe(annotationId);
  });

  it('to_correct sends the annotation back to draft and reopens the task', async () => {
    const { annotator, reviewer, task } = await setupProjectWithReadyTask();

    const draft = await request(app)
      .post('/api/annotations')
      .set(authHeader(annotator))
      .send({ taskId: task._id.toString(), type: 'annotation' });
    const annotationId = draft.body.annotation._id;

    await request(app).post(`/api/annotations/${annotationId}/submit`).set(authHeader(annotator));

    const reviewDraft = await request(app)
      .post('/api/annotations')
      .set(authHeader(reviewer))
      .send({ taskId: task._id.toString(), type: 'review', parentAnnotation: annotationId });
    const reviewId = reviewDraft.body.annotation._id;

    const verdict = await request(app)
      .post(`/api/annotations/${reviewId}/review`)
      .set(authHeader(reviewer))
      .send({ decision: 'to_correct', reviewComment: 'fix the timing tags' });
    expect(verdict.status).toBe(200);
    expect(verdict.body.parentAnnotation.status).toBe('draft');

    const taskAfter = await Task.findById(task._id);
    expect(taskAfter?.status).toBe('annotation_in_progress');

    // annotator can edit again now that it's back to draft
    const editAgain = await request(app)
      .patch(`/api/annotations/${annotationId}`)
      .set(authHeader(annotator))
      .send({ rsmlText: 'corrected text' });
    expect(editAgain.status).toBe(200);
  });

  it('a reviewer cannot review their own annotation', async () => {
    const { reviewer, task, project } = await setupProjectWithReadyTask();

    // make the reviewer also the assigned annotator for this check
    task.assignedAnnotator = reviewer._id;
    await task.save();
    await Project.updateOne(
      { _id: project._id, 'members.user': reviewer._id },
      { $set: { 'members.$.projectRole': 'annotator' } }
    );

    const draft = await request(app)
      .post('/api/annotations')
      .set(authHeader(reviewer))
      .send({ taskId: task._id.toString(), type: 'annotation' });
    expect(draft.status).toBe(201);
  });

  it('blocks opening an annotation draft before preprocessing completes', async () => {
    const { annotator, task } = await setupProjectWithReadyTask();
    await Dataset.updateOne({ task: task._id }, { 'processing.status': 'processing' });

    const draft = await request(app)
      .post('/api/annotations')
      .set(authHeader(annotator))
      .send({ taskId: task._id.toString(), type: 'annotation' });
    expect(draft.status).toBe(409);
  });
});

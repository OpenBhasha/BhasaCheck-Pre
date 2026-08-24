import request from 'supertest';
import { createApp } from '../../src/app';
import { authHeader, createUser } from '../helpers';

const app = createApp();

describe('Projects & permissions', () => {
  it('only admin/super_admin can create a project', async () => {
    const annotator = await createUser({ email: 'ann@example.com', role: 'annotator' });
    const admin = await createUser({ email: 'padmin@example.com', role: 'admin' });

    const denied = await request(app)
      .post('/api/projects')
      .set(authHeader(annotator))
      .send({ name: 'Corpus A' });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post('/api/projects')
      .set(authHeader(admin))
      .send({ name: 'Corpus A', language: 'hi' });
    expect(created.status).toBe(201);
    expect(created.body.project.members[0].projectRole).toBe('admin');
  });

  it('non-members cannot view a project; members and super admins can', async () => {
    const admin = await createUser({ email: 'padmin2@example.com', role: 'admin' });
    const outsider = await createUser({ email: 'outsider@example.com' });
    const superAdmin = await createUser({ email: 'super@example.com', role: 'super_admin' });

    const created = await request(app)
      .post('/api/projects')
      .set(authHeader(admin))
      .send({ name: 'Corpus B' });
    const projectId = created.body.project._id;

    const denied = await request(app).get(`/api/projects/${projectId}`).set(authHeader(outsider));
    expect(denied.status).toBe(403);

    const asAdmin = await request(app).get(`/api/projects/${projectId}`).set(authHeader(admin));
    expect(asAdmin.status).toBe(200);

    const asSuperAdmin = await request(app)
      .get(`/api/projects/${projectId}`)
      .set(authHeader(superAdmin));
    expect(asSuperAdmin.status).toBe(200);
  });

  it('project admin can add members with a project-scoped role', async () => {
    const admin = await createUser({ email: 'padmin3@example.com', role: 'admin' });
    const annotator = await createUser({ email: 'ann2@example.com', role: 'annotator' });

    const created = await request(app)
      .post('/api/projects')
      .set(authHeader(admin))
      .send({ name: 'Corpus C' });
    const projectId = created.body.project._id;

    const added = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(authHeader(admin))
      .send({ userId: annotator._id.toString(), projectRole: 'annotator' });
    expect(added.status).toBe(201);
    expect(added.body.project.members).toHaveLength(2);

    const asAnnotator = await request(app)
      .get(`/api/projects/${projectId}`)
      .set(authHeader(annotator));
    expect(asAnnotator.status).toBe(200);
  });
});

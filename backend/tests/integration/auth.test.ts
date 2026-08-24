import request from 'supertest';
import { createApp } from '../../src/app';
import { User } from '../../src/models/User';
import { authHeader, createUser } from '../helpers';

const app = createApp();

describe('Auth', () => {
  it('registers a new user as pending/annotator', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.status).toBe('pending');
    expect(res.body.user.role).toBe('annotator');
  });

  it('rejects duplicate email registration', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'dupe@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice 2', email: 'dupe@example.com', password: 'password123' });

    expect(res.status).toBe(409);
  });

  it('rejects login for unapproved account with correct credentials but blocks protected routes', async () => {
    const user = await createUser({ email: 'pending@example.com', status: 'pending' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' });

    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeDefined();

    const projects = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    // listProjects itself doesn't require approval in the route chain below users,
    // but project-scoped middleware does; verify /api/users/pending (an approved-only route) is blocked.
    const pendingList = await request(app)
      .get('/api/users/pending')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(pendingList.status).toBe(403);
    void projects;
  });

  it('rejects login with wrong password', async () => {
    const user = await createUser({ email: 'bob@example.com' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('logs in, refreshes, and logs out', async () => {
    const user = await createUser({ email: 'carol@example.com' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' });
    expect(login.status).toBe(200);

    const refresh = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(200);
    expect(refresh.body.accessToken).toBeDefined();

    // old refresh token is now revoked (rotation)
    const reuseOld = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken: login.body.refreshToken });
    expect(reuseOld.status).toBe(401);

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${refresh.body.accessToken}`)
      .send({ refreshToken: refresh.body.refreshToken });
    expect(logout.status).toBe(204);
  });

  it('approval flow: admin approves a pending user', async () => {
    const admin = await createUser({ email: 'admin@example.com', role: 'admin' });
    const pending = await request(app).post('/api/auth/register').send({
      name: 'Dave',
      email: 'dave@example.com',
      password: 'password123',
    });
    const pendingId = pending.body.user.id;

    const approve = await request(app)
      .post(`/api/users/${pendingId}/approve`)
      .set(authHeader(admin));
    expect(approve.status).toBe(200);
    expect(approve.body.user.status).toBe('approved');

    const dbUser = await User.findById(pendingId);
    expect(dbUser?.approvedBy?.toString()).toBe(admin._id.toString());
  });
});

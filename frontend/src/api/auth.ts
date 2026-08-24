import { api } from './client';
import type { User } from '../types';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export function register(payload: { name: string; email: string; password: string }) {
  return api.post<{ user: User }>('/auth/register', payload).then((r) => r.data);
}

export function login(payload: { email: string; password: string }) {
  return api.post<LoginResponse>('/auth/login', payload).then((r) => r.data);
}

export function logout(refreshToken: string | null) {
  return api.post('/auth/logout', refreshToken ? { refreshToken } : {});
}

import { api } from './client';
import type { GlobalRole, User } from '../types';

export function getMe() {
  return api.get<{ user: User }>('/users/me').then((r) => r.data.user);
}

export function updateMe(payload: { name?: string }) {
  return api.patch<{ user: User }>('/users/me', payload).then((r) => r.data.user);
}

export function changeMyPassword(payload: { currentPassword: string; newPassword: string }) {
  return api.patch('/users/me/password', payload);
}

export function listUsers() {
  return api.get<{ users: User[] }>('/users').then((r) => r.data.users);
}

export function listPendingUsers() {
  return api.get<{ users: User[] }>('/users/pending').then((r) => r.data.users);
}

export function approveUser(id: string) {
  return api.post<{ user: User }>(`/users/${id}/approve`).then((r) => r.data.user);
}

export function rejectUser(id: string) {
  return api.post<{ user: User }>(`/users/${id}/reject`).then((r) => r.data.user);
}

export function deactivateUser(id: string) {
  return api.patch<{ user: User }>(`/users/${id}/deactivate`).then((r) => r.data.user);
}

export function reactivateUser(id: string) {
  return api.patch<{ user: User }>(`/users/${id}/reactivate`).then((r) => r.data.user);
}

export function changeUserRole(id: string, role: GlobalRole) {
  return api.patch<{ user: User }>(`/users/${id}/role`, { role }).then((r) => r.data.user);
}

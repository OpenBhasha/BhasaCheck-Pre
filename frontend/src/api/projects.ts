import { api } from './client';
import type { Project, ProjectRole, Task } from '../types';

export function listProjects() {
  return api.get<{ projects: Project[] }>('/projects').then((r) => r.data.projects);
}

export function getProject(id: string) {
  return api.get<{ project: Project }>(`/projects/${id}`).then((r) => r.data.project);
}

export function createProject(payload: { name: string; description?: string; language?: string }) {
  return api.post<{ project: Project }>('/projects', payload).then((r) => r.data.project);
}

export function updateProject(id: string, payload: { name?: string; description?: string; status?: string }) {
  return api.patch<{ project: Project }>(`/projects/${id}`, payload).then((r) => r.data.project);
}

export function deleteProject(id: string) {
  return api.delete(`/projects/${id}`);
}

export function addMember(projectId: string, payload: { userId: string; projectRole: ProjectRole }) {
  return api.post<{ project: Project }>(`/projects/${projectId}/members`, payload).then((r) => r.data.project);
}

export function updateMemberRole(projectId: string, userId: string, projectRole: ProjectRole) {
  return api
    .patch<{ project: Project }>(`/projects/${projectId}/members/${userId}`, { projectRole })
    .then((r) => r.data.project);
}

export function removeMember(projectId: string, userId: string) {
  return api.delete(`/projects/${projectId}/members/${userId}`);
}

export function listProjectTasks(projectId: string, params?: { status?: string; assignedTo?: string }) {
  return api.get<{ tasks: Task[] }>(`/projects/${projectId}/tasks`, { params }).then((r) => r.data.tasks);
}

export async function downloadProjectExportCsv(projectId: string): Promise<Blob> {
  const res = await api.get(`/projects/${projectId}/export`, {
    params: { format: 'csv' },
    responseType: 'blob',
  });
  return res.data as Blob;
}

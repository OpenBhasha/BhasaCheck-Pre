import { api } from './client';
import type { Annotation, AudioStorageProvider, Dataset, Task } from '../types';

export function uploadTaskAudio(
  projectId: string,
  file: File,
  fields: { language?: string; speakerLabel?: string; storageProvider?: AudioStorageProvider }
) {
  const formData = new FormData();
  formData.append('audio', file);
  if (fields.language) formData.append('language', fields.language);
  if (fields.speakerLabel) formData.append('speakerLabel', fields.speakerLabel);
  if (fields.storageProvider) formData.append('storageProvider', fields.storageProvider);

  return api
    .post<{ task: Task; dataset: Dataset }>(`/tasks?projectId=${projectId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
}

export function getTask(id: string) {
  return api.get<{ task: Task; dataset: Dataset | null }>(`/tasks/${id}`).then((r) => r.data);
}

export function listTasks(params: { projectId: string; status?: string; assignedTo?: string }) {
  return api.get<{ tasks: Task[] }>('/tasks', { params }).then((r) => r.data.tasks);
}

export function assignTask(
  id: string,
  payload: { assignedAnnotator?: string | null; assignedReviewer?: string | null }
) {
  return api.patch<{ task: Task }>(`/tasks/${id}/assign`, payload).then((r) => r.data.task);
}

export function listTaskAnnotations(id: string) {
  return api.get<{ annotations: Annotation[] }>(`/tasks/${id}/annotations`).then((r) => r.data.annotations);
}

/** Deletes the task along with its Cloudinary audio, Dataset, and Annotations. */
export function deleteTask(id: string) {
  return api.delete(`/tasks/${id}`);
}

/** Downloads the ML-generated transcript as an SRT file (speaker/language/model/confidence per cue). */
export async function downloadTaskSrt(id: string): Promise<Blob> {
  const res = await api.get(`/tasks/${id}/export/srt`, { responseType: 'blob' });
  return res.data as Blob;
}

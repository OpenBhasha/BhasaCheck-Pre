import { api } from './client';
import type { Annotation, AnnotationType, ReviewDecision } from '../types';

export function createAnnotation(payload: { taskId: string; type: AnnotationType; parentAnnotation?: string }) {
  return api.post<{ annotation: Annotation }>('/annotations', payload).then((r) => r.data.annotation);
}

export function getAnnotation(id: string) {
  return api.get<{ annotation: Annotation }>(`/annotations/${id}`).then((r) => r.data.annotation);
}

export function updateAnnotation(id: string, rsmlText: string) {
  return api.patch<{ annotation: Annotation }>(`/annotations/${id}`, { rsmlText }).then((r) => r.data.annotation);
}

export function submitAnnotation(id: string) {
  return api.post<{ annotation: Annotation }>(`/annotations/${id}/submit`).then((r) => r.data.annotation);
}

export function reviewAnnotation(id: string, payload: { decision: ReviewDecision; reviewComment?: string }) {
  return api
    .post<{ review: Annotation; parentAnnotation: Annotation }>(`/annotations/${id}/review`, payload)
    .then((r) => r.data);
}

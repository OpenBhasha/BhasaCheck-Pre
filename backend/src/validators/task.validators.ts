import { z } from 'zod';

export const uploadAudioTaskSchema = z.object({
  body: z.object({
    language: z.string().max(50).optional(),
    speakerLabel: z.string().max(200).optional(),
  }),
  query: z.object({
    projectId: z.string().min(1),
  }),
});

export const assignTaskSchema = z.object({
  body: z.object({
    assignedAnnotator: z.string().nullable().optional(),
    assignedReviewer: z.string().nullable().optional(),
  }),
});

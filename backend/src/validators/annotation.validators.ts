import { z } from 'zod';

export const createAnnotationSchema = z.object({
  body: z.object({
    taskId: z.string().min(1),
    type: z.enum(['annotation', 'review']),
    parentAnnotation: z.string().min(1).optional(),
  }),
});

export const updateAnnotationSchema = z.object({
  body: z.object({
    rsmlText: z.string(),
  }),
});

export const reviewAnnotationSchema = z.object({
  body: z.object({
    decision: z.enum(['accept', 'reject', 'to_correct']),
    reviewComment: z.string().max(5000).optional(),
  }),
});

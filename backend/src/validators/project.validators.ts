import { z } from 'zod';

export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    language: z.string().max(50).optional(),
  }),
});

export const updateProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    status: z.enum(['active', 'archived']).optional(),
  }),
});

export const addMemberSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
    projectRole: z.enum(['admin', 'reviewer', 'annotator']),
  }),
});

export const updateMemberSchema = z.object({
  body: z.object({
    projectRole: z.enum(['admin', 'reviewer', 'annotator']),
  }),
});

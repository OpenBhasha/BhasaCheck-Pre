import { z } from 'zod';

export const updateMeSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200).optional(),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(200),
  }),
});

export const changeRoleSchema = z.object({
  body: z.object({
    role: z.enum(['super_admin', 'admin', 'reviewer', 'annotator']),
  }),
});

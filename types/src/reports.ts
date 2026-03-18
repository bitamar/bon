import { z } from 'zod';

export const uniformFileQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2099),
});

export type UniformFileQuery = z.infer<typeof uniformFileQuerySchema>;

import { z } from 'zod';

export const pcn874QuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2099),
  month: z.coerce.number().int().min(1).max(12),
});

export type Pcn874Query = z.infer<typeof pcn874QuerySchema>;

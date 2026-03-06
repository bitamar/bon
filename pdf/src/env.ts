import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CHROMIUM_PATH: z.string().trim().min(1).default('/usr/bin/chromium'),
});

export const env = Env.parse(process.env);

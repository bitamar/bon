import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().default(3001),
  CHROMIUM_PATH: z.string().default('/usr/bin/chromium'),
});

export const env = Env.parse(process.env);

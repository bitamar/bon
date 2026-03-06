import 'dotenv/config';
import { z } from 'zod';

export const SHAAM_MODES = ['mock', 'sandbox', 'production'] as const;
export type ShaamMode = (typeof SHAAM_MODES)[number];

const Env = z
  .object({
    PORT: z.coerce.number().default(3000),
    APP_ORIGIN: z.string().url(),
    JWT_SECRET: z.string().min(32),
    DATABASE_URL: z.string().url(),
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    URL: z.string().url(),
    PDF_SERVICE_URL: z.string().url(),
    PDF_STORAGE_DIR: z.string().default('.data/pdfs'),
    RESEND_API_KEY: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().optional()
    ),
    EMAIL_FROM: z.string().email().default('noreply@bon.co.il'),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_TIME_WINDOW: z
      .union([z.coerce.number().int().positive(), z.string()])
      .default('1 minute'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    NODE_ENV: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.enum(['development', 'test', 'production']).default('production')
    ),
    SHAAM_MODE: z.enum(SHAAM_MODES).default('mock'),
    SHAAM_ENCRYPTION_KEY: z
      .string()
      .length(64)
      .regex(/^[0-9a-fA-F]+$/, 'Must be a hex string')
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.SHAAM_MODE !== 'mock' && !data.SHAAM_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SHAAM_ENCRYPTION_KEY is required when SHAAM_MODE is not mock',
        path: ['SHAAM_ENCRYPTION_KEY'],
      });
    }
  });

const parsed = Env.parse(process.env);
const appOriginUrl = new URL(parsed.APP_ORIGIN);

export const env = {
  ...parsed,
  APP_ORIGIN: appOriginUrl.origin,
  APP_ORIGIN_HOST: appOriginUrl.host,
  OAUTH_REDIRECT_URI: `${parsed.URL}/auth/google/callback`,
};

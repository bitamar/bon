import 'dotenv/config';
import { z } from 'zod';

export const SHAAM_MODES = ['mock', 'sandbox', 'production'] as const;
export type ShaamMode = (typeof SHAAM_MODES)[number];

export const MESHULAM_MODES = ['mock', 'sandbox', 'production'] as const;
export type MeshulamMode = (typeof MESHULAM_MODES)[number];

export const WHATSAPP_MODES = ['mock', 'sandbox', 'production'] as const;
export type WhatsAppMode = (typeof WHATSAPP_MODES)[number];

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
    SHAAM_REGISTRATION_NUMBER: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().optional()
    ),
    MESHULAM_MODE: z.enum(MESHULAM_MODES).default('mock'),
    MESHULAM_PAGE_CODE: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().optional()
    ),
    MESHULAM_USER_ID: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().optional()
    ),
    MESHULAM_WEBHOOK_SECRET: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().optional()
    ),
    WHATSAPP_MODE: z.enum(WHATSAPP_MODES).default('mock'),
    TWILIO_ACCOUNT_SID: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().optional()
    ),
    TWILIO_AUTH_TOKEN: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().optional()
    ),
    TWILIO_WHATSAPP_FROM: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z
        .string()
        .regex(/^whatsapp:\+[1-9]\d{6,14}$/, 'Must be whatsapp:+E.164 format')
        .optional()
    ),
  })
  .superRefine((data, ctx) => {
    if (data.SHAAM_MODE !== 'mock' && !data.SHAAM_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SHAAM_ENCRYPTION_KEY is required when SHAAM_MODE is not mock',
        path: ['SHAAM_ENCRYPTION_KEY'],
      });
    }
    if (data.WHATSAPP_MODE !== 'mock') {
      if (!data.TWILIO_ACCOUNT_SID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'TWILIO_ACCOUNT_SID is required when WHATSAPP_MODE is not mock',
          path: ['TWILIO_ACCOUNT_SID'],
        });
      }
      if (!data.TWILIO_AUTH_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'TWILIO_AUTH_TOKEN is required when WHATSAPP_MODE is not mock',
          path: ['TWILIO_AUTH_TOKEN'],
        });
      }
      if (!data.TWILIO_WHATSAPP_FROM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'TWILIO_WHATSAPP_FROM is required when WHATSAPP_MODE is not mock',
          path: ['TWILIO_WHATSAPP_FROM'],
        });
      }
    }
    if (data.MESHULAM_MODE !== 'mock') {
      if (!data.MESHULAM_PAGE_CODE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'MESHULAM_PAGE_CODE is required when MESHULAM_MODE is not mock',
          path: ['MESHULAM_PAGE_CODE'],
        });
      }
      if (!data.MESHULAM_USER_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'MESHULAM_USER_ID is required when MESHULAM_MODE is not mock',
          path: ['MESHULAM_USER_ID'],
        });
      }
      if (!data.MESHULAM_WEBHOOK_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'MESHULAM_WEBHOOK_SECRET is required when MESHULAM_MODE is not mock',
          path: ['MESHULAM_WEBHOOK_SECRET'],
        });
      }
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

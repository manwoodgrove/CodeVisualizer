import { z } from 'zod';
import crypto from 'node:crypto';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  SESSION_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  GITHUB_CALLBACK_URL: z
    .string()
    .default('http://localhost:4000/auth/github/callback'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  DATABASE_URL: z.string().default('file:./data/app.sqlite'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const parsed = envSchema.parse(process.env);

let sessionSecret = parsed.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString('hex'); // 64 hex chars
  console.warn(
    '[config] SESSION_SECRET is not set — using a random secret. Sessions will not survive restarts.'
  );
}

export const config = {
  port: parsed.PORT,
  host: parsed.HOST,
  sessionSecret,
  githubClientId: parsed.GITHUB_CLIENT_ID,
  githubClientSecret: parsed.GITHUB_CLIENT_SECRET,
  githubCallbackUrl: parsed.GITHUB_CALLBACK_URL,
  redisUrl: parsed.REDIS_URL,
  databaseUrl: parsed.DATABASE_URL,
  corsOrigin: parsed.CORS_ORIGIN,
} as const;

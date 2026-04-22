import { z } from 'zod';

const envSchema = z.object({
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_CALLBACK_URL: z.string().url().default('http://localhost:3001/auth/github/callback'),
  SESSION_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_PATH: z.string().default('./codevisualizer.db'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map(i => i.path.join('.')).join(', ');
    throw new Error(`Missing or invalid env vars: ${missing}`);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;

import { z } from 'zod';

const envSchema = z
  .object({
    PORT: z.coerce.number().default(4000),
    HOST: z.string().default('0.0.0.0'),
    SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
    GITHUB_CLIENT_ID: z.string().default(''),
    GITHUB_CLIENT_SECRET: z.string().default(''),
    GITHUB_CALLBACK_URL: z
      .string()
      .default('http://localhost:4000/auth/github/callback'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    DATABASE_URL: z.string().default('file:./data/app.sqlite'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  })
  ;

const parsed = envSchema.parse(process.env);

let sessionSecret = parsed.SESSION_SECRET;

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

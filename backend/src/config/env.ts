import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Workspace scripts run from the monorepo root, while the documented secrets live
// in backend/.env. Load that file explicitly, then allow a root .env as a fallback.
const backendEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: backendEnvPath });
dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must contain at least 32 characters').refine(value => !/(replace-with|change-me|placeholder|your-secret)/i.test(value), 'Replace the example SESSION_SECRET with a unique random secret.'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  FINBERT_SERVICE_URL: z.string().url().default('http://127.0.0.1:8001'),
  FINBERT_MODEL_ID: z.string().min(1).default('ProsusAI/finbert'),
  MARKET_DATA_PROVIDER: z.enum(['disabled', 'finnhub']).default('disabled'),
  MARKET_DATA_API_KEY: z.string().optional().default(''),
  NEWS_PROVIDER: z.enum(['disabled', 'finnhub']).default('disabled'),
  LLM_PROVIDER: z.enum(['disabled', 'openai', 'gemini']).default('disabled'),
  LLM_API_KEY: z.string().optional().default(''),
  LLM_MODEL: z.string().optional().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  process.exit(1);
}
export const env = parsed.data;

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import * as schema from './schema.js';

const dbPath = config.databaseUrl.startsWith('file:')
  ? config.databaseUrl.slice('file:'.length)
  : config.databaseUrl;

const resolvedPath = path.resolve(dbPath);
const parentDir = path.dirname(resolvedPath);
fs.mkdirSync(parentDir, { recursive: true });

export const sqlite = createClient({ url: `file:${resolvedPath}` });

export const db = drizzle(sqlite, { schema });

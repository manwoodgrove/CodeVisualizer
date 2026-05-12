import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config.js';
import { sqlite } from './db/client.js';
import githubAuth from './auth/github.js';
import healthPlugin from './routes/health.js';
import reposPlugin from './routes/repos.js';
import githubRoutes from './routes/github.js';
import { startImportWorker } from './queue/importQueue.js';

const DDL = `
  CREATE TABLE IF NOT EXISTS repos (
    id          TEXT PRIMARY KEY,
    url         TEXT NOT NULL,
    name        TEXT NOT NULL,
    branch      TEXT NOT NULL,
    status      TEXT NOT NULL,
    error       TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    node_count  INTEGER,
    edge_count  INTEGER
  );
  CREATE TABLE IF NOT EXISTS graph_snapshots (
    repo_id     TEXT PRIMARY KEY REFERENCES repos(id),
    node_count  INTEGER NOT NULL,
    edge_count  INTEGER NOT NULL,
    data        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id                      TEXT PRIMARY KEY,
    user_login              TEXT NOT NULL,
    user_avatar             TEXT NOT NULL,
    user_name               TEXT,
    github_token_encrypted  TEXT NOT NULL,
    expires_at              INTEGER NOT NULL,
    created_at              INTEGER NOT NULL
  );
`;

async function runMigrations(): Promise<void> {
  const statements = DDL.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  for (const stmt of statements) {
    await sqlite.execute({ sql: stmt, args: [] });
  }
}

async function build(): Promise<void> {
  await runMigrations();

  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  await fastify.register(fastifyCookie, { secret: config.sessionSecret });
  await fastify.register(fastifyCors, {
    origin: config.corsOrigin,
    credentials: true,
  });

  await fastify.register(githubAuth);
  await fastify.register(githubRoutes);
  await fastify.register(reposPlugin);
  await fastify.register(healthPlugin);

  await fastify.ready();

  const io = new SocketIOServer(fastify.server, {
    cors: { origin: config.corsOrigin, credentials: true },
  });

  io.on('connection', (socket) => {
    fastify.log.info({ socketId: socket.id }, 'WebSocket client connected');
    socket.on('subscribe', (jobId: string) => {
      if (typeof jobId === 'string' && jobId.length > 0) {
        socket.join(jobId);
      }
    });
    socket.on('unsubscribe', (jobId: string) => socket.leave(jobId));
    socket.on('disconnect', () => {
      fastify.log.info({ socketId: socket.id }, 'WebSocket client disconnected');
    });
  });

  try {
    startImportWorker(io, fastify.log);
  } catch (err) {
    fastify.log.warn({ err }, 'Import worker failed to start (Redis may be unavailable)');
  }

  await fastify.listen({ port: config.port, host: config.host });
  fastify.log.info(`Server listening on http://${config.host}:${config.port}`);
}

build().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

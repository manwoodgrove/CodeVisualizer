import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import fastifyCors from '@fastify/cors';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';
import { config } from './config.js';
import { getDb } from './db/client.js';
import { startImportWorker } from './jobs/import-worker.js';
import reposRoutes from './routes/repos.js';
import authRoutes from './routes/auth.js';

async function main() {
  // Init DB
  getDb();

  const fastify = Fastify({ logger: { level: 'info' } });

  await fastify.register(fastifyCors, {
    origin: config.FRONTEND_URL,
    credentials: true,
  });

  await fastify.register(fastifyCookie);
  await fastify.register(fastifySession, {
    secret: config.SESSION_SECRET,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  });

  // Routes
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(reposRoutes, { prefix: '/api/repos' });

  fastify.get('/api/health', async () => ({ ok: true, ts: Date.now() }));

  // Create HTTP server so socket.io can share it
  const httpServer = createServer(fastify.server);
  const io = new SocketServer(httpServer, {
    cors: { origin: config.FRONTEND_URL, credentials: true },
  });

  io.on('connection', (socket) => {
    fastify.log.info(`Socket connected: ${socket.id}`);
  });

  startImportWorker(io);

  const port = config.PORT;
  await fastify.listen({ port, host: '0.0.0.0' });
  fastify.log.info(`API running on http://localhost:${port}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

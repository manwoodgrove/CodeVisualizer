import type { FastifyPluginAsync } from 'fastify';

const health: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/health', async (_request, reply) => {
    return reply.send({ ok: true, uptime: process.uptime() });
  });
};

export default health;

import type { FastifyPluginAsync } from 'fastify';
import { Octokit } from 'octokit';
import { config } from '../config.js';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /auth/github → redirect to GitHub OAuth
  fastify.get('/github', async (req, reply) => {
    const state = crypto.randomUUID();
    const session = req.session as unknown as Record<string, unknown>;
    session.oauthState = state;

    const params = new URLSearchParams({
      client_id: config.GITHUB_CLIENT_ID,
      redirect_uri: config.GITHUB_CALLBACK_URL,
      scope: 'repo read:user',
      state,
    });
    return reply.redirect(`${GITHUB_AUTH_URL}?${params}`);
  });

  // GET /auth/github/callback
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/github/callback',
    async (req, reply) => {
      const { code, state, error } = req.query;
      const session = req.session as unknown as Record<string, unknown>;

      if (error || !code) {
        return reply.redirect(`${config.FRONTEND_URL}?auth_error=${error ?? 'missing_code'}`);
      }
      if (state !== session.oauthState) {
        return reply.redirect(`${config.FRONTEND_URL}?auth_error=state_mismatch`);
      }

      // Exchange code for token
      const tokenRes = await fetch(GITHUB_TOKEN_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: config.GITHUB_CLIENT_ID,
          client_secret: config.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: config.GITHUB_CALLBACK_URL,
        }),
      });
      const tokenData = await tokenRes.json() as { access_token?: string; error?: string };

      if (!tokenData.access_token) {
        return reply.redirect(`${config.FRONTEND_URL}?auth_error=token_exchange_failed`);
      }

      // Get user info
      const octokit = new Octokit({ auth: tokenData.access_token });
      const { data: user } = await octokit.rest.users.getAuthenticated();

      session.githubToken = tokenData.access_token;
      session.githubUser = user.login;

      return reply.redirect(`${config.FRONTEND_URL}?auth_success=1`);
    },
  );

  // GET /auth/me
  fastify.get('/me', async (req, reply) => {
    const session = req.session as unknown as Record<string, unknown>;
    if (!session.githubToken) return reply.status(401).send({ error: 'Not authenticated' });
    return { login: session.githubUser };
  });

  // POST /auth/logout
  fastify.post('/logout', async (req, reply) => {
    await req.session.destroy();
    return { ok: true };
  });
};

export default authRoutes;

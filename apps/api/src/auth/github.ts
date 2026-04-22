import crypto from 'node:crypto';
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { nanoid } from 'nanoid';
import type { AuthMeResponse } from '@cv/types';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { sessions } from '../db/schema.js';
import { decrypt, encrypt } from './crypto.js';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Augment Fastify request with authContext
// ---------------------------------------------------------------------------
declare module 'fastify' {
  interface FastifyRequest {
    authContext?: {
      user: { login: string; avatarUrl: string; name?: string };
      token: string;
    };
  }
}

// ---------------------------------------------------------------------------
// requireAuth preHandler
// ---------------------------------------------------------------------------
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const rawSid = (request.cookies as Record<string, string | undefined>)['sid'];
  if (!rawSid) {
    return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } });
  }

  const unsigned = request.unsignCookie(rawSid);
  if (!unsigned.valid || !unsigned.value) {
    return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Invalid session cookie' } });
  }
  const sid = unsigned.value;

  const rows = await db.select().from(sessions).where(eq(sessions.id, sid));
  if (rows.length === 0) {
    return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Session not found' } });
  }

  const session = rows[0];
  if (Date.now() > session.expiresAt) {
    await db.delete(sessions).where(eq(sessions.id, sid));
    return reply.status(401).send({ error: { code: 'SESSION_EXPIRED', message: 'Session expired' } });
  }

  let token: string;
  try {
    token = decrypt(session.githubTokenEncrypted);
  } catch {
    return reply.status(401).send({ error: { code: 'INVALID_SESSION', message: 'Could not decrypt token' } });
  }

  request.authContext = {
    user: {
      login: session.userLogin,
      avatarUrl: session.userAvatar,
      name: session.userName ?? undefined,
    },
    token,
  };
}

// ---------------------------------------------------------------------------
// GitHub OAuth plugin
// ---------------------------------------------------------------------------
const githubAuth: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Step 1 — redirect to GitHub
  fastify.get('/auth/github', async (request, reply) => {
    const state = crypto.randomBytes(16).toString('hex');

    reply.setCookie('oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      signed: true,
      path: '/',
      maxAge: 600, // 10 minutes
    });

    const params = new URLSearchParams({
      client_id: config.githubClientId,
      scope: 'repo read:user',
      state,
      redirect_uri: config.githubCallbackUrl,
    });

    return reply.redirect(
      302,
      `https://github.com/login/oauth/authorize?${params.toString()}`
    );
  });

  // Step 2 — handle callback
  fastify.get<{ Querystring: { code?: string; state?: string } }>(
    '/auth/github/callback',
    async (request, reply) => {
      const { code, state } = request.query;

      // Verify state
      const storedStateResult = request.unsignCookie(
        (request.cookies as Record<string, string | undefined>)['oauth_state'] ?? ''
      );
      if (
        !storedStateResult.valid ||
        !state ||
        storedStateResult.value !== state
      ) {
        return reply
          .status(400)
          .send({ error: { code: 'INVALID_STATE', message: 'OAuth state mismatch' } });
      }

      if (!code) {
        return reply
          .status(400)
          .send({ error: { code: 'MISSING_CODE', message: 'No code provided' } });
      }

      // Exchange code for access token
      const tokenRes = await fetch(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: config.githubClientId,
            client_secret: config.githubClientSecret,
            code,
            redirect_uri: config.githubCallbackUrl,
          }),
        }
      );

      if (!tokenRes.ok) {
        return reply
          .status(502)
          .send({ error: { code: 'GITHUB_TOKEN_ERROR', message: 'Failed to exchange code' } });
      }

      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
      };

      if (!tokenData.access_token) {
        return reply
          .status(502)
          .send({ error: { code: 'GITHUB_TOKEN_ERROR', message: tokenData.error ?? 'No access token returned' } });
      }

      // Fetch GitHub user info
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github+json',
        },
      });

      if (!userRes.ok) {
        return reply
          .status(502)
          .send({ error: { code: 'GITHUB_USER_ERROR', message: 'Failed to fetch user info' } });
      }

      const userData = (await userRes.json()) as {
        login: string;
        avatar_url: string;
        name?: string | null;
      };

      // Create session
      const sessionId = nanoid();
      const now = Date.now();
      const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days

      await db.insert(sessions).values({
        id: sessionId,
        userLogin: userData.login,
        userAvatar: userData.avatar_url,
        userName: userData.name ?? null,
        githubTokenEncrypted: encrypt(tokenData.access_token),
        expiresAt,
        createdAt: now,
      });

      // Set session cookie and redirect
      reply
        .clearCookie('oauth_state', { path: '/' })
        .setCookie('sid', sessionId, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          signed: true,
          path: '/',
          maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
        })
        .redirect(302, `${config.corsOrigin}/`);
    }
  );

  // Logout
  fastify.post('/auth/logout', async (request, reply) => {
    const sid = (request.cookies as Record<string, string | undefined>)['sid'];
    if (sid) {
      const unsigned = request.unsignCookie(sid);
      if (unsigned.valid && unsigned.value) {
        await db.delete(sessions).where(eq(sessions.id, unsigned.value));
      }
    }
    reply.clearCookie('sid', { path: '/' });
    return reply.send({ ok: true });
  });

  // Me
  fastify.get('/auth/me', async (request, reply) => {
    const sid = (request.cookies as Record<string, string | undefined>)['sid'];
    if (!sid) {
      const res: AuthMeResponse = { authenticated: false };
      return reply.send(res);
    }

    const unsigned = request.unsignCookie(sid);
    if (!unsigned.valid || !unsigned.value) {
      const res: AuthMeResponse = { authenticated: false };
      return reply.send(res);
    }

    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, unsigned.value));

    if (rows.length === 0 || Date.now() > rows[0].expiresAt) {
      const res: AuthMeResponse = { authenticated: false };
      return reply.send(res);
    }

    const session = rows[0];
    const res: AuthMeResponse = {
      authenticated: true,
      user: {
        login: session.userLogin,
        avatarUrl: session.userAvatar,
        name: session.userName ?? undefined,
      },
    };
    return reply.send(res);
  });
};

export default githubAuth;

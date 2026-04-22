import type { FastifyPluginAsync } from 'fastify';
import { Octokit } from '@octokit/rest';
import type { GitHubRepoSummary, ListGitHubReposResponse } from '@cv/types';
import { requireAuth } from '../auth/github.js';

const githubRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/github/repos',
    { preHandler: requireAuth },
    async (request, reply) => {
      const ctx = request.authContext;
      if (!ctx) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } });
      }

      const octokit = new Octokit({ auth: ctx.token });

      try {
        const rows = await octokit.paginate(
          octokit.repos.listForAuthenticatedUser,
          {
            per_page: 100,
            sort: 'pushed',
            affiliation: 'owner,collaborator,organization_member',
          },
        );

        const repos: GitHubRepoSummary[] = rows.map((r) => ({
          fullName: r.full_name,
          name: r.name,
          owner: r.owner?.login ?? '',
          description: r.description,
          private: r.private,
          fork: r.fork,
          stars: r.stargazers_count ?? 0,
          language: r.language ?? null,
          pushedAt: r.pushed_at ?? r.updated_at ?? new Date().toISOString(),
          defaultBranch: r.default_branch ?? 'main',
          htmlUrl: r.html_url,
        }));

        const res: ListGitHubReposResponse = { repos };
        return reply.send(res);
      } catch (err) {
        request.log.error({ err }, 'Failed to list GitHub repos');
        return reply
          .status(502)
          .send({ error: { code: 'GITHUB_LIST_ERROR', message: 'Failed to list GitHub repositories' } });
      }
    },
  );
};

export default githubRoutes;

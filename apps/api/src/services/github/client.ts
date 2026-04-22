import { Octokit } from 'octokit';

export function createOctokit(token?: string): Octokit {
  return new Octokit({ auth: token });
}

export function parseRepoUrl(url: string): { owner: string; repo: string } {
  const clean = url.replace(/\.git$/, '').replace(/\/$/, '');
  const match = clean.match(/github\.com[/:]([^/]+)\/([^/]+)/);
  if (!match) throw new Error(`Cannot parse GitHub URL: ${url}`);
  return { owner: match[1], repo: match[2] };
}

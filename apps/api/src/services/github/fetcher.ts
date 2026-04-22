import { createOctokit, parseRepoUrl } from './client.js';
import { shouldIncludeFile, MAX_FILES } from './filter.js';

export interface FetchedFile {
  path: string;
  content: string;
  sizeBytes: number;
}

export async function fetchRepoFiles(
  repoUrl: string,
  branch: string,
  token?: string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<FetchedFile[]> {
  const octokit = createOctokit(token);
  const { owner, repo } = parseRepoUrl(repoUrl);

  const ref = branch || 'HEAD';
  const { data: treeData } = await octokit.rest.git.getTree({
    owner, repo, tree_sha: ref, recursive: '1',
  });

  const blobs = treeData.tree
    .filter(item => item.type === 'blob' && item.path && item.size !== undefined)
    .filter(item => shouldIncludeFile(item.path!, item.size!))
    .slice(0, MAX_FILES);

  const files: FetchedFile[] = [];
  const CONCURRENCY = 10;

  for (let i = 0; i < blobs.length; i += CONCURRENCY) {
    const batch = blobs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async blob => {
        const { data } = await octokit.rest.repos.getContent({
          owner, repo, path: blob.path!, ref,
        });
        if (Array.isArray(data) || data.type !== 'file') return null;
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return { path: blob.path!, content, sizeBytes: blob.size! } satisfies FetchedFile;
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) files.push(r.value);
    }
    onProgress?.(Math.min(i + CONCURRENCY, blobs.length), blobs.length);
  }

  return files;
}

import { Octokit } from '@octokit/rest';

export interface FetchedFile {
  path: string;
  content: string;
  size: number;
}

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIP_PREFIXES = ['node_modules/', 'dist/', 'build/', '.next/', 'coverage/'];
const MAX_FILE_SIZE = 500_000;
const CONCURRENCY = 10;

function isAllowedPath(path: string): boolean {
  for (const prefix of SKIP_PREFIXES) {
    if (path.startsWith(prefix)) return false;
  }
  const dot = path.lastIndexOf('.');
  if (dot === -1) return false;
  const ext = path.slice(dot);
  return ALLOWED_EXTENSIONS.has(ext);
}

async function chunkedAll<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<unknown>,
): Promise<PromiseSettledResult<unknown>[]> {
  const results: PromiseSettledResult<unknown>[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map(fn));
    results.push(...settled);
  }
  return results;
}

export async function fetchRepoFiles(opts: {
  token: string;
  owner: string;
  repo: string;
  branch?: string;
  onProgress?: (p: number) => void;
}): Promise<FetchedFile[]> {
  const { token, owner, repo, branch, onProgress } = opts;

  const octokit = new Octokit({ auth: token });

  // Get the default branch if not specified
  let ref = branch;
  if (!ref) {
    const repoInfo = await octokit.repos.get({ owner, repo });
    ref = repoInfo.data.default_branch;
  }

  // Get recursive tree
  const treeResp = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: ref,
    recursive: '1',
  });

  const treeItems = treeResp.data.tree.filter(
    (item) =>
      item.type === 'blob' &&
      item.path !== undefined &&
      isAllowedPath(item.path) &&
      (item.size ?? 0) < MAX_FILE_SIZE,
  );

  onProgress?.(0);

  const fetchedFiles: FetchedFile[] = [];
  let done = 0;

  await chunkedAll(treeItems, CONCURRENCY, async (item) => {
    try {
      const resp = await octokit.repos.getContent({
        owner,
        repo,
        path: item.path!,
        ref,
      });
      const data = resp.data as { content?: string; encoding?: string; size?: number };
      if (data.content && data.encoding === 'base64') {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        fetchedFiles.push({
          path: item.path!,
          content,
          size: data.size ?? content.length,
        });
      }
    } finally {
      done++;
      onProgress?.(Math.round((done / treeItems.length) * 100));
    }
  });

  return fetchedFiles;
}

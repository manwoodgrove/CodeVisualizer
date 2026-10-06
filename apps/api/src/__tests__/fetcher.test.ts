import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRepoFiles } from '../services/github/fetcher.js';
import { Octokit } from '@octokit/rest';

// We mock octokit constructor and instance methods
vi.mock('@octokit/rest', () => {
  return {
    Octokit: vi.fn(),
  };
});

describe('fetchRepoFiles', () => {
  let octokitMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    octokitMock = {
      repos: {
        get: vi.fn(),
      },
      git: {
        getTree: vi.fn(),
        getBlob: vi.fn(),
      },
    };
    (Octokit as unknown as any).mockImplementation(() => octokitMock);
  });

  it('should fetch files successfully using default branch', async () => {
    octokitMock.repos.get.mockResolvedValue({
      data: { default_branch: 'main' },
    });

    octokitMock.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { type: 'blob', path: 'src/index.ts', sha: 'sha1', size: 100 },
          { type: 'blob', path: 'src/style.css', sha: 'sha2', size: 100 }, // ignored extension
          { type: 'blob', path: 'node_modules/dep/index.js', sha: 'sha3', size: 100 }, // ignored prefix
          { type: 'blob', path: 'src/large.ts', sha: 'sha4', size: 1000000 }, // too large
        ],
      },
    });

    octokitMock.git.getBlob.mockResolvedValue({
      data: {
        content: Buffer.from('console.log("hello");').toString('base64'),
        encoding: 'base64',
        size: 21,
      },
    });

    const onProgress = vi.fn();

    const result = await fetchRepoFiles({
      token: 'test-token',
      owner: 'test-owner',
      repo: 'test-repo',
      onProgress,
    });

    expect(octokitMock.repos.get).toHaveBeenCalledWith({ owner: 'test-owner', repo: 'test-repo' });
    expect(octokitMock.git.getTree).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      tree_sha: 'main',
      recursive: '1',
    });
    // Only src/index.ts should be fetched
    expect(octokitMock.git.getBlob).toHaveBeenCalledTimes(1);
    expect(octokitMock.git.getBlob).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      file_sha: 'sha1',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: 'src/index.ts',
      content: 'console.log("hello");',
      size: 21,
    });

    expect(onProgress).toHaveBeenCalled();
  });

  it('should use provided branch instead of fetching default branch', async () => {
    octokitMock.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { type: 'blob', path: 'src/index.ts', sha: 'sha1', size: 100 },
        ],
      },
    });

    octokitMock.git.getBlob.mockResolvedValue({
      data: {
        content: Buffer.from('test').toString('base64'),
        encoding: 'base64',
      },
    });

    const result = await fetchRepoFiles({
      token: 'test-token',
      owner: 'test-owner',
      repo: 'test-repo',
      branch: 'feature-branch',
    });

    // Should NOT have called repos.get
    expect(octokitMock.repos.get).not.toHaveBeenCalled();

    // Should have called getTree with 'feature-branch'
    expect(octokitMock.git.getTree).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      tree_sha: 'feature-branch',
      recursive: '1',
    });

    expect(result).toHaveLength(1);
  });

  it('should handle getBlob failures gracefully and continue', async () => {
    octokitMock.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { type: 'blob', path: 'src/file1.ts', sha: 'sha1', size: 100 },
          { type: 'blob', path: 'src/file2.ts', sha: 'sha2', size: 100 },
        ],
      },
    });

    // fail on first file, succeed on second
    octokitMock.git.getBlob.mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        data: {
          content: Buffer.from('success').toString('base64'),
          encoding: 'base64',
          size: 7,
        },
      });

    const result = await fetchRepoFiles({
      token: 'test-token',
      owner: 'test-owner',
      repo: 'test-repo',
      branch: 'main',
    });

    expect(octokitMock.git.getBlob).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/file2.ts');
  });

  it('should handle items without sha gracefully', async () => {
    octokitMock.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { type: 'blob', path: 'src/file1.ts', size: 100 }, // No sha
        ],
      },
    });

    const result = await fetchRepoFiles({
      token: 'test-token',
      owner: 'test-owner',
      repo: 'test-repo',
      branch: 'main',
    });

    expect(octokitMock.git.getBlob).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });

  it('should ignore blobs with non-base64 encoding or missing content', async () => {
    octokitMock.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { type: 'blob', path: 'src/missing.ts', sha: 'sha1', size: 100 },
          { type: 'blob', path: 'src/utf8.ts', sha: 'sha2', size: 100 },
        ],
      },
    });

    octokitMock.git.getBlob.mockResolvedValueOnce({
      data: {
        encoding: 'base64',
        // missing content
      },
    }).mockResolvedValueOnce({
      data: {
        content: 'plain text content',
        encoding: 'utf-8', // non-base64
      },
    });

    const result = await fetchRepoFiles({
      token: 'test-token',
      owner: 'test-owner',
      repo: 'test-repo',
      branch: 'main',
    });

    expect(octokitMock.git.getBlob).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(0);
  });

  it('should ignore files without extension', async () => {
    octokitMock.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { type: 'blob', path: 'LICENSE', sha: 'sha1', size: 100 },
        ],
      },
    });

    const result = await fetchRepoFiles({
      token: 'test-token',
      owner: 'test-owner',
      repo: 'test-repo',
      branch: 'main',
    });

    expect(octokitMock.git.getBlob).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });

  it('should ignore blob missing sha in tree item inside chunkedAll', async () => {
    octokitMock.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { type: 'blob', path: 'src/empty.ts', sha: '', size: 100 },
        ],
      },
    });

    const result = await fetchRepoFiles({
      token: 'test-token',
      owner: 'test-owner',
      repo: 'test-repo',
      branch: 'main',
    });

    expect(octokitMock.git.getBlob).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });
});

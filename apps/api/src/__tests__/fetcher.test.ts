import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRepoFiles } from '../services/github/fetcher';
import { Octokit } from '@octokit/rest';

vi.mock('@octokit/rest', () => {
  const mockOctokit = {
    repos: {
      get: vi.fn(),
    },
    git: {
      getTree: vi.fn(),
      getBlob: vi.fn(),
    },
  };
  return {
    Octokit: vi.fn(() => mockOctokit),
  };
});

describe('fetchRepoFiles', () => {
  let mockOctokitInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOctokitInstance = new Octokit();
  });

  it('should ignore unreachable or binary blobs that throw an error and continue fetching', async () => {
    mockOctokitInstance.repos.get.mockResolvedValue({
      data: { default_branch: 'main' },
    });

    mockOctokitInstance.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { type: 'blob', path: 'file1.ts', sha: 'sha1', size: 100 },
          { type: 'blob', path: 'file2.ts', sha: 'sha2', size: 100 },
          { type: 'blob', path: 'file3.ts', sha: 'sha3', size: 100 },
        ],
      },
    });

    mockOctokitInstance.git.getBlob.mockImplementation(async ({ file_sha }: { file_sha: string }) => {
      if (file_sha === 'sha2') {
        throw new Error('Blob not found');
      }
      return {
        data: {
          content: Buffer.from(`content of ${file_sha}`).toString('base64'),
          encoding: 'base64',
          size: 100,
        },
      };
    });

    const result = await fetchRepoFiles({
      token: 'mock-token',
      owner: 'test-owner',
      repo: 'test-repo',
    });

    // file2.ts should be missing since it threw an error
    expect(result).toHaveLength(2);
    // order is not guaranteed because of Promise.allSettled, but array should contain these objects
    expect(result).toEqual(
      expect.arrayContaining([
        { path: 'file1.ts', content: 'content of sha1', size: 100 },
        { path: 'file3.ts', content: 'content of sha3', size: 100 },
      ])
    );

    expect(mockOctokitInstance.git.getBlob).toHaveBeenCalledTimes(3);
  });
});

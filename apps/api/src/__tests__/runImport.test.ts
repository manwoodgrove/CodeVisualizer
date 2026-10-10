import { describe, it, expect } from 'vitest';
import { parseGithubUrl } from '../services/pipeline/runImport.js';

describe('parseGithubUrl', () => {
  it('should parse standard GitHub URLs', () => {
    expect(parseGithubUrl('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
    expect(parseGithubUrl('github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('should parse URLs with .git suffix', () => {
    expect(parseGithubUrl('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('should handle trailing slashes', () => {
    expect(parseGithubUrl('https://github.com/owner/repo/')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('should throw for invalid URLs', () => {
    expect(() => parseGithubUrl('https://github.com/owner')).toThrow();
    expect(() => parseGithubUrl('github.com/')).toThrow();
    expect(() => parseGithubUrl('')).toThrow();
  });

  it('should reject malicious or malformed inputs', () => {
    // Path traversal or suspicious characters in owner/repo should be rejected
    expect(() => parseGithubUrl('https://github.com/../repo')).toThrow(/Invalid GitHub owner/);
    expect(parseGithubUrl('https://github.com/owner/repo/../../etc/passwd')).toEqual({ owner: 'owner', repo: 'repo' });
    expect(() => parseGithubUrl('https://github.com/owner/..')).toThrow(/Invalid GitHub owner/);
    expect(() => parseGithubUrl('https://github.com/owner/.')).toThrow(/Invalid GitHub owner/);
  });
});

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const EXCLUDED_DIRS = [
  'node_modules', 'dist', 'build', '.git', 'vendor',
  '__pycache__', 'coverage', '.next', '.nuxt', 'out',
];

export function shouldIncludeFile(path: string, sizeBytes: number): boolean {
  if (sizeBytes > 500_000) return false;

  const parts = path.split('/');
  for (const part of parts.slice(0, -1)) {
    if (EXCLUDED_DIRS.includes(part)) return false;
  }

  const ext = '.' + path.split('.').pop();
  return ALLOWED_EXTENSIONS.has(ext);
}

export const MAX_FILES = 2000;

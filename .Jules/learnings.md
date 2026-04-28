# Learnings

- `vitest` is used for testing `apps/api`
- Running a specific test file requires passing a path relative to the specific app directory, like `pnpm -C apps/api test src/__tests__/fetcher.test.ts`. Using the absolute path or workspace-relative path like `pnpm -C apps/api test apps/api/src/__tests__/fetcher.test.ts` doesn't work out of the box because the process's current working directory is inside `apps/api`, so vitest resolves paths from there.
- Use `pnpm install` in this monorepo first if `vitest` command cannot be found during `pnpm test`.

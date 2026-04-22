import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { GraphSnapshot, RepoMeta } from '@cv/types';
import { db } from './client.js';
import { graphSnapshots, repos } from './schema.js';

function toRepoMeta(row: typeof repos.$inferSelect): RepoMeta {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    branch: row.branch,
    status: row.status as RepoMeta['status'],
    error: row.error ?? undefined,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    nodeCount: row.nodeCount ?? undefined,
    edgeCount: row.edgeCount ?? undefined,
  };
}

export async function createRepo(input: {
  url: string;
  name: string;
  branch: string;
}): Promise<string> {
  const id = nanoid();
  const now = Date.now();
  await db.insert(repos).values({
    id,
    url: input.url,
    name: input.name,
    branch: input.branch,
    status: 'pending',
    error: null,
    createdAt: now,
    updatedAt: now,
    nodeCount: null,
    edgeCount: null,
  });
  return id;
}

export async function updateRepoStatus(
  id: string,
  patch: Partial<RepoMeta>
): Promise<void> {
  const now = Date.now();
  await db
    .update(repos)
    .set({
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.error !== undefined && { error: patch.error ?? null }),
      ...(patch.nodeCount !== undefined && { nodeCount: patch.nodeCount ?? null }),
      ...(patch.edgeCount !== undefined && { edgeCount: patch.edgeCount ?? null }),
      updatedAt: now,
    })
    .where(eq(repos.id, id));
}

export async function getRepo(id: string): Promise<RepoMeta | null> {
  const rows = await db.select().from(repos).where(eq(repos.id, id));
  if (rows.length === 0) return null;
  return toRepoMeta(rows[0]);
}

export async function listRepos(): Promise<RepoMeta[]> {
  const rows = await db.select().from(repos);
  return rows.map(toRepoMeta);
}

export async function saveSnapshot(
  repoId: string,
  snapshot: GraphSnapshot
): Promise<void> {
  const now = Date.now();
  const data = JSON.stringify(snapshot);
  await db
    .insert(graphSnapshots)
    .values({
      repoId,
      nodeCount: snapshot.nodes.length,
      edgeCount: snapshot.edges.length,
      data,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: graphSnapshots.repoId,
      set: {
        nodeCount: snapshot.nodes.length,
        edgeCount: snapshot.edges.length,
        data,
        createdAt: now,
      },
    });
}

export async function getSnapshot(repoId: string): Promise<GraphSnapshot | null> {
  const rows = await db
    .select()
    .from(graphSnapshots)
    .where(eq(graphSnapshots.repoId, repoId));
  if (rows.length === 0) return null;
  return JSON.parse(rows[0].data) as GraphSnapshot;
}

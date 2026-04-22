import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { repos, graphSnapshots } from './schema.js';
import type { GraphSnapshot } from '@codevisualizer/types';
import type { RepoMeta, RepoStatus } from '@codevisualizer/types';

export async function createRepo(data: {
  id: string;
  url: string;
  name: string;
  branch: string;
}): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.insert(repos).values({ ...data, status: 'pending', createdAt: now, updatedAt: now });
}

export async function updateRepoStatus(id: string, status: RepoStatus): Promise<void> {
  const db = getDb();
  await db.update(repos).set({ status, updatedAt: Date.now() }).where(eq(repos.id, id));
}

export async function saveSnapshot(snapshot: GraphSnapshot): Promise<void> {
  const db = getDb();
  await db.insert(graphSnapshots).values({
    repoId: snapshot.repoId,
    nodeCount: snapshot.nodes.length,
    edgeCount: snapshot.edges.length,
    data: JSON.stringify(snapshot),
    createdAt: Date.now(),
  });
  await db.update(repos)
    .set({ status: 'ready', updatedAt: Date.now() })
    .where(eq(repos.id, snapshot.repoId));
}

export async function loadSnapshot(repoId: string): Promise<GraphSnapshot | null> {
  const db = getDb();
  const rows = await db.select()
    .from(graphSnapshots)
    .where(eq(graphSnapshots.repoId, repoId))
    .orderBy(graphSnapshots.createdAt)
    .limit(1);
  if (!rows[0]) return null;
  return JSON.parse(rows[0].data) as GraphSnapshot;
}

export async function getRepo(id: string): Promise<RepoMeta | null> {
  const db = getDb();
  const row = await db.select().from(repos).where(eq(repos.id, id)).limit(1);
  if (!row[0]) return null;
  const snap = await db.select({ nodeCount: graphSnapshots.nodeCount, edgeCount: graphSnapshots.edgeCount })
    .from(graphSnapshots).where(eq(graphSnapshots.repoId, id)).limit(1);
  return {
    id: row[0].id,
    url: row[0].url,
    name: row[0].name,
    branch: row[0].branch,
    status: row[0].status as RepoStatus,
    nodeCount: snap[0]?.nodeCount ?? 0,
    edgeCount: snap[0]?.edgeCount ?? 0,
    fileCount: 0,
    createdAt: row[0].createdAt,
  };
}

export async function listRepos(): Promise<RepoMeta[]> {
  const db = getDb();
  const rows = await db.select().from(repos).orderBy(repos.createdAt);
  return rows.map(r => ({
    id: r.id,
    url: r.url,
    name: r.name,
    branch: r.branch,
    status: r.status as RepoStatus,
    nodeCount: 0,
    edgeCount: 0,
    fileCount: 0,
    createdAt: r.createdAt,
  }));
}

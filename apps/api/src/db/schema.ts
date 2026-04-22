import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const repos = sqliteTable('repos', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  name: text('name').notNull(),
  branch: text('branch').notNull().default('main'),
  status: text('status').notNull().default('pending'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const graphSnapshots = sqliteTable('graph_snapshots', {
  repoId: text('repo_id').notNull().references(() => repos.id),
  nodeCount: integer('node_count').notNull().default(0),
  edgeCount: integer('edge_count').notNull().default(0),
  data: text('data').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  githubToken: text('github_token'),
  githubUser: text('github_user'),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

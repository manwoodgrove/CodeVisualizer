import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const repos = sqliteTable('repos', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  name: text('name').notNull(),
  branch: text('branch').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  nodeCount: integer('node_count'),
  edgeCount: integer('edge_count'),
});

export const graphSnapshots = sqliteTable('graph_snapshots', {
  repoId: text('repo_id')
    .primaryKey()
    .references(() => repos.id),
  nodeCount: integer('node_count').notNull(),
  edgeCount: integer('edge_count').notNull(),
  data: text('data').notNull(), // JSON blob
  createdAt: integer('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userLogin: text('user_login').notNull(),
  userAvatar: text('user_avatar').notNull(),
  userName: text('user_name'),
  githubTokenEncrypted: text('github_token_encrypted').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

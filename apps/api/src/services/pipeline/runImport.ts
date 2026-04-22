import { nanoid } from 'nanoid';
import type { GraphSnapshot, GraphStats, NodeKind, EdgeKind } from '@cv/types';
import { fetchRepoFiles } from '../github/fetcher.js';
import { parseFile } from '../parser/js-ts-parser.js';
import { buildGraph } from '../graph/builder.js';
import { enrichGraph } from '../graph/enricher.js';
import { clusterGraph } from '../graph/clusterer.js';
import { layoutGraph } from '../graph/layout.js';

export interface ImportContext {
  token: string;
  url: string;
  branch?: string;
  onProgress: (phase: 'fetch' | 'parse' | 'layout', pct: number, message?: string) => void;
}

function parseGithubUrl(url: string): { owner: string; repo: string } {
  // Handles https://github.com/owner/repo or github.com/owner/repo
  const cleaned = url.replace(/^https?:\/\//, '').replace(/\.git$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  const githubIndex = parts.findIndex((p) => p === 'github.com');
  const start = githubIndex >= 0 ? githubIndex + 1 : 0;
  const owner = parts[start];
  const repo = parts[start + 1];
  if (!owner || !repo) throw new Error(`Invalid GitHub URL: ${url}`);
  return { owner, repo };
}

export async function runImport(ctx: ImportContext): Promise<GraphSnapshot> {
  const { token, url, branch, onProgress } = ctx;
  const { owner, repo } = parseGithubUrl(url);
  const repoName = `${owner}/${repo}`;

  // Phase 1: Fetch
  const files = await fetchRepoFiles({
    token,
    owner,
    repo,
    branch,
    onProgress: (p) => onProgress('fetch', p),
  });

  // Phase 2: Parse
  const parseResults = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = parseFile(file.path, file.content);
    parseResults.push(result);
    onProgress('parse', Math.round(((i + 1) / files.length) * 100));
  }

  // Build graph
  const { nodes: rawNodes, edges: rawEdges } = buildGraph(parseResults);

  // Enrich
  const { nodes: enrichedNodes, edges: enrichedEdges } = enrichGraph(rawNodes, rawEdges);

  // Cluster
  const { clusters, nodesWithClusters } = clusterGraph(enrichedNodes, enrichedEdges);

  // Layout
  onProgress('layout', 0);
  const layoutNodes = layoutGraph(nodesWithClusters, enrichedEdges, clusters);
  onProgress('layout', 100);

  // Compute stats
  const byKind: Record<NodeKind, number> = {
    MODULE: 0,
    CLASS: 0,
    FUNCTION: 0,
    METHOD: 0,
    VARIABLE: 0,
  };
  for (const n of layoutNodes) byKind[n.kind]++;

  const byEdge: Record<EdgeKind, number> = {
    IMPORT: 0,
    CALL: 0,
    INHERITANCE: 0,
    DATA_FLOW: 0,
    EXPORT: 0,
  };
  for (const e of enrichedEdges) byEdge[e.kind]++;

  const stats: GraphStats = {
    nodeCount: layoutNodes.length,
    edgeCount: enrichedEdges.length,
    clusterCount: clusters.length,
    fileCount: files.length,
    byKind,
    byEdge,
  };

  const snapshot: GraphSnapshot = {
    repoId: nanoid(),
    repoName,
    nodes: layoutNodes,
    edges: enrichedEdges,
    clusters,
    stats,
  };

  return snapshot;
}

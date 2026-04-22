export type NodeKind = 'MODULE' | 'CLASS' | 'FUNCTION' | 'METHOD' | 'VARIABLE';
export type EdgeKind = 'IMPORT' | 'CALL' | 'INHERITANCE' | 'DATA_FLOW' | 'EXPORT';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface NodeMetrics {
  linesOfCode: number;
  cyclomaticComplexity: number;
  inDegree: number;
  outDegree: number;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  filePath: string;
  exported: boolean;
  lineStart: number;
  lineEnd: number;
  clusterId: string | null;
  metrics: NodeMetrics;
  position3d: Vec3;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  weight: number;
  resolved: boolean;
}

export interface GraphCluster {
  id: string;
  label: string;
  color: string;
  nodeIds: string[];
  centroid3d: Vec3;
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  clusterCount: number;
  fileCount: number;
  byKind: Record<NodeKind, number>;
  byEdge: Record<EdgeKind, number>;
}

export interface GraphSnapshot {
  repoId: string;
  repoName: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  stats: GraphStats;
}

export interface RepoMeta {
  id: string;
  url: string;
  name: string;
  branch: string;
  status: 'pending' | 'fetching' | 'parsing' | 'layouting' | 'ready' | 'error';
  error?: string;
  createdAt: string;
  updatedAt: string;
  nodeCount?: number;
  edgeCount?: number;
}

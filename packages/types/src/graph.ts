export type NodeKind = 'MODULE' | 'CLASS' | 'FUNCTION' | 'METHOD' | 'VARIABLE';

export type EdgeKind = 'IMPORT' | 'CALL' | 'INHERITANCE' | 'DATA_FLOW' | 'EXPORT';

export type Language = 'typescript' | 'javascript';

export interface NodeMetrics {
  linesOfCode: number;
  cyclomaticComplexity: number;
  inDegree: number;
  outDegree: number;
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  filePath: string;
  language: Language;
  exported: boolean;
  lineStart: number;
  lineEnd: number;
  clusterId: string;
  metrics: NodeMetrics;
  position3d: Position3D;
  meta: Record<string, unknown>;
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
  centroid3d: Position3D;
}

export interface GraphStats {
  totalFiles: number;
  parsedFiles: number;
  failedFiles: number;
  generatedAt: number;
}

export interface GraphSnapshot {
  repoId: string;
  repoName: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  stats: GraphStats;
}

export interface StateDelta {
  nodeId: string;
  key: string;
  valueBefore: string;
  valueAfter: string;
}

export interface SignalFrame {
  frameIndex: number;
  timestamp: number;
  activeNodeIds: string[];
  activeEdgeIds: string[];
  stateDeltas: StateDelta[];
}

export interface SignalSimulation {
  simulationId: string;
  seedNodeId: string;
  frames: SignalFrame[];
  totalDuration: number;
}

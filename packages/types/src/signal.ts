export interface StateDelta {
  nodeId: string;
  label: string;
  value?: string;
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

export interface SimulateSignalRequest {
  seedNodeId: string;
  maxHops?: number;
  bidirectional?: boolean;
  frameGapMs?: number;
}

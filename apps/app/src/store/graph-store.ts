import { create } from 'zustand';
import type { GraphSnapshot, EdgeKind } from '@codevisualizer/types';

interface GraphState {
  snapshot: GraphSnapshot | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  searchQuery: string;
  visibleEdgeKinds: Set<EdgeKind>;

  setSnapshot: (s: GraphSnapshot) => void;
  selectNode: (id: string | null) => void;
  hoverNode: (id: string | null) => void;
  setSearch: (q: string) => void;
  toggleEdgeKind: (kind: EdgeKind) => void;

  getFilteredNodeIds: () => Set<string>;
}

const ALL_EDGE_KINDS: EdgeKind[] = ['IMPORT', 'CALL', 'INHERITANCE', 'DATA_FLOW', 'EXPORT'];

export const useGraphStore = create<GraphState>((set, get) => ({
  snapshot: null,
  selectedNodeId: null,
  hoveredNodeId: null,
  searchQuery: '',
  visibleEdgeKinds: new Set(ALL_EDGE_KINDS),

  setSnapshot: (snapshot) => set({ snapshot, selectedNodeId: null }),
  selectNode: (id) => set({ selectedNodeId: id }),
  hoverNode: (id) => set({ hoveredNodeId: id }),
  setSearch: (q) => set({ searchQuery: q }),

  toggleEdgeKind: (kind) => set(s => {
    const next = new Set(s.visibleEdgeKinds);
    if (next.has(kind)) next.delete(kind); else next.add(kind);
    return { visibleEdgeKinds: next };
  }),

  getFilteredNodeIds: () => {
    const { snapshot, searchQuery } = get();
    if (!snapshot) return new Set();
    if (!searchQuery.trim()) return new Set(snapshot.nodes.map(n => n.id));
    const q = searchQuery.toLowerCase();
    return new Set(snapshot.nodes.filter(n => n.name.toLowerCase().includes(q) || n.filePath.toLowerCase().includes(q)).map(n => n.id));
  },
}));

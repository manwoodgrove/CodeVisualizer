import { create } from 'zustand'
import type { GraphSnapshot, EdgeKind } from '@cv/types'

interface GraphState {
  snapshot: GraphSnapshot | null
  selectedNodeId: string | null
  filteredNodeIds: Set<string> | null
  visibleEdgeKinds: Set<EdgeKind>
  setSnapshot: (snapshot: GraphSnapshot | null) => void
  selectNode: (id: string | null) => void
  toggleEdgeKind: (kind: EdgeKind) => void
  setFilter: (ids: Set<string> | null) => void
}

const ALL_EDGE_KINDS: EdgeKind[] = ['IMPORT', 'CALL', 'INHERITANCE', 'DATA_FLOW', 'EXPORT']

export const useGraphStore = create<GraphState>((set) => ({
  snapshot: null,
  selectedNodeId: null,
  filteredNodeIds: null,
  visibleEdgeKinds: new Set<EdgeKind>(ALL_EDGE_KINDS),
  setSnapshot: (snapshot) => set({ snapshot }),
  selectNode: (id) => set({ selectedNodeId: id }),
  toggleEdgeKind: (kind) =>
    set((state) => {
      const next = new Set(state.visibleEdgeKinds)
      if (next.has(kind)) {
        next.delete(kind)
      } else {
        next.add(kind)
      }
      return { visibleEdgeKinds: next }
    }),
  setFilter: (ids) => set({ filteredNodeIds: ids }),
}))

export function useGraph<T>(selector: (state: GraphState) => T): T {
  return useGraphStore(selector)
}

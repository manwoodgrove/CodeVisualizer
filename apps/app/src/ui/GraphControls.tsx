import { useState } from 'react'
import { useGraphStore } from '../store/graphStore.js'
import { useRepoStore } from '../store/repoStore.js'
import { api } from '../api/client.js'
import type { EdgeKind } from '@cv/types'
import { useGraph } from '../store/graphStore.js'

const EDGE_KINDS: EdgeKind[] = ['IMPORT', 'CALL', 'INHERITANCE', 'DATA_FLOW', 'EXPORT']

const EDGE_KIND_LABELS: Record<EdgeKind, string> = {
  IMPORT:      'Import',
  CALL:        'Call',
  INHERITANCE: 'Inheritance',
  DATA_FLOW:   'Data Flow',
  EXPORT:      'Export',
}

export function GraphControls() {
  const activeRepoId = useRepoStore((s) => s.activeRepoId)
  const { visibleEdgeKinds, toggleEdgeKind, setSnapshot, setFilter, snapshot } = useGraphStore()
  const expandedClusters = useGraph((s) => s.expandedClusters)
  const toggleCluster = useGraph((s) => s.toggleCluster)

  const [moduleFilter, setModuleFilter] = useState('')
  const [depth, setDepth] = useState('')
  const [nodeSearch, setNodeSearch] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleModuleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeRepoId) return
    setLoading(true)
    try {
      const opts: { module?: string; depth?: number } = {}
      if (moduleFilter.trim()) opts.module = moduleFilter.trim()
      if (depth.trim()) opts.depth = Number(depth.trim())
      const { snapshot: next } = await api.getGraph(activeRepoId, opts)
      setSnapshot(next)
      setFilter(null)
      setNodeSearch('')
    } finally {
      setLoading(false)
    }
  }

  function handleNodeSearch(value: string) {
    setNodeSearch(value)
    if (!snapshot) return
    if (!value.trim()) {
      setFilter(null)
      return
    }
    const lower = value.toLowerCase()
    const matching = new Set(
      snapshot.nodes
        .filter((n) => n.name.toLowerCase().includes(lower))
        .map((n) => n.id)
    )
    setFilter(matching.size > 0 ? matching : new Set())
  }

  return (
    <div className="panel">
      <div className="panel-title">Graph Controls</div>

      <form className="flex-col" onSubmit={handleModuleSubmit}>
        <input
          type="text"
          aria-label="Module path filter"
          placeholder="Module path filter..."
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
        />
        <div className="flex-row">
          <input
            type="number"
            aria-label="Filter depth"
            placeholder="Depth"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            style={{ width: 70 }}
            min={1}
          />
          <button type="submit" disabled={loading || !activeRepoId} style={{ flex: 1 }}>
            {loading ? 'Loading...' : 'Apply'}
          </button>
        </div>
      </form>

      <div className="panel-title mt-12">Edge Kinds</div>
      <div className="flex-col" style={{ gap: 4 }}>
        {EDGE_KINDS.map((kind) => (
          <label key={kind} className="flex-row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={visibleEdgeKinds.has(kind)}
              onChange={() => toggleEdgeKind(kind)}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              {EDGE_KIND_LABELS[kind]}
            </span>
          </label>
        ))}
      </div>

      <div className="panel-title mt-12">Node Search</div>
      <input
        type="text"
        aria-label="Search nodes by name"
        placeholder="Search nodes by name..."
        value={nodeSearch}
        onChange={(e) => handleNodeSearch(e.target.value)}
      />

      {snapshot && snapshot.clusters.length > 0 && (
        <>
          <div className="panel-title mt-12">Clusters</div>
          <div className="flex-col" style={{ gap: 4 }}>
            {snapshot.clusters.map((cluster) => (
              <label key={cluster.id} className="flex-row" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={expandedClusters.has(cluster.id)}
                  onChange={() => toggleCluster(cluster.id)}
                />
                <span
                  className="edge-item"
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: cluster.color,
                      flexShrink: 0,
                    }}
                  />
                  {cluster.label}
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

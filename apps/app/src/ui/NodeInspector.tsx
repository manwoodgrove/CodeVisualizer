import { useGraph } from '../store/graphStore.js'

export function NodeInspector() {
  const snapshot = useGraph((s) => s.snapshot)
  const selectedNodeId = useGraph((s) => s.selectedNodeId)
  const selectNode = useGraph((s) => s.selectNode)

  const node = snapshot?.nodes.find((n) => n.id === selectedNodeId) ?? null
  const outEdges =
    node && snapshot
      ? snapshot.edges.filter((e) => e.source === node.id && e.kind === 'CALL')
      : []

  return (
    <div className="panel panel--right" style={{ flex: 1 }}>
      <div className="panel-title">Node Inspector</div>

      {!node ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Click a node in the viewport to inspect it.
        </p>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, wordBreak: 'break-all' }}>
              {node.name}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{node.kind}</div>
            <div className="mono mt-8" style={{ color: 'var(--text-muted)', fontSize: 11, wordBreak: 'break-all' }}>
              {node.filePath}:{node.lineStart}-{node.lineEnd}
            </div>
          </div>

          <div className="panel-title" style={{ marginTop: 8 }}>Metrics</div>
          <div style={{ marginBottom: 10 }}>
            <div className="metric-row">
              <span className="metric-label">LOC</span>
              <span className="metric-value">{node.metrics.linesOfCode}</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Cyclomatic Complexity</span>
              <span className="metric-value">{node.metrics.cyclomaticComplexity}</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">In-Degree</span>
              <span className="metric-value">{node.metrics.inDegree}</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Out-Degree</span>
              <span className="metric-value">{node.metrics.outDegree}</span>
            </div>
          </div>

          {outEdges.length > 0 && (
            <>
              <div className="panel-title">Outgoing Calls</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {outEdges.map((edge) => {
                  const target = snapshot?.nodes.find((n) => n.id === edge.target)
                  return (
                    <div
                      key={edge.id}
                      className="edge-item"
                      onClick={() => selectNode(edge.target)}
                      title={target?.name ?? edge.target}
                    >
                      {target?.name ?? edge.target}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

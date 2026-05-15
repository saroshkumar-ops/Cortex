import { useMemo } from 'react'
import { useCortexStore } from '../store/cortex'

export function useGraphData() {
  const { graph, prediction } = useCortexStore()

  const nodes = useMemo(
    () =>
      graph?.nodes?.map((node) => ({
        id: node.id,
        data: {
          label: node.label,
          status: node.status,
          health: node.health,
          metrics: node.metrics,
        },
        position: {
          x: Math.random() * 500,
          y: Math.random() * 400,
        },
        type: 'default',
      })) ?? [],
    [graph?.nodes]
  )

  const edges = useMemo(
    () =>
      graph?.edges?.map((edge) => ({
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        // Animate edges from the service in the cascade path
        animated: prediction?.cascade_path?.includes(edge.source) ?? false,
      })) ?? [],
    [graph?.edges, prediction]
  )

  return { nodes, edges }
}

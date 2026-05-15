import { useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  NodeProps,
  Handle,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import clsx from 'clsx'
import { Network } from 'lucide-react'
import useCortexStore from '../../store/cortex'
import { ServiceStatus } from '../../types'
import EmptyState from '../shared/EmptyState'
import StatusDot from '../shared/StatusDot'

interface ServiceNodeData {
  label: string
  status: ServiceStatus
  failureProb: number
}

interface ServiceGraphProps {
  className?: string
}

const statusColor: Record<ServiceStatus, string> = {
  healthy: '#22c55e',
  degraded: '#eab308',
  critical: '#ef4444',
  unknown: '#9ca3af',
}

function getRiskColor(value: number) {
  if (value >= 0.8) {
    return '#ef4444'
  }
  if (value >= 0.5) {
    return '#f59e0b'
  }
  return '#22c55e'
}

function ServiceNode({ data }: NodeProps<ServiceNodeData>) {
  const ringValue = Math.max(0, Math.min(1, data.failureProb))
  const ringPercent = Math.round(ringValue * 100)
  const ringColor = getRiskColor(ringValue)

  return (
    <div className="relative flex min-w-[150px] flex-col gap-2 rounded-xl border border-haze bg-white/90 px-3 py-2 shadow-sm">
      <div className="absolute -right-2 -top-2 flex h-10 w-10 items-center justify-center rounded-full border border-haze bg-white text-[10px] font-semibold text-slate">
        <div
          className="absolute inset-1 rounded-full"
          style={{
            background: `conic-gradient(${ringColor} ${ringPercent}%, rgba(148, 163, 184, 0.25) ${ringPercent}%)`,
          }}
        />
        <span className="relative">{ringPercent}%</span>
      </div>
      <div className="flex items-center gap-2">
        <StatusDot status={data.status} size="sm" />
        <p className="text-xs font-semibold text-ink">{data.label}</p>
      </div>
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate">
        {data.status}
      </p>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2" />
    </div>
  )
}

export default function ServiceGraph({ className }: ServiceGraphProps) {
  const graph = useCortexStore((state) => state.graph)

  const nodes = useMemo(() => {
    const services = graph?.nodes ?? []
    const count = services.length
    if (count === 0) {
      return [] as Node<ServiceNodeData>[]
    }

    const radius = Math.max(180, count * 20)
    return services.map((service, index) => {
      const angle = (2 * Math.PI * index) / count
      return {
        id: service.id,
        type: 'service',
        data: {
          label: service.name,
          status: service.status,
          failureProb: service.failure_prob,
        },
        position: {
          x: 320 + Math.cos(angle) * radius,
          y: 240 + Math.sin(angle) * radius,
        },
      }
    })
  }, [graph])

  const edges = useMemo(() => {
    return (graph?.edges ?? []).map((edge) => {
      const strokeWidth = Math.max(1, edge.weight * 3)
      return {
        id: `${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
        animated: edge.weight > 0.6,
        style: {
          strokeWidth,
          stroke: '#1f7a8c',
        },
      } as Edge
    })
  }, [graph])

  if (!graph || nodes.length === 0) {
    return (
      <div className={clsx('panel-strong flex h-[520px] items-center justify-center', className)}>
        <EmptyState
          icon={Network}
          title="No live topology yet"
          subtitle="Waiting for the service graph snapshot from Cortex."
        />
      </div>
    )
  }

  return (
    <div className={clsx('panel-strong h-[520px] w-full overflow-hidden', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={{ service: ServiceNode }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap
          nodeColor={(node) =>
            statusColor[(node.data as ServiceNodeData).status] ?? '#9ca3af'
          }
          maskColor="rgba(255,255,255,0.6)"
        />
        <Controls />
        <Background gap={20} color="#e7ecf5" />
      </ReactFlow>
    </div>
  )
}

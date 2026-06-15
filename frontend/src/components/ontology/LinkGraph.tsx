import { useMemo } from 'react'
import {
  ReactFlow, Background, MarkerType, type Edge, type Node,
} from '@xyflow/react'
import type { ObjectType, LinkType } from '@/lib/types'

interface Props {
  objectTypes: ObjectType[]
  linkTypes: LinkType[]
  focusCode?: string
}

export default function LinkGraph({ objectTypes, linkTypes, focusCode }: Props) {
  const nodes = useMemo<Node[]>(() => {
    const cx = 460, cy = 260
    const radius = 220
    const total = objectTypes.length || 1
    return objectTypes.map((ot, i) => {
      const angle = (i / total) * 2 * Math.PI - Math.PI / 2
      return {
        id: ot.code,
        position: { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) },
        data: { label: ot.display_name },
        style: {
          background: focusCode === ot.code ? ot.color : '#ffffff',
          color: focusCode === ot.code ? '#fff' : '#0f172a',
          border: `1px solid ${ot.color}`,
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 500,
          boxShadow: focusCode === ot.code
            ? '0 4px 14px -2px rgba(99,102,241,.35)'
            : '0 1px 2px rgba(0,0,0,.05)',
        },
      }
    })
  }, [objectTypes, focusCode])

  const edges = useMemo<Edge[]>(() => {
    return linkTypes.map((lt) => ({
      id: `e-${lt.code}`,
      source: lt.source_type_code,
      target: lt.target_type_code,
      label: lt.display_name,
      labelStyle: { fontSize: 10, fill: '#475569' },
      labelBgStyle: { fill: '#f8fafc' },
      style: { stroke: '#94a3b8', strokeWidth: 1.4 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
    }))
  }, [linkTypes])

  return (
    <div className="h-[480px] bg-white rounded-xl border border-slate-200 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} color="#e2e8f0" />
      </ReactFlow>
    </div>
  )
}

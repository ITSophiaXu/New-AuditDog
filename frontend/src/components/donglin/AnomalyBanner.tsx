/** 异常摘要横幅 - 展示 Agent 在填稿过程中发现的异常
 *
 *  每条异常带 3 个操作:
 *    ✓ 确认  → 写 Anomaly.data.review_status='已确认' + append 到底稿审计说明
 *    ✗ 驳回  → 写 review_status='已驳回'
 *    📝 注释 → 弹出输入，写到 review_note
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp,
  Check, X, MessageSquare, Loader2,
} from 'lucide-react'
import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { appendAnomalyToNotes } from './AuditNotesPanel'

type Props = {
  paperId: number
  paperIndex: string
  /** 父组件传进来的底稿当前 data —— 用于 append 异常到审计说明 */
  paperData?: any
}

type AnomalyData = {
  paper_id: number
  paper_index: string
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  triggered_by: string
  recommendation: string
  _layer: string
  _source: string
  discovered_at: string
  review_status?: '待审计' | '已确认' | '已驳回'
  review_note?: string
  reviewed_by?: string
  reviewed_at?: string
}

const CURRENT_AUDITOR = '王叙超'

const SEVERITY_META: Record<string, {
  icon: any; bg: string; border: string; text: string; label: string
}> = {
  high:   { icon: AlertTriangle, bg: 'bg-rose-50',   border: 'border-rose-300',
            text: 'text-rose-900',   label: '高' },
  medium: { icon: AlertCircle,   bg: 'bg-amber-50',  border: 'border-amber-300',
            text: 'text-amber-900',  label: '中' },
  low:    { icon: Info,           bg: 'bg-sky-50',    border: 'border-sky-300',
            text: 'text-sky-900',    label: '低' },
}

const STATUS_BADGE: Record<string, { tone: any; label: string }> = {
  '已确认': { tone: 'green', label: '✓ 已确认' },
  '已驳回': { tone: 'neutral', label: '✗ 已驳回' },
  '待审计': { tone: 'amber', label: '待审计' },
}

export default function AnomalyBanner({ paperId, paperIndex, paperData }: Props) {
  const qc = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  const { data: allAnomalies = [] } = useQuery({
    queryKey: ['objects', 'Anomaly'],
    queryFn: () => api.listObjects('Anomaly'),
  })

  const paperAnomalies = allAnomalies.filter(
    (a) => (a.data as AnomalyData)?.paper_id === paperId
  )

  if (paperAnomalies.length === 0) return null

  const sorted = [...paperAnomalies].sort((a, b) => {
    const order: any = { high: 0, medium: 1, low: 2 }
    const aS = (a.data as AnomalyData).severity
    const bS = (b.data as AnomalyData).severity
    return (order[aS] ?? 9) - (order[bS] ?? 9)
  })

  const highCount = sorted.filter((a) => (a.data as AnomalyData).severity === 'high').length
  const medCount  = sorted.filter((a) => (a.data as AnomalyData).severity === 'medium').length
  const lowCount  = sorted.filter((a) => (a.data as AnomalyData).severity === 'low').length
  const reviewed = sorted.filter((a) => {
    const s = (a.data as AnomalyData).review_status
    return s === '已确认' || s === '已驳回'
  }).length

  async function setStatus(
    anomalyId: number,
    d: AnomalyData,
    status: '已确认' | '已驳回',
  ) {
    setBusyId(anomalyId)
    try {
      // 1. PATCH 异常本身
      await api.patchObject(anomalyId, {
        data: {
          ...d,
          review_status: status,
          reviewed_by: CURRENT_AUDITOR,
          reviewed_at: new Date().toISOString(),
        },
      })

      // 2. 若确认 → 把异常 append 到底稿审计说明
      if (status === '已确认' && paperData) {
        const updated = appendAnomalyToNotes(
          paperData.auditor_notes || paperData.audit_conclusion || '',
          {
            title: d.title, detail: d.detail,
            severity: d.severity, triggered_by: d.triggered_by,
          },
          CURRENT_AUDITOR,
        )
        await api.patchObject(paperId, {
          data: { ...paperData, auditor_notes: updated },
        })
        await qc.invalidateQueries({ queryKey: ['object', paperId] })
      }

      await qc.invalidateQueries({ queryKey: ['objects', 'Anomaly'] })
    } finally {
      setBusyId(null)
    }
  }

  async function addNote(anomalyId: number, d: AnomalyData) {
    const note = window.prompt(
      `给"${d.title}"添加审计注释：`,
      d.review_note || '',
    )
    if (note === null) return  // 取消
    setBusyId(anomalyId)
    try {
      await api.patchObject(anomalyId, {
        data: {
          ...d,
          review_note: note,
          reviewed_by: CURRENT_AUDITOR,
          reviewed_at: new Date().toISOString(),
        },
      })
      await qc.invalidateQueries({ queryKey: ['objects', 'Anomaly'] })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className="border-2 border-rose-300 bg-gradient-to-br from-rose-50/80 to-amber-50/60 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-rose-100/30 text-left"
      >
        <div className="h-9 w-9 rounded-full bg-rose-500 text-white grid place-items-center shrink-0">
          <AlertTriangle size={18} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-rose-900 flex items-center gap-2 flex-wrap">
            ⚠ 本表识别 {sorted.length} 处异常 — Agent 填稿过程中发现
            {highCount > 0 && <Badge tone="rose" className="!h-5">{highCount} 高</Badge>}
            {medCount  > 0 && <Badge tone="amber" className="!h-5">{medCount} 中</Badge>}
            {lowCount  > 0 && <Badge tone="sky" className="!h-5">{lowCount} 低</Badge>}
            <Badge tone="neutral" className="!h-5">
              {reviewed}/{sorted.length} 已 review
            </Badge>
          </div>
          <div className="text-xs text-rose-700 mt-0.5">
            {collapsed ? '点击展开查看详情 ↓' : '点击折叠 ↑'}
          </div>
        </div>
        {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-2.5">
          {sorted.map((a) => {
            const d = a.data as AnomalyData
            const meta = SEVERITY_META[d.severity] || SEVERITY_META.medium
            const Icon = meta.icon
            const status = d.review_status || '待审计'
            const statusMeta = STATUS_BADGE[status]
            const isBusy = busyId === a.id
            const reviewed = status === '已确认' || status === '已驳回'
            return (
              <div
                key={a.id}
                className={cn(
                  'rounded-lg border-l-4 p-3 bg-white shadow-sm',
                  meta.bg, meta.border,
                  reviewed && 'opacity-90',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Icon size={16} className={cn('shrink-0 mt-0.5', meta.text)} />
                  <div className="flex-1 min-w-0">
                    <div className={cn('text-sm font-semibold flex items-center gap-2 flex-wrap', meta.text)}>
                      <Badge
                        tone={d.severity === 'high' ? 'rose'
                            : d.severity === 'medium' ? 'amber' : 'sky'}
                        className="!h-5"
                      >
                        {meta.label}
                      </Badge>
                      <span className={cn(status === '已驳回' && 'line-through')}>
                        {d.title}
                      </span>
                      <Badge tone={statusMeta.tone} className="!h-5">{statusMeta.label}</Badge>
                    </div>
                    <div className={cn('text-xs mt-1 leading-relaxed', meta.text, 'opacity-90')}>
                      {d.detail}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                      <span className={cn('font-mono px-1.5 py-0.5 rounded bg-white border', meta.border, meta.text)}>
                        📜 {d.triggered_by}
                      </span>
                      <span className={cn(meta.text, 'opacity-80')}>
                        <strong>建议处理：</strong>{d.recommendation}
                      </span>
                    </div>
                    {d.review_note && (
                      <div className="mt-2 text-[11px] bg-violet-50 border-l-2 border-violet-300 text-violet-800 px-2 py-1 rounded">
                        📝 {d.review_note}
                      </div>
                    )}
                    {d.reviewed_by && reviewed && (
                      <div className="mt-1 text-[10px] text-slate-500">
                        by {d.reviewed_by} · {d.reviewed_at?.slice(0, 16).replace('T', ' ')}
                      </div>
                    )}

                    {/* —— 操作按钮 —— */}
                    <div className="mt-2 flex items-center gap-1.5">
                      {status !== '已确认' && (
                        <button
                          disabled={isBusy}
                          onClick={() => setStatus(a.id, d, '已确认')}
                          className="h-7 px-2.5 text-[11px] rounded border border-emerald-400 bg-white text-emerald-700 hover:bg-emerald-50 inline-flex items-center gap-1 disabled:opacity-50"
                          title="确认 = 这条异常成立，自动追加到本底稿审计说明"
                        >
                          {isBusy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                          确认
                        </button>
                      )}
                      {status !== '已驳回' && (
                        <button
                          disabled={isBusy}
                          onClick={() => setStatus(a.id, d, '已驳回')}
                          className="h-7 px-2.5 text-[11px] rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50"
                          title="驳回 = 经核实不构成异常"
                        >
                          {isBusy ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                          驳回
                        </button>
                      )}
                      <button
                        disabled={isBusy}
                        onClick={() => addNote(a.id, d)}
                        className="h-7 px-2.5 text-[11px] rounded border border-violet-300 bg-white text-violet-700 hover:bg-violet-50 inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <MessageSquare size={11} /> {d.review_note ? '改注释' : '加注释'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

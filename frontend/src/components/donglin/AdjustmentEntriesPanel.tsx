/** 调整分录区 — 底稿表下方
 *
 *  - 预填：AI 根据规则触发提议的调整分录 (来自 /api/donglin/adjustments)
 *  - 每条分录有 状态 (待审计/已采纳/已驳回/已手工调整)
 *  - 审计师可编辑金额、科目、摘要，可增可删
 *  - 保存到 WorkingPaper.data.adjustments
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Calculator, Plus, Trash2, Save, Loader2, Check, X, FileText,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { api } from '@/lib/api'
import { donglinApi } from '@/lib/donglin'
import { cn } from '@/lib/utils'

export type AdjustmentEntry = {
  side: '借' | '贷'
  account_code: string
  account_label: string
  amount: number
  sub?: string
}

export type Adjustment = {
  no: string
  kind: string                   // '重分类' / '更正' / '估计调整' / '披露' 等
  reason: string                 // 说明
  entries: AdjustmentEntry[]     // 借/贷
  total_amount: number
  profit_impact: number
  triggered_by_rule: string | null
  status: '待审计' | '已采纳' | '已驳回' | '已手工调整'
  source: 'AI' | 'Manual'
  sheet?: string
  reviewer?: string
  reviewed_at?: string
  reviewer_note?: string
}

type Props = {
  paperId: number
  paperCode: string
  paperData: any
  /** 可选：按底稿表(sheet)隔离调整分录。传入则每张表各自一份(AI 提议按 a.sheet 过滤)；不传则整稿一份。 */
  sheetCode?: string
  sheetLabel?: string
}

const CURRENT_AUDITOR = '审计师'

const STATUS_TONE: Record<Adjustment['status'], { bg: string; text: string; label: string }> = {
  '待审计':   { bg: 'bg-amber-50 border-amber-200',  text: 'text-amber-800', label: '待审计' },
  '已采纳':   { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', label: '已采纳' },
  '已驳回':   { bg: 'bg-slate-100 border-slate-300', text: 'text-slate-600 line-through',  label: '已驳回' },
  '已手工调整': { bg: 'bg-sky-50 border-sky-200',    text: 'text-sky-800',   label: '已手工调整' },
}

export default function AdjustmentEntriesPanel({ paperId, paperCode, paperData, sheetCode, sheetLabel }: Props) {
  const qc = useQueryClient()
  const perSheet = !!sheetCode

  // —— AI 预提的调整分录（freeform 底稿读 paperData.proposed_adjustments；perSheet 时按 a.sheet 过滤；否则按 paperCode 过滤 endpoint）——
  const { data: allAiAdjs = [] } = useQuery({
    queryKey: ['donglin-adjustments'],
    queryFn: () => donglinApi.listAdjustments(),
  })
  const aiAdjs = useMemo(() => {
    const embedded = paperData?.proposed_adjustments
    if (Array.isArray(embedded) && embedded.length > 0) {
      return perSheet ? embedded.filter((a: any) => a?.sheet === sheetCode) : embedded
    }
    return allAiAdjs.filter((a: any) =>
      typeof a?.no === 'string' && a.no.includes(`-${paperCode}-`),
    )
  }, [allAiAdjs, paperCode, paperData, perSheet, sheetCode])

  // —— 已保存的状态（perSheet → adjustments_by_sheet[sheet]；否则 WorkingPaper.data.adjustments） ——
  const savedAdjs: Adjustment[] = perSheet
    ? (paperData?.adjustments_by_sheet?.[sheetCode!] || [])
    : (paperData?.adjustments || [])

  // —— 合并：AI 提的 + 保存的 manual + 状态覆盖 ——
  const initial = useMemo(() => {
    const merged: Adjustment[] = []
    const byNo = new Map<string, Adjustment>()
    savedAdjs.forEach((a) => byNo.set(a.no, a))
    aiAdjs.forEach((ai: any) => {
      const saved = byNo.get(ai.no)
      merged.push(saved || {
        ...ai,
        status: '待审计',
        source: 'AI',
      } as Adjustment)
      byNo.delete(ai.no)
    })
    // 剩下的就是纯手工添加的
    for (const m of byNo.values()) merged.push(m)
    return merged
  }, [aiAdjs, savedAdjs])

  const [draft, setDraft] = useState<Adjustment[]>(initial)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => { setDraft(initial); setSavedAt(null) }, [paperId, sheetCode, JSON.stringify(initial.map((d) => d.no))])

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  function setStatus(idx: number, status: Adjustment['status']) {
    setDraft((arr) => {
      const next = [...arr]
      next[idx] = {
        ...next[idx], status,
        reviewer: CURRENT_AUDITOR,
        reviewed_at: new Date().toISOString(),
      }
      return next
    })
  }

  function editEntry(adjIdx: number, eIdx: number, patch: Partial<AdjustmentEntry>) {
    setDraft((arr) => {
      const next = [...arr]
      const adj = { ...next[adjIdx] }
      adj.entries = adj.entries.map((e, i) => i === eIdx ? { ...e, ...patch } : e)
      adj.total_amount = adj.entries
        .filter((e) => e.side === '借')
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
      // 若 AI 提议的被编辑过 → 状态改"已手工调整"
      if (adj.source === 'AI' && adj.status === '待审计') adj.status = '已手工调整'
      next[adjIdx] = adj
      return next
    })
  }

  function editReason(idx: number, reason: string) {
    setDraft((arr) => {
      const next = [...arr]
      next[idx] = { ...next[idx], reason }
      return next
    })
  }

  function addManual() {
    const seq = draft.filter((d) => d.source === 'Manual').length + 1
    const sheetTag = sheetCode ? `${sheetCode}-` : ''
    setDraft((arr) => [...arr, {
      no: `Z6-MAN-${paperCode}-${sheetTag}${String(seq).padStart(2, '0')}`,
      kind: '更正',
      reason: '',
      entries: [
        { side: '借', account_code: '', account_label: '', amount: 0 },
        { side: '贷', account_code: '', account_label: '', amount: 0 },
      ],
      total_amount: 0,
      profit_impact: 0,
      triggered_by_rule: null,
      status: '待审计',
      source: 'Manual',
      reviewer: CURRENT_AUDITOR,
      reviewed_at: new Date().toISOString(),
      ...(sheetCode ? { sheet: sheetCode } : {}),
    } as Adjustment])
  }

  function removeManual(idx: number) {
    setDraft((arr) => arr.filter((_, i) => i !== idx))
  }

  async function save() {
    setSaving(true)
    try {
      const nextData = perSheet
        ? {
            ...(paperData || {}),
            adjustments_by_sheet: { ...(paperData?.adjustments_by_sheet || {}), [sheetCode!]: draft },
          }
        : { ...(paperData || {}), adjustments: draft }
      await api.patchObject(paperId, { data: nextData })
      await qc.invalidateQueries({ queryKey: ['object', paperId] })
      setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
    } finally {
      setSaving(false)
    }
  }

  const acceptedCount = draft.filter((d) => d.status === '已采纳' || d.status === '已手工调整').length

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calculator size={16} className="text-violet-600" />
        <div className="text-sm font-semibold text-slate-900">
          调整分录{sheetLabel ? <span className="text-slate-500 font-normal"> · {sheetLabel}</span> : null}
        </div>
        <Badge tone="neutral">
          {draft.length} 条 · {acceptedCount} 已采纳
        </Badge>
        <div className="text-[11px] text-slate-500">
          AI 根据规则触发提议 + 审计师 review，最终汇入 Z6 调整分录汇总
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addManual}>
            <Plus size={12} /> 手工添加
          </Button>
          <Button
            variant={dirty ? 'primary' : 'outline'}
            size="sm"
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? '保存中…' : dirty ? '保存' : '已保存'}
          </Button>
        </div>
      </div>

      {draft.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400 border border-dashed border-slate-200 rounded-md">
          本底稿暂无调整分录。点「+ 手工添加」录入审计师调整。
        </div>
      ) : (
        <div className="space-y-3">
          {draft.map((adj, idx) => {
            const tone = STATUS_TONE[adj.status]
            const isReadOnly = adj.source === 'AI' && adj.status === '待审计'
            return (
              <div
                key={adj.no}
                className={cn('rounded-md border-l-4 p-3', tone.bg)}
              >
                {/* —— 头部：编号 + 来源 + 状态 + 触发规则 —— */}
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="font-mono text-[11px] font-bold text-slate-700">
                    {adj.no}
                  </span>
                  <Badge tone={adj.source === 'AI' ? 'brand' : 'sky'}>
                    {adj.source === 'AI' ? '🤖 AI 提议' : '✍ 手工'}
                  </Badge>
                  <Badge tone="neutral">{adj.kind}</Badge>
                  {adj.triggered_by_rule && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-rose-200 text-rose-700">
                      📜 {adj.triggered_by_rule}
                    </span>
                  )}
                  <span className={cn('text-[10.5px] font-medium px-2 py-0.5 rounded border', tone.text, tone.bg)}>
                    {tone.label}
                  </span>
                  {adj.reviewer && adj.status !== '待审计' && (
                    <span className="text-[10px] text-slate-500">
                      {adj.reviewer} · {adj.reviewed_at?.slice(0, 10)}
                    </span>
                  )}

                  {/* —— 操作按钮 —— */}
                  <div className="ml-auto flex items-center gap-1">
                    {adj.status !== '已采纳' && (
                      <button
                        onClick={() => setStatus(idx, '已采纳')}
                        className="h-7 px-2 text-[11px] rounded border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 inline-flex items-center gap-1"
                      >
                        <Check size={11} /> 采纳
                      </button>
                    )}
                    {adj.status !== '已驳回' && (
                      <button
                        onClick={() => setStatus(idx, '已驳回')}
                        className="h-7 px-2 text-[11px] rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"
                      >
                        <X size={11} /> 驳回
                      </button>
                    )}
                    {adj.source === 'Manual' && (
                      <button
                        onClick={() => removeManual(idx)}
                        className="h-7 px-2 text-[11px] rounded border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>

                {/* —— 说明 —— */}
                <div className="mb-2">
                  <textarea
                    value={adj.reason}
                    onChange={(e) => editReason(idx, e.target.value)}
                    placeholder="调整原因（可编辑）"
                    rows={Math.max(2, Math.min(adj.reason.split('\n').length + 1, 4))}
                    className="w-full text-[12.5px] leading-snug p-2 border border-slate-200 rounded bg-white focus:outline-none focus:border-violet-400 resize-none"
                  />
                </div>

                {/* —— 分录表格 —— */}
                <div className="bg-white border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        <th className="px-2 py-1 text-left w-12">借/贷</th>
                        <th className="px-2 py-1 text-left">科目代码</th>
                        <th className="px-2 py-1 text-left">科目名称</th>
                        <th className="px-2 py-1 text-right">金额</th>
                        <th className="px-2 py-1 text-left">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adj.entries.map((e, ei) => (
                        <tr key={ei} className="border-t border-slate-100">
                          <td className="px-2 py-1">
                            <select
                              value={e.side}
                              onChange={(ev) => editEntry(idx, ei, { side: ev.target.value as '借' | '贷' })}
                              className="bg-transparent text-[11px] font-bold"
                              disabled={isReadOnly}
                            >
                              <option value="借">借</option>
                              <option value="贷">贷</option>
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <input
                              value={e.account_code}
                              onChange={(ev) => editEntry(idx, ei, { account_code: ev.target.value })}
                              className="w-24 bg-transparent font-mono text-[11px] focus:outline-none focus:bg-violet-50/40 rounded px-1"
                              disabled={isReadOnly}
                              placeholder="科目代码"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              value={e.account_label}
                              onChange={(ev) => editEntry(idx, ei, { account_label: ev.target.value })}
                              className="w-full bg-transparent text-[11.5px] focus:outline-none focus:bg-violet-50/40 rounded px-1"
                              disabled={isReadOnly}
                              placeholder="科目名称"
                            />
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            <input
                              type="number"
                              value={e.amount}
                              onChange={(ev) => editEntry(idx, ei, { amount: parseFloat(ev.target.value) || 0 })}
                              className="w-28 bg-transparent text-right font-mono text-[11.5px] focus:outline-none focus:bg-violet-50/40 rounded px-1"
                              disabled={isReadOnly}
                            />
                          </td>
                          <td className="px-2 py-1 text-slate-600">
                            <input
                              value={e.sub || ''}
                              onChange={(ev) => editEntry(idx, ei, { sub: ev.target.value })}
                              className="w-full bg-transparent text-[11px] focus:outline-none focus:bg-violet-50/40 rounded px-1"
                              disabled={isReadOnly}
                              placeholder="—"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-200 text-[11px]">
                        <td colSpan={3} className="px-2 py-1 text-right text-slate-500">
                          合计 (借方):
                        </td>
                        <td className="px-2 py-1 text-right font-mono font-bold text-slate-800 tabular-nums">
                          ¥{(adj.total_amount || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-1 text-[10px] text-slate-400">
                          利润影响：¥{(adj.profit_impact || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[10.5px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <FileText size={10} /> 保存到 WorkingPaper.data.adjustments
        </span>
        <span>
          {savedAt ? `已保存 ${savedAt}` : (savedAdjs.length > 0 ? '上次编辑已保存' : '未保存')}
        </span>
      </div>
    </Card>
  )
}

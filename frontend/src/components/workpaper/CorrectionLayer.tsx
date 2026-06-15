import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Sparkles, AlertTriangle, ArrowRight, CheckCircle2, Lightbulb,
  Layers, Building2, Undo2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { useCorrection } from '@/lib/correction-store'
import { formatMoney, cn } from '@/lib/utils'
import type { CorrectionReasonCode, ProposeDeltaResponse, ScopeOption } from '@/lib/types'

const REASON_OPTIONS: Array<{ code: CorrectionReasonCode; label: string; hint: string }> = [
  { code: 'value_wrong', label: '只是数据错了', hint: '这次的值需要纠正，但取数逻辑没问题。' },
  { code: 'source_wrong', label: '取数来源错了', hint: 'AI 拉了错的科目 / 错的表格，应该从其他地方取。' },
  { code: 'rule_misfire', label: '规则误报', hint: '这条异常不该报，规则应该加例外条件。' },
  { code: 'rule_missed', label: '规则漏报', hint: 'AI 没识别出的异常类型，应该新建一条规则。' },
  { code: 'field_missing', label: '缺字段', hint: '模板里少了这一列，应该补上。' },
  { code: 'other', label: '其他原因', hint: '简单写两句说明即可。' },
]

export default function CorrectionLayer() {
  const modal = useCorrection((s) => s.modal)
  const pendingPromote = useCorrection((s) => s.pendingPromote)
  const recentPromote = useCorrection((s) => s.recentPromote)
  return (
    <>
      {modal && <CorrectionModal />}
      {pendingPromote && <PromoteDialog />}
      {recentPromote && <RollbackToast />}
    </>
  )
}


function CorrectionModal() {
  const modal = useCorrection((s) => s.modal)!
  const closeModal = useCorrection((s) => s.closeModal)
  const setPendingPromote = useCorrection((s) => s.setPendingPromote)
  const qc = useQueryClient()

  const [reason, setReason] = useState<CorrectionReasonCode>('value_wrong')
  const [reasonText, setReasonText] = useState('')
  const [newValue, setNewValue] = useState<any>(modal.newValue ?? modal.oldValue ?? '')

  const save = useMutation({
    mutationFn: async () => {
      const r = await api.recordCorrection({
        paper_id: modal.paperId,
        field_path: modal.fieldPath,
        old_value: modal.oldValue,
        new_value: typeof newValue === 'string' && /^-?\d+(\.\d+)?$/.test(newValue) ? Number(newValue) : newValue,
        reason_code: reason,
        reason_text: reasonText,
        agent_run_id: modal.agentRunId ?? null,
        user: '审计员',
        apply_to_paper: true,
      })
      const proposal = await api.proposeDelta(r.correction_id)
      return { correctionId: r.correction_id, proposal }
    },
    onSuccess: ({ correctionId, proposal }) => {
      qc.invalidateQueries({ queryKey: ['object', modal.paperId] })
      closeModal()
      if (proposal.has_proposal) {
        setPendingPromote({
          correctionId,
          fieldLabel: modal.fieldLabel,
          proposal,
        })
      }
    },
  })

  const isNumeric = typeof modal.oldValue === 'number'

  return (
    <Backdrop onClose={closeModal}>
      <div className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[90vh] overflow-y-auto">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-700 grid place-items-center shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1">
            <div className="text-sm text-slate-500">修正 AI 写入</div>
            <div className="text-base font-semibold text-slate-900">{modal.fieldLabel}</div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">{modal.fieldPath}</div>
          </div>
          <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Old vs New */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="text-[11px] text-slate-500 flex items-center gap-1 mb-1">
                <Sparkles size={11} /> AI 写的值
              </div>
              <div className="text-sm font-medium text-slate-900 break-words">
                {formatValue(modal.oldValue)}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-300 bg-emerald-50/40 p-3">
              <div className="text-[11px] text-emerald-700 flex items-center gap-1 mb-1">
                <CheckCircle2 size={11} /> 你修正后的值
              </div>
              {isNumeric ? (
                <Input
                  type="number" step="0.01" autoFocus
                  value={newValue ?? ''}
                  onChange={(e) => setNewValue(e.target.value ? Number(e.target.value) : null)}
                  className="!h-8 text-sm"
                />
              ) : (
                <Input
                  autoFocus
                  value={newValue ?? ''}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="!h-8 text-sm"
                />
              )}
            </div>
          </div>

          {/* Reason picker */}
          <div>
            <div className="text-xs font-medium text-slate-700 mb-2">为什么不对? (可选, 但越准本体学得越快)</div>
            <div className="space-y-1.5">
              {REASON_OPTIONS.map((opt) => (
                <label
                  key={opt.code}
                  className={cn(
                    'flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                    reason === opt.code
                      ? 'border-brand-400 bg-brand-50/60'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  )}
                >
                  <input
                    type="radio" name="reason"
                    checked={reason === opt.code}
                    onChange={() => setReason(opt.code)}
                    className="mt-1 accent-brand-600"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">{opt.label}</div>
                    <div className="text-[11px] text-slate-500">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Optional notes */}
          <div>
            <div className="text-xs font-medium text-slate-700 mb-1.5">补充说明 (可选)</div>
            <Textarea
              rows={2}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="比如：「应该把 1012 其他货币资金也加上」"
            />
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
          <div className="text-[11px] text-slate-500 flex-1">
            保存后系统会判断是否需要更新本体规则 / 模板, 你可以决定是否推广。
          </div>
          <Button variant="outline" size="sm" onClick={closeModal}>取消</Button>
          <Button
            variant="primary" size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? '保存中…' : '保存修正'}
          </Button>
        </div>
      </div>
    </Backdrop>
  )
}


function PromoteDialog() {
  const pending = useCorrection((s) => s.pendingPromote)!
  const setPendingPromote = useCorrection((s) => s.setPendingPromote)
  const setRecentPromote = useCorrection((s) => s.setRecentPromote)
  const qc = useQueryClient()

  const proposal = pending.proposal as Required<ProposeDeltaResponse>
  const scopes: ScopeOption[] = proposal.scope_options || []
  const [scope, setScope] = useState<'paper' | 'template' | 'firm'>(
    (scopes.find((s) => s.recommended)?.value as any) || 'paper',
  )

  const apply = useMutation({
    mutationFn: () => api.applyOntologyChange({
      correction_id: pending.correctionId,
      kind: proposal.kind!,
      target_kind: proposal.target_kind!,
      target_code: proposal.target_code!,
      scope,
      paper_id: (qc.getQueryData(['object', pending.correctionId]) as any)?.object?.id ?? null,
      delta: proposal.delta || {},
      summary: proposal.summary || '',
      applied_by: '审计员',
    }),
    onSuccess: (res) => {
      qc.invalidateQueries()
      setPendingPromote(null)
      setRecentPromote({
        changeId: res.change_id,
        summary: proposal.summary || pending.fieldLabel,
        scope,
        expiresAt: Date.now() + 30_000,
      })
    },
  })

  return (
    <Backdrop onClose={() => setPendingPromote(null)}>
      <div className="bg-white rounded-xl shadow-2xl w-[640px] max-h-[90vh] overflow-y-auto">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-700 grid place-items-center shrink-0">
            <Lightbulb size={18} />
          </div>
          <div className="flex-1">
            <div className="text-sm text-slate-500">本体升级建议</div>
            <div className="text-base font-semibold text-slate-900">
              基于你刚才的修正, AI 建议:
            </div>
          </div>
          <button onClick={() => setPendingPromote(null)} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 flex gap-3 items-start">
            <Sparkles size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-slate-800">{proposal.summary}</div>
          </div>

          {(proposal.affected_papers || []).length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 text-[11px] text-slate-500 bg-slate-50 border-b border-slate-200">
                影响预览 (推广到本模板后这些底稿会变)
              </div>
              <div className="divide-y divide-slate-100 max-h-32 overflow-y-auto">
                {proposal.affected_papers.map((p) => (
                  <div key={p.id} className="px-3 py-1.5 text-xs flex items-center gap-2">
                    <ArrowRight size={11} className="text-slate-400" />
                    <span className="flex-1 truncate">{p.display_name}</span>
                    <Badge tone="neutral">{p.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-slate-700 mb-2">范围 (默认最窄)</div>
            <div className="space-y-1.5">
              {scopes.map((s) => (
                <label
                  key={s.value}
                  className={cn(
                    'flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                    scope === s.value
                      ? 'border-brand-400 bg-brand-50/60'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  )}
                >
                  <input
                    type="radio" name="scope"
                    checked={scope === s.value}
                    onChange={() => setScope(s.value)}
                    className="mt-1 accent-brand-600"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                      {scopeIcon(s.value)}
                      {s.label}
                      {s.recommended && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">推荐</span>
                      )}
                    </div>
                    {s.warning && (
                      <div className="text-[11px] text-amber-700 mt-0.5">{s.warning}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPendingPromote(null)}>
            稍后再说
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => setPendingPromote(null)}>
            仅保存本次修正
          </Button>
          <Button
            variant="primary" size="sm"
            disabled={apply.isPending}
            onClick={() => apply.mutate()}
          >
            {apply.isPending ? '推广中…' : '确认推广'}
          </Button>
        </div>
      </div>
    </Backdrop>
  )
}


function RollbackToast() {
  const recent = useCorrection((s) => s.recentPromote)!
  const setRecent = useCorrection((s) => s.setRecentPromote)
  const qc = useQueryClient()
  const [remaining, setRemaining] = useState(Math.max(0, recent.expiresAt - Date.now()))

  useEffect(() => {
    const t = setInterval(() => {
      const left = Math.max(0, recent.expiresAt - Date.now())
      setRemaining(left)
      if (left <= 0) {
        setRecent(null)
        clearInterval(t)
      }
    }, 500)
    return () => clearInterval(t)
  }, [recent.expiresAt, setRecent])

  const rollback = useMutation({
    mutationFn: () => api.rollbackChange(recent.changeId),
    onSuccess: () => {
      qc.invalidateQueries()
      setRecent(null)
    },
  })

  return (
    <div className="fixed bottom-5 right-5 z-[100] max-w-sm rounded-xl bg-slate-900 text-white shadow-2xl border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="h-8 w-8 rounded-md bg-emerald-500/20 text-emerald-300 grid place-items-center shrink-0">
          <CheckCircle2 size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">已推广本体升级</div>
          <div className="text-[11px] text-slate-400 mt-0.5 truncate" title={recent.summary}>
            {recent.summary}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            范围: {recent.scope === 'paper' ? '仅此底稿' : recent.scope === 'template' ? '本模板' : '全所'} · 剩余 {Math.ceil(remaining / 1000)}s 可撤销
          </div>
        </div>
        <button
          onClick={() => rollback.mutate()}
          disabled={rollback.isPending}
          className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white"
        >
          <Undo2 size={11} /> {rollback.isPending ? '…' : '撤销'}
        </button>
      </div>
      <div className="h-1 bg-slate-800">
        <div
          className="h-full bg-emerald-400 transition-all"
          style={{ width: `${(remaining / 30_000) * 100}%` }}
        />
      </div>
    </div>
  )
}


function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] bg-slate-900/30 backdrop-blur-sm grid place-items-center px-4"
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}


function formatValue(v: any): string {
  if (v === null || v === undefined || v === '') return '(空)'
  if (typeof v === 'number') return formatMoney(v)
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}


function scopeIcon(value: string) {
  if (value === 'paper') return <ArrowRight size={11} className="text-slate-500" />
  if (value === 'template') return <Layers size={11} className="text-amber-600" />
  return <Building2 size={11} className="text-rose-600" />
}

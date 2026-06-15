import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Inbox, Sparkles, Users, ArrowRight, History, Undo2, CheckCircle2, Layers } from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatMoney, cn } from '@/lib/utils'

const REASON_LABELS: Record<string, string> = {
  value_wrong: '数据本身错',
  source_wrong: '取数源错',
  rule_misfire: '规则误报',
  rule_missed: '规则漏报',
  field_missing: '缺字段',
  other: '其他',
}

export default function LearningInbox() {
  const qc = useQueryClient()
  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['learning-inbox'],
    queryFn: api.learningInbox,
    refetchInterval: 5000,
  })
  const { data: changes = [] } = useQuery({
    queryKey: ['ontology-changes'],
    queryFn: api.listOntologyChanges,
  })

  const recentChanges = useMemo(() => changes.slice(0, 12), [changes])

  const rollback = useMutation({
    mutationFn: (id: number) => api.rollbackChange(id),
    onSuccess: () => qc.invalidateQueries(),
  })

  return (
    <div className="h-full bg-slate-50/40 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-amber-100 text-amber-700 grid place-items-center shrink-0">
            <Inbox size={22} />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-slate-900">未学习的修正</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              多位审计员对同一处做出相同修正时，系统在这里聚合为推广建议。合伙人审批后入本体。
            </p>
          </div>
          <Badge tone="amber" className="!h-7 px-3">本周 {suggestions.length} 项</Badge>
        </div>

        {/* Suggestions */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-amber-600" />
            <h2 className="text-sm font-semibold text-slate-900">建议合并的修正</h2>
            <span className="text-xs text-slate-500">至少 2 位审计员做出相同修正才会出现</span>
          </div>

          {isLoading ? (
            <Card className="p-10 text-center text-sm text-slate-500">加载中…</Card>
          ) : suggestions.length === 0 ? (
            <Card className="p-10 text-center text-sm text-slate-500">
              <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-3" />
              暂无未学习的修正。审计员每次修正后自行选择推广范围, 系统就在这里追踪那些被多人重复修正、值得推广到全所的项。
            </Card>
          ) : (
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-700 grid place-items-center shrink-0">
                      <Layers size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">{s.suggested_action}</span>
                        <Badge tone="rose">{REASON_LABELS[s.reason_code] || s.reason_code}</Badge>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                        <span className="font-mono">{s.template_code}</span>
                        <span>·</span>
                        <span>位置：{s.field_root}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Users size={11} /> {s.auditor_count} 位审计员 · {s.correction_count} 次修正
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {s.auditors.slice(0, 6).map((a) => (
                          <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button variant="primary" size="sm">
                        推广到全所
                      </Button>
                      <Button variant="ghost" size="sm">忽略</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Change log */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <History size={14} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">本体升级日志</h2>
            <span className="text-xs text-slate-500">最近 12 条 · 可回滚</span>
          </div>
          {recentChanges.length === 0 ? (
            <Card className="p-6 text-center text-sm text-slate-500">还没有任何本体升级。</Card>
          ) : (
            <Card>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 text-[11px]">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">时间</th>
                    <th className="text-left px-4 py-2 font-medium">说明</th>
                    <th className="text-left px-4 py-2 font-medium">对象</th>
                    <th className="text-left px-4 py-2 font-medium">范围</th>
                    <th className="text-left px-4 py-2 font-medium">操作人</th>
                    <th className="text-right px-4 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentChanges.map((c) => {
                    const isReverted = !!c.rolled_back_at
                    return (
                      <tr key={c.id} className={cn(isReverted && 'opacity-50')}>
                        <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                          {new Date(c.applied_at).toLocaleString('zh-CN', { hour12: false })}
                        </td>
                        <td className="px-4 py-2 text-slate-800 max-w-[320px] truncate" title={c.summary}>
                          {c.summary || c.kind}
                        </td>
                        <td className="px-4 py-2">
                          <span className="font-mono text-[10px] text-slate-500">{c.target_kind}</span>
                          {' · '}
                          <span className="text-slate-700">{c.target_code}</span>
                        </td>
                        <td className="px-4 py-2">
                          <Badge tone={c.scope === 'firm' ? 'rose' : c.scope === 'template' ? 'amber' : 'neutral'}>
                            {c.scope === 'paper' ? '仅此底稿' : c.scope === 'template' ? '本模板' : '全所'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-slate-700">{c.applied_by}</td>
                        <td className="px-4 py-2 text-right">
                          {isReverted ? (
                            <span className="text-[10px] text-slate-400">已撤销</span>
                          ) : (
                            <button
                              onClick={() => rollback.mutate(c.id)}
                              disabled={rollback.isPending}
                              className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:bg-rose-50 px-2 py-1 rounded"
                            >
                              <Undo2 size={11} /> 撤销
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

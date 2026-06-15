import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  Target, Sparkles, Building2, AlertTriangle, ListChecks,
  Scale, Calendar, FileText, ChevronRight, Plus, Map,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import ChatPanel from '@/components/agent/ChatPanel'
import { cn, formatMoney } from '@/lib/utils'

const PLANNER_AGENT = 'special_audit_designer'

export default function SpecialAuditWorkbench() {
  const { caseId } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()

  const { data: cases = [] } = useQuery({
    queryKey: ['objects', 'SpecialAuditCase'],
    queryFn: () => api.listObjects('SpecialAuditCase'),
  })

  const inFlight = cases.filter((c) => (c.data as any)?.status !== '已完成')
  const history = cases.filter((c) => (c.data as any)?.status === '已完成')

  // Pick the first in-flight case by default
  const activeId = caseId ? Number(caseId) : inFlight[0]?.id ?? cases[0]?.id
  useEffect(() => {
    if (!caseId && activeId) nav(`/special-audit/${activeId}`, { replace: true })
  }, [caseId, activeId, nav])

  const { data: detail } = useQuery({
    queryKey: ['object', activeId],
    queryFn: () => api.getObject(activeId!),
    enabled: !!activeId,
  })
  const c = detail?.object
  const d = (c?.data as any) || {}
  const plan = d.plan_sections || {}
  const hasPlan = !!(plan && Object.keys(plan).length > 0)

  return (
    <div className="h-full flex">
      {/* Cases sidebar */}
      <div className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-4 pt-5 pb-4 border-b border-slate-100">
          <div className="text-xs text-slate-500 mb-1">专项审计 · Special Audit</div>
          <div className="text-lg font-semibold text-slate-900">案例工作台</div>
          <Link to="/special-audit/new" className="block mt-3">
            <Button variant="primary" size="sm" className="w-full"><Plus size={14} /> 新建专项案例</Button>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-2 space-y-3">
          {inFlight.length > 0 && (
            <div>
              <SectionLabel label="进行中" count={inFlight.length} />
              {inFlight.map((cs) => (
                <CaseRow key={cs.id} obj={cs} active={cs.id === activeId} onClick={() => nav(`/special-audit/${cs.id}`)} />
              ))}
            </div>
          )}
          {history.length > 0 && (
            <div>
              <SectionLabel label="历史案例" count={history.length} />
              {history.map((cs) => (
                <CaseRow key={cs.id} obj={cs} active={cs.id === activeId} onClick={() => nav(`/special-audit/${cs.id}`)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center — case + plan */}
      <div className="flex-1 overflow-y-auto bg-slate-50/40">
        {c ? (
          <div className="max-w-4xl mx-auto px-8 py-6 space-y-5">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-rose-600 text-white grid place-items-center shrink-0">
                <Target size={22} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-semibold text-slate-900 truncate">{d.client_name}</h1>
                  <Badge tone="rose">{d.special_type}</Badge>
                  <Badge tone={d.status === '已完成' ? 'green' : 'amber'}>{d.status}</Badge>
                </div>
                <div className="text-sm text-slate-500">
                  <span className="font-mono">{d.case_no}</span> · 期间 {d.period} · 团队 {d.team_size} 人 · 触发 {d.trigger}
                </div>
              </div>
            </div>

            {/* Case context */}
            <Card className="p-5 bg-white">
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                <Building2 size={12} /> 案例背景 / 关注点
              </div>
              <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{d.focus_points}</div>
              {d.grant_amount && (
                <div className="mt-3 pt-3 border-t border-slate-100 text-sm">
                  <span className="text-slate-500">专项资金规模：</span>
                  <span className="font-semibold text-slate-900">{formatMoney(d.grant_amount)}</span>
                </div>
              )}
            </Card>

            {/* AI Plan CTA */}
            {!hasPlan && d.status !== '已完成' && (
              <Card className="p-5 bg-gradient-to-br from-rose-50/60 to-white border-rose-200/60">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-rose-600 text-white grid place-items-center">
                    <Sparkles size={18} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">让 AI 起草本案专项审计方案</div>
                    <div className="text-xs text-slate-500">
                      智能体将检索公共法规库 + 历史同类案例，逐节生成 总体目标 / 重要性 / 抽样 / KAM / 风险 / 程序 / 里程碑。
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => window.dispatchEvent(new CustomEvent('chat:submit', {
                      detail: '请基于案例背景和公共法规库，起草完整的专项审计方案。',
                    }))}
                  >
                    <Sparkles size={14} /> AI 起草方案
                  </Button>
                </div>
              </Card>
            )}

            {/* Plan sections */}
            {hasPlan && (
              <>
                <PlanSection icon={Map} title="总体目标" >
                  <EditableText
                    value={plan.objectives || ''}
                    onSave={(v) => savePlan(c!.id, { objectives: v }, qc)}
                  />
                </PlanSection>

                <PlanSection icon={Scale} title="重要性水平 / 抽样">
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <FactBox label="重要性水平" value={formatMoney(plan.materiality)} />
                      <FactBox label="依据" value={plan.materiality_basis || '—'} />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">抽样方案</div>
                      <EditableText
                        value={plan.sampling || ''}
                        onSave={(v) => savePlan(c!.id, { sampling: v }, qc)}
                      />
                    </div>
                  </div>
                </PlanSection>

                <PlanSection icon={ListChecks} title="关键审计事项 (KAM)" count={(plan.kams || []).length}>
                  <div className="space-y-2">
                    {(plan.kams || []).map((k: any, i: number) => (
                      <div key={i} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge tone="brand" className="font-mono">{k.code}</Badge>
                          <div className="font-medium text-slate-900 text-sm">{k.title}</div>
                        </div>
                        <div className="text-xs text-slate-600 mt-1">{k.description}</div>
                        {k.rule_refs && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {k.rule_refs.map((rr: string) => (
                              <span key={rr} className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-mono">
                                ⚖ {rr}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </PlanSection>

                <PlanSection icon={AlertTriangle} title="关键风险点" count={(plan.risks || []).length}>
                  <div className="space-y-2">
                    {(plan.risks || []).map((r: any, i: number) => (
                      <div key={i} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={14} className={cn(
                            'mt-0.5',
                            r.severity === 'high' ? 'text-rose-500' : r.severity === 'medium' ? 'text-amber-500' : 'text-slate-400',
                          )} />
                          <div className="flex-1">
                            <div className="text-sm text-slate-900 font-medium">{r.risk}</div>
                            <div className="text-xs text-slate-600 mt-1">
                              <span className="text-slate-400">应对：</span>{r.response}
                            </div>
                          </div>
                          <Badge tone={r.severity === 'high' ? 'rose' : r.severity === 'medium' ? 'amber' : 'neutral'}>
                            {r.severity}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </PlanSection>

                <PlanSection icon={FileText} title="审计程序" count={(plan.procedures || []).length}>
                  <Card className="!shadow-none border-slate-200">
                    <div className="grid grid-cols-12 px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100 bg-slate-50/60">
                      <div className="col-span-1">步骤</div>
                      <div className="col-span-4">程序</div>
                      <div className="col-span-2">范围</div>
                      <div className="col-span-2">抽样</div>
                      <div className="col-span-2">预期证据</div>
                      <div className="col-span-1 text-right">工时</div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {(plan.procedures || []).map((p: any, i: number) => (
                        <div key={i} className="grid grid-cols-12 px-4 py-2.5 text-xs items-center">
                          <div className="col-span-1 font-mono text-slate-500">{p.step_no}</div>
                          <div className="col-span-4 text-slate-800">{p.description}</div>
                          <div className="col-span-2 text-slate-600">{p.scope}</div>
                          <div className="col-span-2 text-slate-600">{p.sampling}</div>
                          <div className="col-span-2 text-slate-600">{p.expected_evidence}</div>
                          <div className="col-span-1 text-right text-slate-700 font-medium">{p.hours} h</div>
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-2 text-xs text-slate-500 bg-slate-50/60 border-t border-slate-100 flex items-center">
                      合计程序：{(plan.procedures || []).length} 步
                      <span className="ml-auto">
                        总工时：
                        <span className="font-semibold text-slate-900 ml-1">
                          {(plan.procedures || []).reduce((sum: number, p: any) => sum + (Number(p.hours) || 0), 0)} h
                        </span>
                      </span>
                    </div>
                  </Card>
                </PlanSection>

                <PlanSection icon={Calendar} title="里程碑" count={(plan.milestones || []).length}>
                  <div className="space-y-2">
                    {(plan.milestones || []).map((m: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm">
                        <div className="h-8 w-8 rounded-full bg-rose-100 text-rose-700 grid place-items-center text-xs font-semibold">
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-slate-900">{m.phase}</div>
                          <div className="text-xs text-slate-500">交付物：{m.deliverable}</div>
                        </div>
                        <div className="font-mono text-xs text-slate-500">{m.date}</div>
                      </div>
                    ))}
                  </div>
                </PlanSection>

                {d.status !== '已完成' && (
                  <div className="flex justify-end gap-3 pb-8">
                    <Button variant="outline">导出方案 docx</Button>
                    <Button variant="primary">提交三级复核</Button>
                  </div>
                )}
              </>
            )}

            {hasPlan && d.status === '已完成' && d.conclusion && (
              <Card className="p-5 bg-emerald-50/40 border-emerald-200">
                <div className="text-xs uppercase tracking-wider text-emerald-700 mb-1">最终结论</div>
                <div className="text-sm text-emerald-900">{d.conclusion}</div>
              </Card>
            )}
          </div>
        ) : (
          <div className="h-full grid place-items-center text-slate-500">选择左侧一个案例</div>
        )}
      </div>

      {/* Chat */}
      <div className="w-[420px] shrink-0 border-l border-slate-200 bg-slate-50/30 p-4">
        {c && (
          <ChatPanel
            agentCode={PLANNER_AGENT}
            paperId={c.id}
            suggested="请基于案例背景和公共法规库，起草完整的专项审计方案。"
            placeholder="对方案任意章节提问 / 让 AI 调整某一部分…"
            onAfterRun={() => qc.invalidateQueries()}
            className="h-[calc(100vh-2rem)]"
          />
        )}
      </div>
    </div>
  )
}

async function savePlan(caseId: number, partial: Record<string, any>, qc: any) {
  const current = await api.getObject(caseId)
  const merged = { ...(current.object.data?.plan_sections || {}), ...partial }
  await api.patchObject(caseId, { data: { plan_sections: merged } })
  qc.invalidateQueries({ queryKey: ['object', caseId] })
}

function CaseRow({ obj, active, onClick }: { obj: any; active: boolean; onClick: () => void }) {
  const d = obj.data
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-4 py-2.5 flex items-start gap-2.5 text-left text-sm transition-colors',
        active ? 'bg-rose-50' : 'hover:bg-slate-50',
      )}
    >
      <Target size={13} className={active ? 'text-rose-700 mt-0.5' : 'text-slate-400 mt-0.5'} />
      <div className="flex-1 min-w-0">
        <div className={cn('truncate font-medium', active ? 'text-rose-900' : 'text-slate-800')}>
          {d?.client_name}
        </div>
        <div className="text-[11px] text-slate-500 truncate">
          {d?.special_type}
        </div>
      </div>
      <Badge tone={d?.status === '已完成' ? 'green' : 'amber'}>{d?.status}</Badge>
    </button>
  )
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-4 mb-1 text-[11px] uppercase tracking-wider text-slate-400">
      {label} <span className="ml-1 text-slate-300">{count}</span>
    </div>
  )
}

function PlanSection({
  icon: I, title, count, children,
}: { icon: any; title: string; count?: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <I size={14} className="text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {count != null && <Badge tone="neutral">{count}</Badge>}
      </div>
      {children}
    </div>
  )
}

function FactBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-900 mt-0.5">{value}</div>
    </div>
  )
}

function EditableText({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <Textarea
      value={v}
      rows={Math.min(8, Math.max(3, Math.ceil((v || '').length / 50)))}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
    />
  )
}

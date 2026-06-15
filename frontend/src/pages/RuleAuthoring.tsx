import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Scale, Sparkles, ChevronRight, ChevronDown, ArrowLeft, CheckCircle2,
  AlertTriangle, X, Lightbulb, Wand2, PlayCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import type { CompiledRule, RuleHit } from '@/lib/types'

const SAMPLES = [
  '如果账面余额和银行对账单余额不一致, 标记为异常',
  '调节差超过 500 元要重点关注',
  '本期发生额异常大于上期 30% 提示',
  '外币科目必须有汇率说明',
]

export default function RuleAuthoring() {
  const nav = useNavigate()
  const qc = useQueryClient()

  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium')
  const [templateCode, setTemplateCode] = useState<string>('TPL-CASH-01')

  const [compiled, setCompiled] = useState<CompiledRule | null>(null)
  const [hits, setHits] = useState<RuleHit[]>([])
  const [scanned, setScanned] = useState(0)
  const [falsePositives, setFalsePositives] = useState<RuleHit[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [savedOk, setSavedOk] = useState<{ code: string; triggered: number } | null>(null)

  const { data: templates = [] } = useQuery({
    queryKey: ['objects', 'PaperTemplate'],
    queryFn: () => api.listObjects('PaperTemplate'),
  })

  const compile = useMutation({
    mutationFn: () => api.compileRule({
      description,
      severity,
      scope_template_code: templateCode || null,
    }),
    onSuccess: (r) => {
      setCompiled(r.compiled)
      setHits(r.hits)
      setScanned(r.scanned_papers)
      setFalsePositives([])
    },
  })

  const refine = useMutation({
    mutationFn: () => api.refineRule({
      description,
      compiled: compiled!,
      false_positives: falsePositives,
    }),
    onSuccess: (r) => {
      setCompiled(r.compiled)
      setHits(r.hits)
      setScanned(r.scanned_papers)
      setFalsePositives([])
    },
  })

  const save = useMutation({
    mutationFn: () => api.saveRule({
      compiled: compiled!,
      scope_template_code: templateCode || null,
      run_on_existing: true,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries()
      setSavedOk({ code: r.rule_code, triggered: r.triggered.length })
    },
  })

  if (savedOk) {
    return (
      <div className="h-full bg-slate-50/40 grid place-items-center">
        <Card className="p-10 max-w-md text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
          <div className="text-lg font-semibold text-slate-900">规则已启用</div>
          <div className="text-sm text-slate-500 mt-1">
            「{compiled?.name}」<span className="font-mono text-[11px]">{savedOk.code}</span> 已加入审计规则库。
            {savedOk.triggered > 0 && ` 立即在 ${savedOk.triggered} 张已有底稿上触发了异常。`}
          </div>
          <div className="mt-5 flex gap-2 justify-center">
            <Button variant="outline" onClick={() => {
              setSavedOk(null); setCompiled(null); setDescription('')
            }}>再写一条规则</Button>
            <Button variant="primary" onClick={() => nav('/workbench')}>
              去工作台查看 <ChevronRight size={14} />
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full bg-slate-50/40 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-6 space-y-5">
        <button onClick={() => nav(-1)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft size={12} /> 返回
        </button>

        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-rose-100 text-rose-700 grid place-items-center shrink-0">
            <Scale size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">用中文写一条审计规则</h1>
            <p className="text-sm text-slate-500 mt-1">
              直接描述, AI 自动转成可执行规则, 立刻在真实底稿上回放看效果, 错了点"不是异常"系统自己改。
            </p>
          </div>
        </div>

        {/* Step 1: input */}
        <Card>
          <div className="px-5 py-3 border-b border-slate-100 flex items-center">
            <span className="text-[10px] font-mono text-slate-400 mr-2">1</span>
            <div className="text-sm font-semibold text-slate-900">用中文描述</div>
          </div>
          <div className="p-5 space-y-3">
            <Textarea
              rows={3}
              placeholder="比如：如果账面余额和银行对账单余额不一致, 标记为异常"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] text-slate-500">试试这些写法:</span>
              {SAMPLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setDescription(s)}
                  className="text-[11px] text-brand-700 hover:underline"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <div className="text-[11px] text-slate-500 mb-1">适用范围</div>
                <select
                  value={templateCode}
                  onChange={(e) => setTemplateCode(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-md"
                >
                  <option value="">所有底稿</option>
                  {templates.map((t) => (
                    <option key={t.id} value={(t.data as any)?.code}>
                      {t.display_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 mb-1">严重程度</div>
                <div className="flex gap-2">
                  {[
                    { v: 'low', label: '提示', tone: 'neutral' as const },
                    { v: 'medium', label: '警告', tone: 'amber' as const },
                    { v: 'high', label: '严重', tone: 'rose' as const },
                  ].map((s) => (
                    <button
                      key={s.v}
                      onClick={() => setSeverity(s.v as any)}
                      className={cn(
                        'flex-1 px-3 py-1.5 rounded-md border text-xs',
                        severity === s.v
                          ? s.v === 'high' ? 'border-rose-400 bg-rose-50 text-rose-800'
                            : s.v === 'medium' ? 'border-amber-400 bg-amber-50 text-amber-800'
                            : 'border-slate-400 bg-slate-100 text-slate-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                variant="primary"
                onClick={() => compile.mutate()}
                disabled={!description.trim() || compile.isPending}
              >
                {compile.isPending ? '编译中…' : <><PlayCircle size={14} /> 试试看</>}
              </Button>
            </div>
          </div>
        </Card>

        {/* Step 2: AI interpretation */}
        {compiled && (
          <Card>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center">
              <span className="text-[10px] font-mono text-slate-400 mr-2">2</span>
              <div className="text-sm font-semibold text-slate-900">AI 这样理解你的规则</div>
              {compiled.refined_from !== undefined && (
                <Badge tone="amber" className="ml-2"><Wand2 size={10} /> 已根据反例细化</Badge>
              )}
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 flex gap-3 items-start">
                <Lightbulb size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 text-sm text-slate-800 whitespace-pre-line">
                  {compiled.interpretation}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
                >
                  {showAdvanced ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  高级 · 查看 AI 生成的规则表达式
                </button>
                <div className="text-[11px] text-slate-500">
                  名称: <span className="text-slate-800 font-medium">{compiled.name}</span> · 类别: {compiled.category}
                </div>
              </div>
              {showAdvanced && (
                <pre className="text-[10px] bg-slate-900 text-slate-200 p-3 rounded font-mono overflow-x-auto">
{JSON.stringify(compiled, null, 2)}
                </pre>
              )}
            </div>
          </Card>
        )}

        {/* Step 3: data preview */}
        {compiled && (
          <Card>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center">
              <span className="text-[10px] font-mono text-slate-400 mr-2">3</span>
              <div className="text-sm font-semibold text-slate-900">在过去的真实数据上跑一遍</div>
              <Badge tone="neutral" className="ml-2">扫描 {scanned} 张</Badge>
              <Badge tone={hits.length > 0 ? 'rose' : 'green'} className="ml-1">
                {hits.length > 0 ? `命中 ${hits.length}` : '未命中'}
              </Badge>
            </div>
            <div className="p-5 space-y-3">
              {hits.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-6">
                  <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-2" />
                  这条规则在现有数据上没有命中任何异常 — 也可以保存, 用于未来的底稿。
                </div>
              ) : (
                <div className="space-y-1.5">
                  {hits.map((h, i) => {
                    const flagged = falsePositives.some((fp) => fp.paper_id === h.paper_id && fp.explanation === h.explanation)
                    return (
                      <div
                        key={i}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-xs flex items-start gap-2.5',
                          flagged
                            ? 'border-slate-200 bg-slate-50 opacity-60'
                            : 'border-amber-200 bg-amber-50/40',
                        )}
                      >
                        <AlertTriangle size={12} className="text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900">{h.paper_name}</div>
                          <div className="text-slate-600 mt-0.5">{h.explanation}</div>
                        </div>
                        {flagged ? (
                          <button
                            onClick={() => setFalsePositives(falsePositives.filter((fp) => !(fp.paper_id === h.paper_id && fp.explanation === h.explanation)))}
                            className="text-[10px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
                          >
                            撤销
                          </button>
                        ) : (
                          <button
                            onClick={() => setFalsePositives([...falsePositives, h])}
                            className="text-[10px] text-rose-700 hover:bg-rose-100 px-2 py-0.5 rounded inline-flex items-center gap-1"
                          >
                            <X size={10} /> 这不是异常
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {falsePositives.length > 0 && (
                <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3 flex items-center gap-3">
                  <Sparkles size={14} className="text-brand-600" />
                  <div className="flex-1 text-xs">
                    你标记了 {falsePositives.length} 条不是真的异常 — AI 可以根据这些反例改进规则。
                  </div>
                  <Button variant="primary" size="sm" onClick={() => refine.mutate()} disabled={refine.isPending}>
                    {refine.isPending ? '改进中…' : '让 AI 改进规则'}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Step 4: save */}
        {compiled && (
          <Card>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center">
              <span className="text-[10px] font-mono text-slate-400 mr-2">4</span>
              <div className="text-sm font-semibold text-slate-900">启用规则</div>
            </div>
            <div className="p-5 flex items-center gap-3">
              <div className="flex-1 text-xs text-slate-600">
                启用后, 新建的底稿会自动应用; 现有 {scanned} 张底稿也会立即重新跑一遍。
              </div>
              <Button variant="ghost" onClick={() => { setCompiled(null); setHits([]) }}>取消</Button>
              <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? '保存中…' : '启用并立即扫描'}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

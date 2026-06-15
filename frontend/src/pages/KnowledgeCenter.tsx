import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  LayoutTemplate, Scale, Library, Building2, BookMarked, Database,
  Search, Filter, ChevronRight, Upload, Sparkles, Plus,
  FileSpreadsheet, FileText, Plug, Target, Network, ArrowRight, Package,
  Calculator, BookOpen,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Icon } from '@/components/ui/Icon'
import { ProvenancePill } from '@/components/knowledge/ProvenancePill'
import type { Provenance } from '@/lib/types'
import { cn, formatMoney } from '@/lib/utils'

const TABS = [
  { value: 'templates', label: '底稿模板', icon: LayoutTemplate, hint: '可重用的底稿与方案模板' },
  { value: 'rules', label: '审计规则', icon: Scale, hint: '本所采用的规则集（含引用的准则）' },
  { value: 'methods', label: '审计方法/算法', icon: Calculator, hint: 'FIFO 账龄 / 直线折旧 / 重要性梯度 等可 review 的算法' },
  { value: 'public', label: '公共法规库', icon: Library, hint: '中注协 CSA / 财政部 CAS / 法律条款' },
  { value: 'clients', label: '客户档案', icon: Building2, hint: '被审单位与项目档案' },
  { value: 'cases', label: '案例库', icon: BookMarked, hint: '历史专项案例与整改记录' },
  { value: 'data', label: '数据源', icon: Database, hint: 'TB / 凭证 / MCP 等外部接入' },
  { value: 'advanced', label: '高级 · 本体', icon: Network, hint: '面向技术管理员的本体模型视图' },
]

export default function KnowledgeCenter() {
  const [tab, setTab] = useState('templates')

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-8 py-7 space-y-6">
        <header className="flex items-end justify-between">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-widest">Knowledge Center</div>
            <h1 className="text-2xl font-semibold text-slate-900 mt-1">审计知识库</h1>
            <p className="text-sm text-slate-500 mt-1">
              事务所多年沉淀的底稿、规则、案例、客户档案、数据接入，在这里集中管理。
              <span className="text-slate-400">不要 IT 背景也能用。</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/knowledge/intake">
              <Button variant="primary">
                <Upload size={14} /> 知识接入向导
              </Button>
            </Link>
          </div>
        </header>

        <Tabs defaultValue="templates" value={tab} onValueChange={setTab}>
          <TabsList className="!bg-white border border-slate-200 !p-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                <span className="flex items-center gap-1.5">
                  <t.icon size={13} />
                  {t.label}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-2 text-xs text-slate-400">
            {TABS.find((t) => t.value === tab)?.hint}
          </div>

          <TabsContent value="templates" className="mt-5"><TemplatesTab /></TabsContent>
          <TabsContent value="rules" className="mt-5"><RulesTab onlySource={null} /></TabsContent>
          <TabsContent value="methods" className="mt-5"><MethodsTab /></TabsContent>
          <TabsContent value="public" className="mt-5"><PublicLibraryTab /></TabsContent>
          <TabsContent value="clients" className="mt-5"><ClientsTab /></TabsContent>
          <TabsContent value="cases" className="mt-5"><CasesTab /></TabsContent>
          <TabsContent value="data" className="mt-5"><DataSourcesTab /></TabsContent>
          <TabsContent value="advanced" className="mt-5"><AdvancedTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// ---------- Templates ----------

function TemplatesTab() {
  const { data: templates = [] } = useQuery({
    queryKey: ['objects', 'PaperTemplate'],
    queryFn: () => api.listObjects('PaperTemplate'),
  })
  const { data: rules = [] } = useQuery({
    queryKey: ['objects', 'AuditRule'],
    queryFn: () => api.listObjects('AuditRule'),
  })

  return (
    <div className="space-y-4">
      <BundleSummary items={templates} kind="template" />

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">{templates.length} 份模板</div>
        <div className="flex items-center gap-2">
          <Link to="/knowledge/intake?type=PaperTemplate">
            <Button size="sm" variant="outline">
              <FileText size={14} /> 粘贴文本创建
            </Button>
          </Link>
          <Link to="/templates/upload">
            <Button size="sm" variant="primary">
              <Upload size={14} /> 上传 Excel 创建模板
            </Button>
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {templates.map((t) => {
          const fields = (t.data?.fields as any[]) || []
          const ruleCodes = (t.data?.default_rules as string[]) || []
          const scenario = t.data?.scenario as string
          const prov = (t.data as any)?.provenance as Provenance | undefined
          return (
            <Card key={t.id} className="p-5 hover:border-brand-200 hover:shadow-md transition-all">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-pink-50 text-pink-700 grid place-items-center shrink-0">
                  <LayoutTemplate size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{t.display_name}</div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">{t.data?.code}</div>
                </div>
                <Badge tone={scenario === '专项审计' ? 'rose' : 'brand'}>{scenario || '—'}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 rounded-md p-2">
                  <div className="text-slate-500">字段数</div>
                  <div className="text-slate-900 font-semibold text-sm">{fields.length}</div>
                </div>
                <div className="bg-slate-50 rounded-md p-2">
                  <div className="text-slate-500">绑定规则</div>
                  <div className="text-slate-900 font-semibold text-sm">{ruleCodes.length}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {fields.slice(0, 4).map((f: any) => (
                  <span key={f.code} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    {f.label}
                  </span>
                ))}
                {fields.length > 4 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                    +{fields.length - 4}
                  </span>
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <ProvenancePill p={prov} showIssuer />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="text-[11px] text-slate-500 flex-1">
                  关联 {ruleCodes.filter((rc) => rules.some((r) => r.data?.code === rc)).length} 条规则
                </div>
                {scenario === '底稿填写' && (
                  <Link to="/workbench" className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
                    用于底稿 <ChevronRight size={12} />
                  </Link>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Rules ----------

function RulesTab({
  onlySource, subscribeMode = false,
}: { onlySource: string | null; subscribeMode?: boolean }) {
  const { data: rules = [] } = useQuery({
    queryKey: ['objects', 'AuditRule'],
    queryFn: () => api.listObjects('AuditRule'),
  })
  const [category, setCategory] = useState<string>('全部')
  const [q, setQ] = useState('')

  const filtered = rules.filter((r) => {
    const d = r.data as any
    const p = d?.provenance as Provenance | undefined
    // onlySource filter routes to provenance.origin = 'public' for the public tab
    if (onlySource === '公共' && p?.origin !== 'public') return false
    if (category !== '全部' && d?.category !== category) return false
    if (q && !`${d?.code} ${d?.name}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  const scopedRules = rules.filter((r) => {
    const p = (r.data as any)?.provenance as Provenance | undefined
    return onlySource === '公共' ? p?.origin === 'public' : true
  })

  const categories = Array.from(new Set(scopedRules
    .map((r) => (r.data as any)?.category as string))).filter(Boolean)

  return (
    <div className="space-y-4">
      <BundleSummary items={scopedRules} kind="rule" />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="按编号或名称搜索"
            className="w-full h-9 pl-8 pr-3 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:border-brand-500"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter size={13} className="text-slate-400" />
          {['全部', ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'h-7 px-2.5 text-xs rounded-full border transition-colors',
                category === c
                  ? 'border-brand-400 bg-brand-50 text-brand-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500 ml-auto">{filtered.length} / {scopedRules.length}</div>
        {!subscribeMode && (
          <Link to="/rules/new">
            <Button size="sm" variant="primary">
              <Scale size={14} /> 写一条规则
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <div className="grid grid-cols-12 px-5 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100 bg-slate-50/60">
          <div className="col-span-2">编号</div>
          <div className="col-span-4">规则名称</div>
          <div className="col-span-1">类别</div>
          <div className="col-span-1">严重度</div>
          <div className="col-span-3">引用的准则 / 法律</div>
          <div className="col-span-1 text-right">操作</div>
        </div>
        <div className="divide-y divide-slate-100">
          {filtered.map((r) => {
            const d = r.data as any
            const sev = d?.severity
            const prov = d?.provenance as Provenance | undefined
            const refs: string[] = (d?.references_standards as string[]) || []
            return (
              <div key={r.id} className="grid grid-cols-12 px-5 py-3 text-sm items-center">
                <div className="col-span-2 font-mono text-slate-700 text-xs">{d?.code}</div>
                <div className="col-span-4">
                  <div className="font-medium text-slate-900">{d?.name}</div>
                  <div className="text-xs text-slate-500 truncate">{d?.expression}</div>
                </div>
                <div className="col-span-1 text-slate-700 text-xs">{d?.category}</div>
                <div className="col-span-1">
                  <Badge tone={sev === 'high' ? 'rose' : sev === 'medium' ? 'amber' : 'neutral'}>
                    {sev || '—'}
                  </Badge>
                </div>
                <div className="col-span-3">
                  {refs.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {refs.map((c) => (
                        <span key={c}
                          title={`引用准则 ${c}`}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                          📐 {c}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <ProvenancePill p={prov} showIssuer />
                  )}
                </div>
                <div className="col-span-1 text-right">
                  {subscribeMode ? (
                    <SubscribeButton ruleId={r.id} subscribed={!!d?.subscribed_by_firm} />
                  ) : (
                    <span className="text-[10px] text-slate-400">{prov?.effective_from || '—'}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ---------- Bundle summary panel ----------

function BundleSummary({ items, kind }: { items: any[]; kind: 'rule' | 'template' | 'case' }) {
  const { data: catalog = [] } = useQuery({ queryKey: ['bundles'], queryFn: api.listBundles })
  // Group items by their provenance.bundle, count, sample provenance
  const groups: Record<string, { count: number; sample: Provenance | undefined; meta?: any }> = {}
  for (const i of items) {
    const p = (i.data as any)?.provenance as Provenance | undefined
    const key = p?.bundle || '(未标注)'
    if (!groups[key]) groups[key] = { count: 0, sample: p, meta: catalog.find((c) => c.id === key) }
    groups[key].count += 1
  }
  const entries = Object.entries(groups)
  if (entries.length === 0) return null
  return (
    <Card className="p-4 bg-gradient-to-br from-slate-50/80 to-white border-slate-200/80">
      <div className="flex items-center gap-2 mb-3">
        <Package size={14} className="text-slate-500" />
        <span className="text-sm font-semibold text-slate-800">已订阅知识包</span>
        <Badge tone="neutral">{entries.length}</Badge>
        <span className="ml-auto text-[11px] text-slate-500">
          每个 {kind === 'rule' ? '规则' : kind === 'template' ? '模板' : '案例'} 都标注了出处，便于审计与回溯
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {entries.map(([bundle, info]) => (
          <div key={bundle} className="px-3 py-2.5 rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-2">
              <ProvenancePill p={info.sample} compact showBundle={false} showVersion={false} />
              <span className="text-[11px] font-semibold text-slate-700">{info.count}</span>
              <span className="text-[10px] text-slate-400">条</span>
            </div>
            <div className="text-[11px] font-mono text-slate-700 mt-1 truncate">{bundle}</div>
            <div className="text-[10px] text-slate-500 mt-0.5 truncate">
              {info.meta?.name || info.sample?.issuer || '—'}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function SubscribeButton({ ruleId, subscribed }: { ruleId: number; subscribed: boolean }) {
  const [done, setDone] = useState(subscribed)
  return (
    <button
      onClick={async () => {
        await api.patchObject(ruleId, { data: { subscribed_by_firm: true } })
        setDone(true)
      }}
      disabled={done}
      className={cn(
        'text-xs px-2.5 h-7 rounded-md border transition-colors',
        done
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default'
          : 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700',
      )}
    >
      {done ? '已订阅' : '订阅到本所'}
    </button>
  )
}

// ---------- Audit Methods (algorithms) ----------

function MethodsTab() {
  const { data: methods = [] } = useQuery({
    queryKey: ['objects', 'AuditMethod'],
    queryFn: () => api.listObjects('AuditMethod'),
  })
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<string>('全部')

  const categories = Array.from(new Set(methods
    .map((m) => (m.data as any)?.category as string))).filter(Boolean)

  const filtered = methods.filter((m) => {
    const d = m.data as any
    if (category !== '全部' && d?.category !== category) return false
    if (q && !`${d?.code} ${d?.name} ${d?.algorithm_description}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div className="bg-violet-50/40 border border-violet-200 rounded-md p-3 text-xs text-violet-800 leading-relaxed">
        把原本散在 Python 代码里的算法（FIFO 账龄、直线折旧、重要性梯度等）抽出来建模成可 review 的本体实例，
        让审计师能看到「为什么选 FIFO 不选 LIFO」「无凭证客户怎么降级」「事务所的具体阈值」等关键决策。
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="按算法名 / 描述搜索"
            className="w-full h-9 pl-8 pr-3 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:border-brand-500"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Filter size={13} className="text-slate-400" />
          {['全部', ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'h-7 px-2.5 text-xs rounded-full border transition-colors',
                category === c
                  ? 'border-brand-400 bg-brand-50 text-brand-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500 ml-auto">{filtered.length} / {methods.length}</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {filtered.map((m) => {
          const d = m.data as any
          const refs: string[] = (d?.references_standards as string[]) || []
          const sev = d?.review_severity as string | undefined
          const sevTone: 'rose' | 'amber' | 'neutral' =
            sev?.startsWith('关键') ? 'rose' :
            sev?.startsWith('重要') ? 'amber' : 'neutral'
          return (
            <Card key={m.id} className="p-5">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-violet-50 text-violet-700 grid place-items-center shrink-0">
                  <Calculator size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono text-violet-700">{d?.code}</div>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5">{d?.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge tone="brand">{d?.category}</Badge>
                    {sev && <Badge tone={sevTone}>{sev}</Badge>}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-700 leading-relaxed line-clamp-3">
                {d?.algorithm_description}
              </div>

              {d?.formal_logic && (
                <details className="mt-2.5">
                  <summary className="text-[11px] text-violet-700 cursor-pointer hover:underline">
                    展开形式化逻辑（伪代码）
                  </summary>
                  <pre className="mt-1.5 text-[10.5px] bg-slate-900 text-emerald-300 p-2.5 rounded overflow-x-auto whitespace-pre-wrap leading-snug">{d.formal_logic}</pre>
                </details>
              )}

              <div className="mt-3 grid grid-cols-1 gap-1 text-[11px] text-slate-600">
                {d?.applicability && (
                  <div><span className="text-slate-400">适用：</span>{d.applicability}</div>
                )}
                {d?.fallback_method && (
                  <div><span className="text-slate-400">降级：</span>{d.fallback_method}</div>
                )}
                {d?.firm_choice_rationale && (
                  <div><span className="text-slate-400">选型理由：</span>{d.firm_choice_rationale}</div>
                )}
              </div>

              {refs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1">
                  {refs.map((c) => (
                    <span key={c}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                      📐 {c}
                    </span>
                  ))}
                </div>
              )}

              {d?.review_status && (
                <div className="mt-2 text-[10.5px] text-amber-700 bg-amber-50/60 border border-amber-200 rounded px-2 py-1">
                  <strong>Review 状态：</strong>{d.review_status}
                </div>
              )}

              {d?.source_code_ref && (
                <div className="mt-2 text-[10px] font-mono text-slate-400">
                  源码：{d.source_code_ref}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Public Library (Standards + Laws) ----------

function PublicLibraryTab() {
  const { data: standards = [] } = useQuery({
    queryKey: ['objects', 'AccountingStandard'],
    queryFn: () => api.listObjects('AccountingStandard'),
  })
  const { data: laws = [] } = useQuery({
    queryKey: ['objects', 'LawArticle'],
    queryFn: () => api.listObjects('LawArticle'),
  })

  const csa = standards.filter((s) => (s.data as any)?.category === '审计准则')
  const cas = standards.filter((s) => (s.data as any)?.category === '会计准则')

  const Section = ({ title, items, tone, icon: I }: {
    title: string
    items: any[]
    tone: 'teal' | 'sky' | 'rose'
    icon: any
  }) => {
    const toneMap = {
      teal: 'bg-teal-50 text-teal-800 border-teal-200',
      sky: 'bg-sky-50 text-sky-800 border-sky-200',
      rose: 'bg-rose-50 text-rose-800 border-rose-200',
    }
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <I size={16} className="text-slate-500" />
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <Badge tone="neutral">{items.length}</Badge>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {items.map((it) => {
            const d = it.data as any
            return (
              <div key={it.id} className={cn(
                'rounded-md border p-3', toneMap[tone],
              )}>
                <div className="text-[11px] font-mono font-bold">{d?.code}</div>
                <div className="text-[12.5px] font-medium mt-0.5">{d?.name}</div>
                <div className="text-[10px] opacity-70 mt-1.5">
                  {d?.issuer} · {d?.effective}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-700">
        本所订阅的公共法规库。共 <strong>{standards.length + laws.length}</strong> 条：
        <span className="text-teal-700"> {csa.length} 条中注协审计准则</span> +
        <span className="text-sky-700"> {cas.length} 条财政部会计准则</span> +
        <span className="text-rose-700"> {laws.length} 条法律法规</span>。
        审计规则通过 <code className="px-1 bg-white border rounded">references_standards</code> 字段引用这些条款。
      </div>

      {csa.length > 0 && <Section title="中注协 CSA 审计准则" items={csa} tone="teal" icon={Scale} />}
      {cas.length > 0 && <Section title="财政部 CAS 会计准则" items={cas} tone="sky" icon={BookOpen} />}
      {laws.length > 0 && <Section title="法律法规条款" items={laws} tone="rose" icon={Library} />}
    </div>
  )
}

// ---------- Clients ----------

function ClientsTab() {
  const { data: clients = [] } = useQuery({
    queryKey: ['objects', 'Client'],
    queryFn: () => api.listObjects('Client'),
  })
  const { data: engagements = [] } = useQuery({
    queryKey: ['objects', 'Engagement'],
    queryFn: () => api.listObjects('Engagement'),
  })

  return (
    <div className="grid grid-cols-2 gap-4">
      {clients.map((c) => {
        const engs = engagements.filter((e) => (e.data as any)?.client_name === (c.data as any)?.name)
        return (
          <Card key={c.id} className="p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-sky-50 text-sky-700 grid place-items-center">
                <Building2 size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900">{c.display_name}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {(c.data as any)?.industry} · {(c.data as any)?.scale} · {(c.data as any)?.fiscal_year} 年度
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="text-[11px] text-slate-500 mb-2">进行中的审计项目（{engs.length}）</div>
              {engs.length === 0 ? (
                <div className="text-xs text-slate-400">暂无</div>
              ) : engs.map((e) => (
                <div key={e.id} className="text-sm flex items-center gap-2 py-1">
                  <span className="font-mono text-xs text-slate-500">{(e.data as any)?.code}</span>
                  <span className="text-slate-700 flex-1 truncate">{(e.data as any)?.period}</span>
                  <Badge tone="amber">{(e.data as any)?.status}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )
      })}
      <Card className="p-5 border-dashed bg-slate-50/40 flex items-center justify-center min-h-32">
        <Button variant="outline" disabled>
          <Plus size={14} /> 新建客户档案（即将上线）
        </Button>
      </Card>
    </div>
  )
}

// ---------- Cases ----------

function CasesTab() {
  const { data: cases = [] } = useQuery({
    queryKey: ['objects', 'SpecialAuditCase'],
    queryFn: () => api.listObjects('SpecialAuditCase'),
  })

  const completed = cases.filter((c) => (c.data as any)?.status === '已完成')
  const inFlight = cases.filter((c) => (c.data as any)?.status !== '已完成')

  return (
    <div className="space-y-6">
      <BundleSummary items={cases} kind="case" />

      <Card className="p-5 bg-gradient-to-br from-rose-50/60 to-white border-rose-200/60">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-rose-600 text-white grid place-items-center">
            <Target size={18} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-900">发起一个新的专项案例</div>
            <div className="text-xs text-slate-500">描述案例背景，AI 起草审计方案；案例库会作为参考。</div>
          </div>
          <Link to="/special-audit/new">
            <Button variant="primary"><Plus size={14} /> 新建专项案例</Button>
          </Link>
        </div>
      </Card>

      {inFlight.length > 0 && (
        <div>
          <SectionTitle title="进行中" count={inFlight.length} />
          <div className="grid grid-cols-2 gap-4">
            {inFlight.map((c) => <CaseCard key={c.id} obj={c} />)}
          </div>
        </div>
      )}

      <div>
        <SectionTitle title="历史案例（已完成）" count={completed.length} />
        <div className="grid grid-cols-2 gap-4">
          {completed.map((c) => <CaseCard key={c.id} obj={c} />)}
        </div>
      </div>
    </div>
  )
}

function CaseCard({ obj }: { obj: any }) {
  const d = obj.data
  const sectionsCount = Object.keys(d?.plan_sections || {}).length
  const prov = d?.provenance as Provenance | undefined
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-rose-50 text-rose-700 grid place-items-center shrink-0">
          <Target size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{d?.case_no}</span>
            <Badge tone="rose">{d?.special_type}</Badge>
            <Badge tone={d?.status === '已完成' ? 'green' : 'amber'} className="ml-auto">{d?.status}</Badge>
          </div>
          <div className="text-sm font-semibold text-slate-900 mt-1 truncate">{d?.client_name}</div>
          <div className="text-xs text-slate-500 mt-1 line-clamp-2">{d?.focus_points}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Mini label="期间" value={d?.period} />
        <Mini label="团队" value={d?.team_size ? `${d.team_size} 人` : '—'} />
        <Mini label="章节" value={`${sectionsCount}`} />
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100">
        <ProvenancePill p={prov} />
      </div>
      {d?.conclusion && (
        <div className="mt-3 text-xs text-slate-600 line-clamp-2">
          <span className="text-slate-400 mr-1">结论：</span>{d.conclusion}
        </div>
      )}
    </Card>
  )
}

function Mini({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-slate-50 rounded-md p-2">
      <div className="text-slate-500 text-[10px]">{label}</div>
      <div className="text-slate-900 font-medium">{value ?? '—'}</div>
    </div>
  )
}

// ---------- Data Sources ----------

function DataSourcesTab() {
  const { data: tbs = [] } = useQuery({
    queryKey: ['objects', 'TrialBalance'],
    queryFn: () => api.listObjects('TrialBalance'),
  })
  const { data: vouchers = [] } = useQuery({
    queryKey: ['objects', 'Voucher'],
    queryFn: () => api.listObjects('Voucher'),
  })
  const { data: mcp = [] } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: api.listMCPServers,
  })

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-teal-50 text-teal-700 grid place-items-center">
            <FileSpreadsheet size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">试算平衡表 / 凭证</div>
            <div className="text-xs text-slate-500">已导入的财务数据</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Mini label="试算平衡表" value={`${tbs.length} 份`} />
          <Mini label="凭证" value={`${vouchers.length} 张`} />
        </div>
        <div className="mt-4 text-xs text-slate-500">支持来源：用友 / 金蝶 / SAP 导出文件、Excel 试算表。</div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-violet-50 text-violet-700 grid place-items-center">
            <Plug size={18} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-900">MCP 外部工具</div>
            <div className="text-xs text-slate-500">{mcp.filter((m) => m.enabled).length} / {mcp.length} 已启用</div>
          </div>
          <Link to="/mcp" className="text-xs text-brand-600 flex items-center gap-1">管理 <ChevronRight size={12} /></Link>
        </div>
        <div className="space-y-1 mt-3">
          {mcp.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-sm py-1">
              <span className={cn('h-2 w-2 rounded-full', s.enabled ? 'bg-emerald-500' : 'bg-slate-300')} />
              <span className="font-medium text-slate-800">{s.name}</span>
              <span className="text-xs text-slate-500 truncate">{s.description}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ---------- Advanced (links to ontology page) ----------

function AdvancedTab() {
  const { data: types = [] } = useQuery({ queryKey: ['object-types'], queryFn: api.listObjectTypes })
  const { data: links = [] } = useQuery({ queryKey: ['link-types'], queryFn: api.listLinkTypes })
  const { data: actions = [] } = useQuery({ queryKey: ['action-types'], queryFn: api.listActionTypes })

  return (
    <div className="space-y-4">
      <Card className="p-5 bg-slate-900 text-slate-200 border-slate-800">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-slate-800 text-brand-300 grid place-items-center">
            <Network size={18} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              本体模型（高级）
              <Badge tone="brand" className="!bg-brand-500/20 !text-brand-200 !border-brand-500/30">面向技术管理员</Badge>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              所有知识库内容背后的对象类型、链接、操作。一般审计师不需要打开这里 — 但合伙人或本所 IT 可以在这里扩展模型。
            </p>
          </div>
          <Link to="/ontology">
            <Button variant="primary" className="!bg-brand-500 hover:!bg-brand-600">
              进入本体管理 <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5">
          <Stat dark label="对象类型" value={types.length} icon={Network} />
          <Stat dark label="链接类型" value={links.length} icon={Sparkles} />
          <Stat dark label="操作类型" value={actions.length} icon={Database} />
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {types.slice(0, 9).map((t) => (
          <Link key={t.code} to={`/ontology/${t.code}`}>
            <Card className="p-4 flex items-center gap-3 hover:border-brand-200 hover:shadow-sm transition-all">
              <div className="h-9 w-9 rounded-lg grid place-items-center text-white"
                style={{ background: t.color }}>
                <Icon name={t.icon} size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{t.display_name}</div>
                <div className="text-[11px] text-slate-500 font-mono truncate">{t.code}</div>
              </div>
              <ChevronRight size={14} className="text-slate-400" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <Badge tone="neutral">{count}</Badge>
    </div>
  )
}

function Stat({ label, value, icon: I, dark }: { label: string; value: number; icon: any; dark?: boolean }) {
  return (
    <div className={cn('rounded-lg p-3', dark ? 'bg-slate-800/60' : 'bg-slate-50')}>
      <div className={cn('text-[11px]', dark ? 'text-slate-400' : 'text-slate-500')}>{label}</div>
      <div className={cn('flex items-center gap-2 mt-1', dark ? 'text-white' : 'text-slate-900')}>
        <I size={14} className={dark ? 'text-brand-300' : 'text-slate-500'} />
        <span className="text-xl font-semibold">{value}</span>
      </div>
    </div>
  )
}

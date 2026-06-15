import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Briefcase, ClipboardList, Bot, Network, Sparkles, ArrowRight,
  TrendingUp, AlertTriangle, Plug, BookOpen, AlertCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/utils'

// Stage mini-dots for engagement cards
const STAGE_DOTS = [
  { code: 'planning', label: '计', letters: ['X'] },
  { code: 'risk',     label: '风', letters: ['Y'] },
  { code: 'exec',     label: '执', letters: ['A','B','C','D','G','H','S'] },
  { code: 'report',   label: '报', letters: ['Z','ZK','ZS'] },
  { code: 'misc',     label: '他', letters: ['K','N','O','P','TB','KM'] },
]

function getStageDotStatus(engCode: string, papers: any[]): Array<'done' | 'active' | 'ai' | 'empty'> {
  const engPapers = papers.filter((p: any) => (p.data as any)?.engagement_code === engCode)
  return STAGE_DOTS.map((stage) => {
    const list = engPapers.filter((p: any) => {
      const idx = ((p.data as any)?.index || '') as string
      const m = idx.match(/^([A-Z]+)/)
      return m ? stage.letters.includes(m[1]) : false
    })
    if (list.length === 0) return 'empty'
    const done = list.filter((p: any) => {
      const d = (p.data as any) || {}
      return d.status === '已完成' || d.status === '完成' || d.review_status === '已复核'
    }).length
    const aiDone = list.filter((p: any) => {
      const d = (p.data as any) || {}
      return d.review_status === 'AI 初稿' || d.ai_prefilled_at || (d.sheet_data && Object.keys(d.sheet_data).length > 0)
    }).length
    if (done === list.length) return 'done'
    if (aiDone > 0) return 'ai'
    if (done > 0) return 'active'
    return 'empty'
  })
}

function StageDots({ dots }: { dots: Array<'done' | 'active' | 'ai' | 'empty'> }) {
  return (
    <div className="flex items-center gap-1 mt-1">
      {STAGE_DOTS.map((stage, i) => {
        const status = dots[i]
        return (
          <div key={stage.code} className="flex items-center gap-0.5" title={`${stage.label}: ${status}`}>
            <div className={cn(
              'h-2 w-2 rounded-full',
              status === 'done'   && 'bg-emerald-500',
              status === 'active' && 'bg-amber-400',
              status === 'ai'     && 'bg-blue-400',
              status === 'empty'  && 'bg-slate-200',
            )} />
            <span className="text-[9px] text-slate-400">{stage.label}</span>
            {i < STAGE_DOTS.length - 1 && <div className="w-2 h-px bg-slate-200 mx-0.5" />}
          </div>
        )
      })}
    </div>
  )
}

export default function Home() {
  const { data: engagements = [] } = useQuery({
    queryKey: ['objects', 'Engagement'],
    queryFn: () => api.listObjects('Engagement'),
  })
  const { data: papers = [] } = useQuery({
    queryKey: ['objects', 'WorkingPaper'],
    queryFn: () => api.listObjects('WorkingPaper'),
  })
  const { data: anomalies = [] } = useQuery({
    queryKey: ['objects', 'Anomaly'],
    queryFn: () => api.listObjects('Anomaly'),
  })
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: api.listAgents,
  })
  const { data: types = [] } = useQuery({
    queryKey: ['object-types'],
    queryFn: api.listObjectTypes,
  })

  return (
    <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
      {/* Hero */}
      <section className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 text-white p-8 relative overflow-hidden">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative">
          <div className="text-xs tracking-widest text-brand-200 uppercase mb-2">
            Palantir-style Audit Platform · 原型
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">把会计师的专业知识，沉淀为可执行的本体</h1>
          <p className="text-slate-300 max-w-2xl text-sm leading-relaxed">
            把底稿模板、审计规则、行业经验建模为<strong className="text-white">本体（Ontology）</strong>，
            让 AI 智能体直接读取上下文、写回底稿、应用规则、识别异常 —
            从年报底稿填写出发，延伸到方案生成、异常分析、专项审计。
          </p>
          <div className="mt-5 flex gap-3">
            <Link to="/workbench">
              <Button variant="primary" className="bg-white text-slate-900 hover:bg-slate-100">
                <ClipboardList size={16} /> 打开底稿工作台
              </Button>
            </Link>
            <Link to="/knowledge">
              <Button variant="ghost" className="text-white hover:bg-white/10">
                <BookOpen size={16} /> 浏览审计知识库
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-4 gap-4">
        <KPI icon={Briefcase} tint="brand" label="进行中项目" value={engagements.length} hint="审计 engagement" />
        <KPI icon={ClipboardList} tint="sky" label="底稿" value={papers.length} hint="本期所有底稿" />
        <KPI icon={AlertTriangle} tint="amber" label="待处理异常" value={anomalies.length} hint="规则触发或人工标记" />
        <KPI icon={Network} tint="green" label="本体对象类型" value={types.length} hint="可继续扩展" />
      </section>

      {/* Engagements + Agents */}
      <section className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center">
            <div className="text-sm font-semibold text-slate-900">进行中项目</div>
            <Badge tone="neutral" className="ml-2">{engagements.length}</Badge>
            <Link to="/explorer/Engagement" className="ml-auto text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
              查看全部 <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {engagements.map((e) => {
              const ec = (e.data as any)?.code
              const stageDots = getStageDotStatus(ec, papers)
              const aiFilledCount = papers.filter((p: any) =>
                (p.data as any)?.engagement_code === ec &&
                ((p.data as any)?.review_status === 'AI 初稿' || (p.data as any)?.ai_prefilled_at ||
                 ((p.data as any)?.sheet_data && Object.keys((p.data as any).sheet_data).length > 0))
              ).length
              return (
                <Link
                  key={e.id}
                  to={`/workbench?eng=${encodeURIComponent(ec)}`}
                  className="block px-5 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-brand-50 text-brand-700 grid place-items-center shrink-0">
                      <Briefcase size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-slate-900 truncate">{e.display_name}</div>
                        {aiFilledCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold shrink-0">
                            <AlertCircle size={8} /> {aiFilledCount} 待确认
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {(e.data?.code as string) || '—'} · 期间 {(e.data?.period as string) || '—'} · 合伙人 {(e.data?.partner as string) || '—'}
                      </div>
                      <StageDots dots={stageDots} />
                    </div>
                    <Badge tone={e.data?.status === '已完成' ? 'green' : 'amber'}>{(e.data?.status as string) || '—'}</Badge>
                  </div>
                </Link>
              )
            })}
            {engagements.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-slate-500">暂无项目</div>
            )}
          </div>
        </Card>

        <Card>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center">
            <Bot size={16} className="text-slate-500 mr-2" />
            <div className="text-sm font-semibold text-slate-900">已部署智能体</div>
            <Link to="/agents" className="ml-auto text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
              工作室 <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {agents.map((a) => (
              <Link key={a.code} to={`/agents/${a.code}`} className="block px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-md bg-slate-100 text-slate-600 grid place-items-center">
                    <Icon name={a.avatar} size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{a.name}</div>
                    <div className="text-xs text-slate-500 truncate">{a.description}</div>
                  </div>
                  {a.is_stub ? <Badge tone="neutral">即将上线</Badge> : <Badge tone="green">运行中</Badge>}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </section>

      {/* Capabilities */}
      <section>
        <div className="text-sm font-semibold text-slate-700 mb-3">平台能力</div>
        <div className="grid grid-cols-4 gap-4">
          <CapCard icon={BookOpen} title="审计知识库" to="/knowledge"
            desc="模板 / 规则 / 公共法规 / 客户档案 / 案例库 / 数据源 集中管理。" />
          <CapCard icon={ClipboardList} title="底稿工作台" to="/workbench" accent
            desc="货币资金底稿示例：AI 读取试算平衡表、填写表单、应用规则、标记异常。" />
          <CapCard icon={Bot} title="智能体工作室" to="/agents"
            desc="非技术审计师即可调整提示词、工具、检索范围；秒级发布。" />
          <CapCard icon={Plug} title="MCP 工具" to="/mcp"
            desc="文件系统、Excel、银行询证函系统 …… 一键挂载到智能体。" />
        </div>
      </section>
    </div>
  )
}

function KPI({
  icon: I, tint, label, value, hint,
}: { icon: any; tint: 'brand' | 'sky' | 'green' | 'amber'; label: string; value: number; hint: string }) {
  const tints: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700',
    sky: 'bg-sky-50 text-sky-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  }
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg grid place-items-center ${tints[tint]}`}>
          <I size={16} />
        </div>
        <div>
          <div className="text-xs text-slate-500">{label}</div>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
        </div>
        <TrendingUp size={14} className="ml-auto text-emerald-500" />
      </div>
      <div className="text-[11px] text-slate-400 mt-2">{hint}</div>
    </Card>
  )
}

function CapCard({
  icon: I, title, desc, to, accent,
}: { icon: any; title: string; desc: string; to: string; accent?: boolean }) {
  return (
    <Link to={to}>
      <Card className={`h-full p-5 hover:shadow-md hover:border-brand-200 transition-all ${accent ? 'border-brand-300 ring-1 ring-brand-200' : ''}`}>
        <div className={`h-9 w-9 rounded-lg grid place-items-center mb-3 ${accent ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
          <I size={16} />
        </div>
        <div className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
          {title} {accent && <Sparkles size={12} className="text-brand-500" />}
        </div>
        <div className="text-xs text-slate-500 leading-relaxed">{desc}</div>
      </Card>
    </Link>
  )
}

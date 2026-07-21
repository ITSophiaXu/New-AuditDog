import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BookOpenCheck, BriefcaseBusiness, CheckCircle2, ClipboardList,
  Download, FileOutput, FolderUp, Play, Plus, Settings2, Sparkles,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

const FLOW = [
  {
    number: '01',
    title: '创建年审项目',
    desc: '录入被审计单位、审计期间、行业和项目组。',
    output: '输出：项目档案与标准底稿目录',
    icon: BriefcaseBusiness,
    tone: 'brand',
  },
  {
    number: '02',
    title: '上传账套与 PBC',
    desc: '上传余额表、辅助账、序时账及客户补充材料。',
    output: '输出：版本化资料清单与证据缺口',
    icon: FolderUp,
    tone: 'sky',
  },
  {
    number: '03',
    title: '确认审计计划',
    desc: '确认会计准则、PM、TE、明显微小金额和审计策略。',
    output: '输出：审计计划与风险应对',
    icon: BookOpenCheck,
    tone: 'violet',
  },
  {
    number: '04',
    title: '执行全科目审计',
    desc: '依次执行计划、风险评估、各科目审计及报表附注生成。',
    output: '输出：审定表、明细表、账龄和审计程序',
    icon: Play,
    tone: 'amber',
  },
  {
    number: '05',
    title: '复核并交付',
    desc: '审计师处理异常和职业判断，复核报表、附注及意见。',
    output: '输出：单张 XLSX 与全项目 ZIP',
    icon: FileOutput,
    tone: 'emerald',
  },
]

export default function AnnualAuditHub() {
  const { data: engagements = [] } = useQuery({
    queryKey: ['objects', 'Engagement'],
    queryFn: () => api.listObjects('Engagement'),
  })
  const { data: papers = [] } = useQuery({
    queryKey: ['objects', 'WorkingPaper'],
    queryFn: () => api.listObjects('WorkingPaper'),
  })

  const projects = useMemo(
    () => engagements
      .filter((item) => (item.data as any)?.project_type === 'annual_audit')
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))),
    [engagements],
  )

  return (
    <div className="max-w-7xl mx-auto px-8 py-7 space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-5">
          <div className="h-12 w-12 rounded-xl bg-brand-600 text-white grid place-items-center shrink-0">
            <Sparkles size={22} />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-brand-600">
              ANNUAL AUDIT · END TO END
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">年审项目完整流程</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              从建项目和收资料开始，经过计划确认、全科目审计和人工复核，最终交付底稿、财务报表与附注。
            </p>
          </div>
          <Link to="/annual-audit/new?step=0">
            <Button variant="primary"><Plus size={15} /> 创建年审项目</Button>
          </Link>
        </div>

        <div className="grid grid-cols-5 gap-3 mt-6">
          {FLOW.map((item, index) => {
            const Icon = item.icon
            return (
              <div key={item.number} className="relative">
                <div className="h-full rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'h-8 w-8 rounded-lg grid place-items-center',
                      item.tone === 'brand' && 'bg-brand-100 text-brand-700',
                      item.tone === 'sky' && 'bg-sky-100 text-sky-700',
                      item.tone === 'violet' && 'bg-violet-100 text-violet-700',
                      item.tone === 'amber' && 'bg-amber-100 text-amber-700',
                      item.tone === 'emerald' && 'bg-emerald-100 text-emerald-700',
                    )}>
                      <Icon size={15} />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">{item.number}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-3">{item.title}</div>
                  <div className="text-[11px] leading-relaxed text-slate-500 mt-1">{item.desc}</div>
                  <div className="text-[10px] leading-relaxed text-brand-700 mt-3">{item.output}</div>
                </div>
                {index < FLOW.length - 1 && (
                  <ArrowRight
                    size={14}
                    className="absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 text-slate-300 bg-white"
                  />
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center mb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">年审项目</h2>
            <p className="text-xs text-slate-500 mt-0.5">每个项目都从资料准备进入工作台，不直接从一张孤立底稿开始。</p>
          </div>
          <Badge tone="neutral" className="ml-2">{projects.length}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {projects.map((project) => {
            const data = project.data as any
            const code = String(data.code || '')
            const projectPapers = papers.filter((paper) => (paper.data as any)?.engagement_code === code)
            const filled = projectPapers.filter((paper) => {
              const paperData = paper.data as any
              return paperData?.ai_prefilled_at || Object.keys(paperData?.sheet_data || {}).length > 0
            }).length
            const hasRun = Boolean(data.workflow_status && data.workflow_status !== '待执行')
            return (
              <Card key={project.id} className="overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-700 grid place-items-center shrink-0">
                    <BriefcaseBusiness size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-slate-900 truncate">{project.display_name}</div>
                      {data.use_demo_data && <Badge tone="amber">江苏大王样例</Badge>}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {code} · {data.period_start} 至 {data.period_end}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {data.accounting_standard || '准则待确认'} · PM ¥{Number(data.pm || 0).toLocaleString()}
                    </div>
                  </div>
                  <Badge tone={hasRun ? 'brand' : 'neutral'}>{data.workflow_status || '待执行'}</Badge>
                </div>

                <div className="px-5 py-3 grid grid-cols-4 gap-2 bg-slate-50/70">
                  <ProjectMetric label="项目设置" value={data.setup_status === 'completed' ? '已完成' : '待完善'} ready={data.setup_status === 'completed'} />
                  <ProjectMetric label="账套与 PBC" value={data.use_demo_data ? '样例已就绪' : '进入查看'} ready={Boolean(data.use_demo_data || data.last_material_upload_at)} />
                  <ProjectMetric label="底稿生成" value={`${filled}/${projectPapers.length}`} ready={filled > 0} />
                  <ProjectMetric label="当前阶段" value={hasRun ? '人工复核' : '准备执行'} ready={hasRun} />
                </div>

                <div className="px-5 py-3 flex items-center gap-2">
                  <Link to={`/annual-audit/${encodeURIComponent(code)}?step=0`}>
                    <Button variant="outline" size="sm"><Settings2 size={12} /> 项目信息</Button>
                  </Link>
                  <Link to={`/annual-audit/${encodeURIComponent(code)}?step=1`}>
                    <Button variant="outline" size="sm"><FolderUp size={12} /> 上传材料</Button>
                  </Link>
                  <Link to={`/annual-audit/${encodeURIComponent(code)}?step=2`}>
                    <Button variant="outline" size="sm"><BookOpenCheck size={12} /> 计划参数</Button>
                  </Link>
                  <Link
                    to={hasRun
                      ? `/workbench?eng=${encodeURIComponent(code)}`
                      : `/annual-audit/${encodeURIComponent(code)}?step=3`}
                    className="ml-auto"
                  >
                    <Button variant="primary" size="sm">
                      {hasRun ? <ClipboardList size={12} /> : <Play size={12} />}
                      {hasRun ? '进入底稿工作台' : '确认并执行'}
                    </Button>
                  </Link>
                  {hasRun && (
                    <a href={api.annualAuditPackageExportUrl(code)}>
                      <Button variant="outline" size="sm"><Download size={12} /> 导出</Button>
                    </a>
                  )}
                </div>
              </Card>
            )
          })}

          {projects.length === 0 && (
            <Card className="col-span-2 p-10 text-center">
              <CheckCircle2 size={26} className="mx-auto text-slate-300" />
              <div className="text-sm font-medium text-slate-700 mt-3">还没有年审项目</div>
              <div className="text-xs text-slate-500 mt-1">先创建项目，再上传账套和客户材料。</div>
              <Link to="/annual-audit/new?step=0" className="inline-block mt-4">
                <Button variant="primary"><Plus size={14} /> 创建第一个年审项目</Button>
              </Link>
            </Card>
          )}
        </div>
      </section>
    </div>
  )
}

function ProjectMetric({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] text-slate-500">
        <span className={cn('h-1.5 w-1.5 rounded-full', ready ? 'bg-emerald-500' : 'bg-slate-300')} />
        {label}
      </div>
      <div className="text-[11px] font-medium text-slate-800 mt-1 truncate">{value}</div>
    </div>
  )
}

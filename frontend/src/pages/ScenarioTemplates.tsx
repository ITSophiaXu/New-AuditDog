import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ClipboardList, Map, SearchCheck, Target, ArrowRight, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { zh } from '@/locales/zh'

interface Scenario {
  code: string
  title: string
  icon: any
  accent?: boolean
  blurb: string
  bullets: string[]
}

const SCENARIOS: Scenario[] = [
  {
    code: 'working_paper_fill',
    title: '底稿填写',
    icon: ClipboardList,
    accent: true,
    blurb: '基于试算平衡表、凭证、模板字段，自动填写底稿并应用审计规则；识别异常并打标。',
    bullets: ['货币资金、应收账款、存货等 200+ 标准底稿', 'AI 直接读写本体对象', '规则一键评估、异常自动登记'],
  },
  {
    code: 'plan_generation',
    title: '审计方案生成',
    icon: Map,
    blurb: '基于客户行业、规模、重大错报风险，生成年度审计总体方案与关键审计事项。',
    bullets: ['行业知识库 + 客户画像', '重要性水平与抽样规模建议', '关键审计事项 / KAM 草案'],
  },
  {
    code: 'anomaly_analysis',
    title: '审计异常分析',
    icon: SearchCheck,
    blurb: '对底稿与凭证中的异常进行根因分析、影响评估，并提出处理建议。',
    bullets: ['关联凭证、客户、合同上下文', '复合规则与跨期对比', '处理建议与底稿引用'],
  },
  {
    code: 'special_audit',
    title: '专项审计方案',
    icon: Target,
    accent: true,
    blurb: '经济责任、竣工决算、清产核资、税务合规等 17 类专项审计。AI 检索公共法规 + 历史案例，逐节生成完整方案。',
    bullets: ['公共法规库 + 案例库自动检索', '总体目标 / KAM / 风险 / 程序 / 里程碑 一键起草', '逐节复核与导出 docx'],
  },
]

export default function ScenarioTemplates() {
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: api.listAgents })
  const byScenario = Object.fromEntries(agents.map((a) => [a.scenario, a]))

  return (
    <div className="max-w-6xl mx-auto px-8 py-8 space-y-6">
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-widest">Scenario Templates</div>
        <h1 className="text-2xl font-semibold text-slate-900 mt-1">场景模板</h1>
        <p className="text-sm text-slate-500 mt-1">
          每个场景对应一个预置智能体配置。审计师只需要修改提示词与工具，即可适配本所的执业风格。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {SCENARIOS.map((s) => {
          const agent = byScenario[s.code]
          const Icon = s.icon
          return (
            <Card
              key={s.code}
              className={`p-6 relative overflow-hidden ${s.accent ? 'ring-1 ring-brand-200 border-brand-300' : ''}`}
            >
              {s.accent && (
                <div className="absolute right-0 top-0 px-3 py-1 text-[10px] font-medium bg-brand-600 text-white rounded-bl-lg">
                  已可演示
                </div>
              )}
              <div className="flex items-start gap-4">
                <div className={`h-12 w-12 rounded-xl grid place-items-center shrink-0 ${s.accent ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{s.title}</h3>
                    {agent?.is_stub && <Badge tone="amber">stub</Badge>}
                    {!agent?.is_stub && <Badge tone="green">运行中</Badge>}
                  </div>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">{s.blurb}</p>
                  <ul className="mt-3 space-y-1.5">
                    {s.bullets.map((b) => (
                      <li key={b} className="text-xs text-slate-500 flex items-start gap-2">
                        <Sparkles size={11} className="text-brand-500 mt-0.5 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-3">
                <div className="text-xs text-slate-500 flex-1">
                  {agent ? <>预置智能体：<span className="font-medium text-slate-700">{agent.name}</span></> : '尚未预置'}
                </div>
                {s.accent ? (
                  <Link to={s.code === 'special_audit' ? '/special-audit' : '/workbench'}>
                    <Button variant="primary" size="sm">
                      打开工作台 <ArrowRight size={12} />
                    </Button>
                  </Link>
                ) : (
                  agent && (
                    <Link to={`/agents/${agent.code}`}>
                      <Button variant="outline" size="sm">查看配置</Button>
                    </Link>
                  )
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

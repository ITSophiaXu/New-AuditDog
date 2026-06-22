/** 自由底稿 — 右侧「任务」面板：需人工处理的事项.
 *
 * Agent 已完成 7 维度测试并形成 6 条报告级发现；这些发现均 open，需管理层说明 /
 * 补充审计程序后由项目组确认。本面板把"人要做的事"集中列出（建议处理动作前置），
 * 中间区域则专注于底稿 Excel。
 */
import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, ListChecks, ArrowRight } from 'lucide-react'
import { Badge, BadgeProps } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

interface Props {
  paperData: any
  className?: string
}

function levelTone(level: string): NonNullable<BadgeProps['tone']> {
  const l = (level || '').toLowerCase()
  if (l.includes('高') || l === 'high') return 'rose'
  if (l.includes('中') || l === 'medium') return 'amber'
  if (l.includes('低') || l === 'low') return 'sky'
  return 'neutral'
}

function levelWeight(level: string): number {
  if (level.includes('高')) return 0
  if (level.includes('中')) return 1
  if (level.includes('低')) return 2
  return 3
}

export default function FreeformTaskPanel({ paperData, className }: Props) {
  const findings: any[] = [...(paperData?.findings || [])].sort(
    (a, b) => levelWeight(a.level) - levelWeight(b.level),
  )
  const conclusion: string = paperData?.audit_conclusion || ''
  const [open, setOpen] = useState<string | null>(findings[0]?.code || null)
  const [showConclusion, setShowConclusion] = useState(false)

  const counts = findings.reduce<Record<string, number>>((m, f) => {
    const t = f.level.includes('高') ? '高' : f.level.includes('中') ? '中' : '低'
    m[t] = (m[t] || 0) + 1
    return m
  }, {})

  return (
    <div className={cn('h-full flex flex-col bg-white', className)}>
      {/* 头部 */}
      <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50/60 shrink-0">
        <div className="flex items-center gap-2">
          <ListChecks size={14} className="text-violet-600" />
          <span className="text-[13px] font-semibold text-slate-800">需人工处理事项</span>
          <Badge tone="brand" className="!h-5 ml-auto">{findings.length} 项发现</Badge>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
          {counts['高'] && <Badge tone="rose" className="!h-5">高 {counts['高']}</Badge>}
          {counts['中'] && <Badge tone="amber" className="!h-5">中 {counts['中']}</Badge>}
          {counts['低'] && <Badge tone="sky" className="!h-5">低 {counts['低']}</Badge>}
          <span className="text-slate-400 ml-auto">均 open · 待管理层说明 / 补充程序</span>
        </div>
      </div>

      {/* 提示 */}
      <div className="px-3 py-2 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-100 flex gap-1.5 shrink-0">
        <AlertTriangle size={13} className="shrink-0 mt-px text-amber-500" />
        <span>Agent 已完成 7 维度测试并提出以下发现，但不替管理层定性。请就每项发现取得说明 / 执行建议程序后，在此确认或修改。</span>
      </div>

      {/* 发现列表（任务） */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
        {findings.map((f) => {
          const isOpen = open === f.code
          return (
            <div key={f.code} className="px-3 py-2.5">
              <button
                onClick={() => setOpen(isOpen ? null : f.code)}
                className="w-full flex items-start gap-2 text-left"
              >
                {isOpen
                  ? <ChevronDown size={14} className="shrink-0 mt-0.5 text-slate-400" />
                  : <ChevronRight size={14} className="shrink-0 mt-0.5 text-slate-400" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge tone={levelTone(f.level)} className="!h-5">{f.level}</Badge>
                    <span className="font-mono text-[11px] text-slate-500">{f.code}</span>
                    <Badge tone="neutral" className="!h-5">待处理</Badge>
                    {f.amount && <span className="text-[11px] tabular-nums text-slate-500 ml-auto">¥{f.amount}</span>}
                  </div>
                  <div className="text-[12.5px] font-medium text-slate-800 mt-1 leading-snug">{f.title}</div>
                </div>
              </button>

              {/* 建议处理动作（始终可见 — 这是"人要做的事"） */}
              {f.recommendation && (
                <div className="mt-1.5 ml-6 flex gap-1.5 rounded-md bg-emerald-50 border border-emerald-100 px-2 py-1.5">
                  <ArrowRight size={13} className="shrink-0 mt-0.5 text-emerald-600" />
                  <div className="text-[11.5px] leading-relaxed text-emerald-900">
                    <span className="font-semibold">建议处理：</span>{f.recommendation}
                  </div>
                </div>
              )}

              {/* 展开：证据与依据 */}
              {isOpen && (
                <div className="mt-2 ml-6 space-y-2 text-[11.5px]">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-slate-500">
                    {f.dimension && <span>维度：<span className="text-slate-700">{f.dimension}</span></span>}
                    {f.assertion && <span>认定：<span className="text-slate-700">{f.assertion}</span></span>}
                    {f.result_refs && <span>result_refs：<span className="font-mono text-slate-700">{f.result_refs}</span></span>}
                  </div>
                  <Field label="观察事项" value={f.observation} />
                  <Field label="准则依据" value={f.standard} />
                  <Field label="根本原因" value={f.root_cause} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 科目审计结论（折叠） */}
      {conclusion && (
        <div className="border-t border-slate-200 shrink-0">
          <button
            onClick={() => setShowConclusion((v) => !v)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
          >
            {showConclusion ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
            科目审计结论
          </button>
          {showConclusion && (
            <div className="px-3 pb-3 text-[11.5px] leading-relaxed text-slate-600 max-h-48 overflow-y-auto">
              {conclusion}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[10.5px] font-semibold text-slate-500 mb-0.5">{label}</div>
      <div className="text-[11.5px] leading-relaxed text-slate-700">{value}</div>
    </div>
  )
}

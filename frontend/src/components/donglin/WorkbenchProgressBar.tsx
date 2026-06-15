import { CheckCircle2, Loader2, Circle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Stage = { code: string; name: string; done: number; total: number }

type Props = {
  engagementName?: string
  paperName?: string
  paperStatus?: '完成' | '待 review' | 'AI 已填' | '缺数据' | '未启动'
  stages: Stage[]
  totalPapers: number
  statusCounts: Record<string, number>
  className?: string
}

const STAGE_COLORS: Record<string, { active: string; done: string }> = {
  planning:    { active: 'bg-sky-500',     done: 'bg-sky-600' },
  risk:        { active: 'bg-amber-500',   done: 'bg-amber-600' },
  execution:   { active: 'bg-emerald-500', done: 'bg-emerald-600' },
  reporting:   { active: 'bg-violet-500',  done: 'bg-violet-600' },
  misc:        { active: 'bg-slate-400',   done: 'bg-slate-500' },
}

export default function WorkbenchProgressBar({
  engagementName, paperName, paperStatus, stages, totalPapers, statusCounts, className,
}: Props) {
  const overallDone = stages.reduce((a, s) => a + s.done, 0)
  const overallTotal = stages.reduce((a, s) => a + s.total, 0)
  const overallPct = overallTotal > 0 ? Math.round(overallDone / overallTotal * 100) : 0

  const aiFilledCount = statusCounts['AI 已填'] || 0
  const pendingReviewCount = statusCounts['待 review'] || 0
  const missingDataCount = statusCounts['缺数据'] || 0
  const handoffMessage =
    aiFilledCount > 0
      ? { text: `交接点①：${aiFilledCount} 张底稿已由 AI 填写，请审阅后在「待确认」面板中逐张确认`, tone: 'amber' as const }
      : pendingReviewCount > 0
      ? { text: `${pendingReviewCount} 张底稿待复核，请在「待确认」面板中处理`, tone: 'amber' as const }
      : missingDataCount > 0
      ? { text: `${missingDataCount} 张底稿缺少数据，请补充客户资料后继续`, tone: 'rose' as const }
      : null

  return (
    <div className={cn('bg-gradient-to-r from-slate-50 to-white border-b border-slate-200', className)}>
      <div className="px-4 py-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-800 truncate max-w-[300px]">{engagementName || '—'}</span>
          {paperName && (
            <>
              <span className="text-slate-300">/</span>
              <span className="text-slate-600 truncate max-w-[280px]">{paperName}</span>
            </>
          )}
          {paperStatus && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium',
              paperStatus === '完成' && 'bg-emerald-100 text-emerald-700',
              paperStatus === '待 review' && 'bg-amber-100 text-amber-700',
              paperStatus === 'AI 已填' && 'bg-blue-100 text-blue-700',
              paperStatus === '缺数据' && 'bg-rose-100 text-rose-700',
              (!paperStatus || paperStatus === '未启动') && 'bg-slate-100 text-slate-600',
            )}>
              {paperStatus === '完成' ? '✓ 完成'
                : paperStatus === '待 review' ? '👁 待 review'
                : paperStatus === 'AI 已填' ? '⏳ AI 已填'
                : paperStatus === '缺数据' ? '⚠ 缺数据'
                : '○ 未启动'}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 text-[11px]">
            <span className="text-slate-500">整体进度</span>
            <span className="font-bold text-blue-600 text-sm">{overallPct}%</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          {stages.map((stage, i) => {
            const colors = STAGE_COLORS[stage.code] || STAGE_COLORS.misc
            const isDone = stage.done === stage.total && stage.total > 0
            const isActive = !isDone && stage.done > 0
            const Icon = isDone ? CheckCircle2 : isActive ? Loader2 : Circle
            return (
              <div key={stage.code} className="flex items-center gap-1.5">
                <div className={cn(
                  'px-2 py-0.5 rounded flex items-center gap-1 text-[10px] font-medium',
                  isDone && cn(colors.done, 'text-white'),
                  isActive && cn(colors.active, 'text-white'),
                  !isDone && !isActive && 'bg-slate-200 text-slate-600',
                )}>
                  <Icon size={9} className={cn(isActive && 'animate-spin')} />
                  <span>{stage.name}</span>
                  <span className="opacity-90 font-mono">{stage.done}/{stage.total}</span>
                </div>
                {i < stages.length - 1 && <div className="w-3 h-px bg-slate-300" />}
              </div>
            )
          })}
          <div className="flex-1" />
          <div className="text-[10px] text-slate-500 font-mono">
            {totalPapers} 张底稿
            · 已填 {statusCounts['AI 已填'] || 0}
            · 待 review {statusCounts['待 review'] || 0}
            · 未启动 {statusCounts['未启动'] || 0}
          </div>
        </div>
      </div>

      {handoffMessage && (
        <div className={cn(
          'px-4 py-1.5 flex items-center gap-2 text-[11px] font-medium border-t',
          handoffMessage.tone === 'amber'
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-rose-50 border-rose-200 text-rose-800',
        )}>
          <AlertCircle size={12} className="shrink-0" />
          <span>{handoffMessage.text}</span>
        </div>
      )}
    </div>
  )
}

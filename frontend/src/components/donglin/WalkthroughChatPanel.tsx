/** 穿行测试 — 「对话」面板：Agent 人工确认对话.
 *
 * 把穿行测试的 5 个人工节点（人工门 A/B/1/2 两轮）渲染成 Agent ↔ 审计师 的对话：
 * 每个节点展示 Agent 需要人工确认的内容（请求）与人的回复（确认 / 修改要求）。
 */
import { Bot, User, ShieldCheck } from 'lucide-react'
import { Badge, BadgeProps } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

interface Props {
  paperData: any
  className?: string
}

function choiceTone(choice: string): NonNullable<BadgeProps['tone']> {
  const c = choice || ''
  if (c.includes('approve') || c.includes('通过')) return 'green'
  if (c.includes('changes') || c.includes('退回')) return 'amber'
  return 'brand'
}

export default function WalkthroughChatPanel({ paperData, className }: Props) {
  const gates: any[] = paperData?.gates || []

  return (
    <div className={cn('h-full flex flex-col bg-white', className)}>
      <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50/60 shrink-0">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-violet-600" />
          <span className="text-[13px] font-semibold text-slate-800">人工确认对话</span>
          <Badge tone="brand" className="!h-5 ml-auto">{gates.length} 个节点</Badge>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Agent 在关键节点暂停、向审计师请求确认；以下为各节点的请求与人工回复，构成审计判断留痕。</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
        {gates.map((g, i) => (
          <div key={i} className="space-y-2">
            {/* 节点分隔 */}
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[10.5px] font-medium text-slate-400 whitespace-nowrap">{g.node}</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            {/* Agent 请求 */}
            <div className="flex gap-2">
              <div className="h-6 w-6 rounded-full bg-brand-100 text-brand-700 grid place-items-center shrink-0 mt-0.5">
                <Bot size={13} />
              </div>
              <div className="min-w-0">
                <div className="text-[10.5px] text-slate-400 mb-0.5">Agent · 请求确认 {g.role ? `（${g.role}）` : ''}</div>
                <div className="rounded-lg rounded-tl-sm bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] leading-relaxed text-slate-700">
                  {g.agent_prompt || g.detail}
                </div>
              </div>
            </div>

            {/* 人工回复 */}
            <div className="flex gap-2 flex-row-reverse">
              <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center shrink-0 mt-0.5">
                <User size={13} />
              </div>
              <div className="min-w-0 flex flex-col items-end">
                <div className="text-[10.5px] text-slate-400 mb-0.5">审计师 · 回复</div>
                {g.human_reply && (
                  <div className="rounded-lg rounded-tr-sm bg-emerald-50 border border-emerald-200 px-3 py-2 text-[12px] leading-relaxed text-emerald-900 text-left">
                    {g.human_reply}
                  </div>
                )}
                {g.choice && (
                  <Badge tone={choiceTone(g.choice)} className="!h-5 mt-1">决策：{g.choice}</Badge>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="text-[10.5px] text-slate-400 text-center pt-1">— 对话结束 · 底稿已交付 —</div>
      </div>
    </div>
  )
}

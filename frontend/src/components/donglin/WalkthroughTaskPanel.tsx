/** 穿行测试 — 右侧「任务」面板：需人工处理的事项.
 *
 * 集中列出穿行测试中需审计师处理/确认的事项：
 *  - 3 笔「需人工复核」样本（口径差异，非账实不符）+ 建议
 *  - 11 条勾稽发现（按严重度）
 *  - 5 个人工判断/复核节点轨迹
 */
import { useState } from 'react'
import { ListChecks, AlertTriangle, ChevronDown, ChevronRight, Search, ArrowRight } from 'lucide-react'
import { Badge, BadgeProps } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

interface Props {
  paperData: any
  className?: string
}

function sevTone(s: string): NonNullable<BadgeProps['tone']> {
  if (s.includes('高')) return 'rose'
  if (s.includes('中')) return 'amber'
  if (s.includes('低')) return 'sky'
  return 'neutral'
}
function sevWeight(s: string): number {
  if (s.includes('高')) return 0
  if (s.includes('中')) return 1
  if (s.includes('低')) return 2
  return 3
}

export default function WalkthroughTaskPanel({ paperData, className }: Props) {
  const samples: any[] = paperData?.samples || []
  const issues: any[] = [...(paperData?.issues || [])].sort((a, b) => sevWeight(a.severity) - sevWeight(b.severity))
  const reviewSamples = samples.filter((s) => String(s.conclusion).includes('需'))

  const [openSample, setOpenSample] = useState<string | null>(reviewSamples[0]?.id || null)
  const [tab, setTab] = useState<'review' | 'issues'>('review')

  return (
    <div className={cn('h-full flex flex-col bg-white', className)}>
      {/* 头部 */}
      <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50/60 shrink-0">
        <div className="flex items-center gap-2">
          <ListChecks size={14} className="text-violet-600" />
          <span className="text-[13px] font-semibold text-slate-800">需人工处理事项</span>
          <Badge tone="amber" className="!h-5 ml-auto">需复核 {reviewSamples.length}</Badge>
        </div>
        <div className="mt-2 flex gap-1 text-[12px]">
          <SubTab active={tab === 'review'} onClick={() => setTab('review')}>需复核 {reviewSamples.length}</SubTab>
          <SubTab active={tab === 'issues'} onClick={() => setTab('issues')}>勾稽发现 {issues.length}</SubTab>
        </div>
      </div>

      {/* 提示 */}
      <div className="px-3 py-2 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-100 flex gap-1.5 shrink-0">
        <AlertTriangle size={13} className="shrink-0 mt-px text-amber-500" />
        <span>3 笔判「需复核」核心为本次材料范围下口径差异（单笔 PO 合同 vs 该客户全期出库台账），<b>非账实不符</b>。Agent 不替审计师拍板，请确认或补充程序。</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* —— 需复核样本 —— */}
        {tab === 'review' && (
          <div className="divide-y divide-slate-100">
            {reviewSamples.map((s) => {
              const open = openSample === s.id
              const sIssues = issues.filter((i) => i.customer === s.customer)
              return (
                <div key={s.id} className="px-3 py-2.5">
                  <button onClick={() => setOpenSample(open ? null : s.id)} className="w-full flex items-start gap-2 text-left">
                    {open ? <ChevronDown size={14} className="shrink-0 mt-0.5 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 mt-0.5 text-slate-400" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge tone="amber" className="!h-5"><Search size={11} className="mr-0.5" />需人工复核</Badge>
                        <span className="font-mono text-[10px] text-slate-400">{s.contract}</span>
                      </div>
                      <div className="text-[12.5px] font-medium text-slate-800 mt-1 leading-snug">{s.customer}</div>
                    </div>
                  </button>
                  <div className="mt-1.5 ml-6 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <KV k="合同含税额" v={`¥${s.contract_amount}`} />
                    <KV k="出库金额合计" v={`¥${s.outbound_total}`} />
                    <KV k="出库日期行" v={String(s.outbound_rows)} />
                    <KV k="置信" v={s.confidence} />
                  </div>
                  {open && (
                    <div className="mt-2 ml-6 space-y-2">
                      <div className="rounded-md bg-emerald-50 border border-emerald-100 px-2 py-1.5 text-[11.5px] text-emerald-900 flex gap-1.5">
                        <ArrowRight size={13} className="shrink-0 mt-0.5 text-emerald-600" />
                        <span><b>建议：</b>如需精确量价勾稽，按来源单据号 / 规格型号 / 交期窗口把出库台账收窄到本 PO 对应批次后再核；或补充发票 / 记账凭证做收入确认勾稽。</span>
                      </div>
                      {sIssues.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[10.5px] font-semibold text-slate-500">关联勾稽发现（{sIssues.length}）</div>
                          {sIssues.map((i, k) => (
                            <div key={k} className="flex items-start gap-1.5 text-[11px]">
                              <Badge tone={sevTone(i.severity)} className="!h-4 !text-[9px] shrink-0">{i.severity}</Badge>
                              <span className="text-slate-600">{i.check} · {i.desc}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* —— 勾稽发现 —— */}
        {tab === 'issues' && (
          <div className="divide-y divide-slate-100">
            {issues.map((i, k) => (
              <div key={k} className="px-3 py-2 flex items-start gap-2">
                <Badge tone={sevTone(i.severity)} className="!h-5 shrink-0">{i.severity}</Badge>
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-slate-700">{i.customer}<span className="ml-1.5 font-mono text-[10px] text-slate-400">{i.check}</span></div>
                  <div className="text-[11.5px] text-slate-600 leading-relaxed mt-0.5">{i.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return <div><span className="text-slate-400">{k}</span> <span className="text-slate-700 font-medium tabular-nums">{v}</span></div>
}
function SubTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn('px-2 py-1 rounded-md', active ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50')}>
      {children}
    </button>
  )
}

import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Bot, Download, FileSpreadsheet } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

type Sheet = { name: string; rows: any[][] }

const TASKS = [
  { title: '第三方代付需审计师判断', severity: '高', detail: '老挝 E-POWER 的 1,080,000 美元货款由第三方代付，打款人与合同买方不一致，需判断是否构成回款异常或关联安排。' },
  { title: 'BS250925 缺海运提单', severity: '高', detail: '装船后未取得提单，收入确认时点证据链不完整，需补单或执行替代程序。' },
  { title: 'BS250925 发货数量与开票数量差 2,200', severity: '中', detail: '发货 22,445 件、合同/开票 24,645 件，需确认差异原因及是否影响收入确认。' },
  { title: 'E-POWER 尾款未回款', severity: '中', detail: '合同对应应收尚未结清，需结合期后回款和信用风险评估可收回性。' },
  { title: 'GREAT WISE 尾款未全额收回', severity: '中', detail: '部分货款尚未到账，建议追加期后回款核验并评估坏账准备。' },
]

const CHAT_SUGGESTIONS = [
  'BS250925 的数量差异 2,200 具体差在哪笔发货？',
  '把甲公司的第三方代付逐笔列给我看',
  '按 TE=50 万重新预标重大差异',
]

export default function DetailTestResultPanel({ xlsxUrl = '/cases/detail-test-result-a.xlsx', embedded = false }: { xlsxUrl?: string; embedded?: boolean }) {
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [activeSheet, setActiveSheet] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'task' | 'chat'>('task')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const buf = await fetch(xlsxUrl).then((r) => r.arrayBuffer())
      const wb = XLSX.read(buf, { type: 'array' })
      const next = wb.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false }) as any[][],
      }))
      if (!alive) return
      setSheets(next)
      setActiveSheet(next[0]?.name || '')
    })()
    return () => { alive = false }
  }, [xlsxUrl])

  const current = useMemo(() => sheets.find((s) => s.name === activeSheet) || sheets[0], [sheets, activeSheet])
  const maxCols = useMemo(() => Math.max(0, ...(current?.rows || []).map((r) => r.length)), [current])

  function downloadXlsx() {
    window.open(xlsxUrl, '_blank')
  }

  return (
    <div className={cn('grid gap-5', embedded ? 'grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-[minmax(0,1fr)_360px]')}>
      <div className="space-y-4 min-w-0">
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          {[
            ['测试交易（全量）', '5'],
            ['关键字段填充率', '98%'],
            ['异常发现', '8'],
            ['异常点', '5'],
            ['合同金额合计', '¥13.08M'],
          ].map(([label, value], i) => (
            <Card key={label} className={cn('p-4', i === 2 ? 'border-rose-200 bg-rose-50/40' : i === 3 ? 'border-amber-200 bg-amber-50/40' : '')}>
              <div className={cn('text-xl font-semibold', i === 2 ? 'text-rose-600' : i === 3 ? 'text-amber-600' : 'text-slate-900')}>{value}</div>
              <div className="mt-1 text-[11px] text-slate-500">{label}</div>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
            <span className="h-6 w-6 rounded bg-emerald-600 text-white text-[12px] font-bold grid place-items-center">X</span>
            <span className="text-sm font-medium text-slate-800">交易细节测试穿透底稿</span>
            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={downloadXlsx}><Download size={13} /> 下载 Excel</Button>
            </div>
          </div>
          <div className="px-4 py-2 border-b border-slate-200 text-[12px] text-slate-500 flex items-center gap-3">
            <FileSpreadsheet size={13} className="text-emerald-600" />
            <span>{current?.name || '加载中…'}</span>
          </div>
          <div className="px-4 py-2 border-b border-slate-200 flex flex-wrap gap-2 bg-white">
            {sheets.map((sheet) => (
              <button
                key={sheet.name}
                onClick={() => setActiveSheet(sheet.name)}
                className={cn('px-3 py-1 rounded-md text-[12px] border',
                  activeSheet === sheet.name ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
              >
                {sheet.name}
              </button>
            ))}
          </div>
          <div className="overflow-auto max-h-[760px] bg-white">
            <table className="min-w-full text-[11px] border-collapse">
              <tbody>
                {(current?.rows || []).map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-slate-100">
                    {Array.from({ length: maxCols || row.length }).map((_, cIdx) => {
                      const cell = row[cIdx] ?? ''
                      return (
                        <td
                          key={cIdx}
                          className={cn(
                            'px-2 py-1 align-top whitespace-pre-wrap border-r border-slate-100 min-w-[120px] leading-[1.35]',
                            rIdx < 2 ? 'bg-slate-100 font-semibold text-slate-700' : 'text-slate-700',
                            typeof cell === 'string' && (cell.includes('异常') || cell.includes('待确认') || cell.includes('第三方代付') || cell.includes('不一致'))
                              ? 'bg-amber-50 text-rose-700 font-medium'
                              : '',
                          )}
                        >
                          {cell as any}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-sm font-semibold text-slate-900 mb-2">审计说明</div>
          <div className="text-[13px] text-slate-600 leading-7 space-y-2">
            <p>本次交易细节测试选取本期全部 5 笔外贸出口销售，沿“合同→发货→物流报关→装船取得提单→客户签收→电汇收款→确认收入结转应收账款”逐笔穿透。各单据基本衔接，货物/数量/金额/币种大体一致，收入于报关装船取得提单后确认、时点恰当。</p>
            <p className="text-rose-700 font-medium">收款环节发现重要异常：甲公司的 1,080,000 美元货款全部由第三方代付；BS250925 缺海运提单，且发货数量与开票数量不符；尾款未全额收回。</p>
            <p>上述差异已逐笔列出，是否构成重大错报、是否调整由审计师判断；如填写 TE / SAD，可在后续自动预标重大差异。</p>
          </div>
        </Card>
      </div>

      <aside className="rounded-2xl border border-slate-200 bg-white overflow-hidden min-w-0">
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button
            onClick={() => setActiveTab('task')}
            className={cn('flex-1 px-4 py-3 text-sm font-medium', activeTab === 'task' ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-500' : 'text-slate-500 hover:bg-slate-100')}
          >
            异常点 <span className="ml-1 text-xs text-brand-600">5</span>
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={cn('flex-1 px-4 py-3 text-sm font-medium', activeTab === 'chat' ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-500' : 'text-slate-500 hover:bg-slate-100')}
          >
            对话
          </button>
        </div>
        {activeTab === 'task' ? (
          <div className="p-4 space-y-3 max-h-[980px] overflow-y-auto">
            {TASKS.map((task, idx) => (
              <div key={task.title} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center gap-2">
                  <Badge tone={task.severity === '高' ? 'rose' : task.severity === '中' ? 'amber' : 'sky'}>{task.severity}</Badge>
                  <span className="text-sm font-medium text-slate-800">{task.title}</span>
                </div>
                <div className="mt-2 text-[12px] text-slate-600 leading-relaxed">{task.detail}</div>
                <div className="mt-2 text-[11px] text-slate-400">异常点 #{idx + 1}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-[980px] overflow-y-auto">
            <div className="px-4 py-3 border-b border-slate-200 bg-white">
              <div className="flex items-center gap-2">
                <Bot size={15} className="text-brand-600" />
                <div className="text-sm font-semibold text-slate-900">智能助手</div>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">围绕当前底稿结果追问差异、证据链和人工判断建议。</div>
            </div>
            <div className="p-4 space-y-4 bg-slate-50/40">
              <div className="flex gap-2 items-start">
                <div className="h-8 w-8 rounded-full bg-brand-50 text-brand-600 grid place-items-center shrink-0"><Bot size={14} /></div>
                <div className="rounded-2xl rounded-tl-md bg-white border border-slate-200 px-3 py-2 text-[12px] text-slate-700 leading-6 shadow-sm">
                  我已把异常点、回款差异、合同链路和底稿结果串起来了。你可以直接问我某笔交易、某个异常点，或者让我按 TE / SAD 重新判断重大性。
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[11px] font-medium text-slate-500 mb-2">快捷提问</div>
                <div className="flex flex-wrap gap-2">
                  {CHAT_SUGGESTIONS.map((q) => (
                    <button key={q} type="button" className="text-left rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] leading-5 text-slate-600 hover:bg-slate-100">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 p-3 text-[11px] text-slate-500 leading-6">
                <div className="font-medium text-slate-700 mb-1">最近建议</div>
                先补海运提单与第三方代付说明，再把未回款的期后回单补齐；如果需要，我可以把“需人工确认”sheet 中对应行号直接列出来。
              </div>
            </div>
            <div className="border-t border-slate-200 bg-white p-3">
              <div className="flex gap-2 items-center">
                <Input className="flex-1 h-10 text-[12px]" placeholder="输入问题，例如：把 BS250925 的数量差异逐单列出来" />
                <Button variant="primary" size="sm" className="shrink-0 whitespace-nowrap min-w-[72px]">发送</Button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

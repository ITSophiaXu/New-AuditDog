import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  ArrowLeftRight, Upload, FolderOpen, Loader2, AlertTriangle, Download, ChevronDown,
  FileSpreadsheet, Banknote, CircleCheck, Play,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { zh } from '@/locales/zh'

type Step = 'idle' | 'running' | 'done'

const PROGRESS_STEPS = [
  '接收并识别材料（账面/对账单/辅助）',
  '智能清洗入库 · 逐笔留痕',
  '账户身份配对（网点名 ⇄ 银行+尾号）',
  '全量双向核对 · 账到单 + 单到账',
  '勾稽验算 · 覆盖率 · 差异明细',
  '识别异常 · 生成审计师底稿',
]

const BANK_DEMOS = [
  { name: '中国建设银行', tail: '0541', file: '建行-0541.xlsx', status: 'ok' },
  { name: '中国工商银行', tail: '6015', file: '工行-6015.xlsx', status: 'ok' },
  { name: '中信银行', tail: '0793', file: '中信-0793.xlsx', status: 'warn' },
]

export default function BankReconciliation() {
  const [step, setStep] = useState<Step>('idle')
  const [progressIndex, setProgressIndex] = useState(0)
  const [ledgerLoaded, setLedgerLoaded] = useState(true)
  const [auxLoaded, setAuxLoaded] = useState(true)
  const [banks, setBanks] = useState(BANK_DEMOS)
  const [company, setCompany] = useState('甲公司（母公司）')
  const [year] = useState('2025')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const ready = ledgerLoaded && banks.length > 0
  const activeStep = step === 'idle' ? 1 : step === 'running' ? 2 : 3
  const totalBankFiles = banks.length

  function runRecon() {
    setStep('running')
    setProgressIndex(0)
    timers.current.forEach(clearTimeout)
    timers.current = []
    PROGRESS_STEPS.forEach((_, i) => {
      timers.current.push(setTimeout(() => setProgressIndex(i + 1), 1000 + i * 800))
    })
    timers.current.push(setTimeout(() => setStep('done'), 1000 + PROGRESS_STEPS.length * 800 + 500))
  }

  function addBankSlot() {
    setBanks((prev) => [...prev, { name: '新银行账户', tail: '0000', file: '待上传.xlsx', status: 'warn' }])
  }

  const currentProgress = useMemo(() => Math.min(100, Math.round((progressIndex / PROGRESS_STEPS.length) * 100)), [progressIndex])

  return (
    <div className="max-w-[1600px] mx-auto px-8 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-xs text-slate-500 mb-1">{zh.nav.bankRecon} · 审计工作台</div>
          <h1 className="text-2xl font-semibold text-slate-900">银行流水双向核对</h1>
        </div>
        <Badge tone="brand" className="ml-2">演示</Badge>
      </div>

      <div className="flex items-center gap-3 text-[13px]">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-3">
            <div className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1.5 border',
              activeStep === n ? 'border-brand-300 bg-brand-50 text-brand-700' : activeStep > n ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500')}>
              <span className={cn('h-5 w-5 rounded-full grid place-items-center text-[11px] font-semibold',
                activeStep === n ? 'bg-brand-600 text-white' : activeStep > n ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600')}>{n}</span>
              {n === 1 ? '上传账面与对账单' : n === 2 ? '运行双向核对' : '核对结果与人工待办'}
            </div>
            {n < 3 && <span className="text-slate-300">›</span>}
          </div>
        ))}
      </div>

      {step === 'idle' && (
        <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-5">
          <div className="space-y-4">
            <Card className="p-5">
              <div className="text-sm font-semibold text-slate-900 mb-3">项目信息</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-[12px] text-slate-500 mb-1.5">项目 / 被审计单位（脱敏）</div>
                  <Input value={`${company} · ${year} 年报审计`} onChange={(e) => setCompany(e.target.value.replace(` · ${year} 年报审计`, ''))} />
                </div>
                <div>
                  <div className="text-[12px] text-slate-500 mb-1.5">会计年度</div>
                  <Input value={year} readOnly />
                </div>
                <div>
                  <div className="text-[12px] text-slate-500 mb-1.5">模式</div>
                  <Input value="一家单位 · 一个会计年度" readOnly />
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">1. 上传账面材料（明细账 / 日记账）</div>
                  <div className="text-[12px] text-slate-500 mt-1">可含全部银行账户 · 需覆盖全年</div>
                </div>
                <Badge tone="green">已加载 1 份</Badge>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">📒</div>
                  <div>
                    <div className="text-sm font-medium text-slate-700">点击选择 或 拖拽账面明细账到此处</div>
                    <div className="text-[12px] text-slate-400 mt-1">Excel（.xlsx / .xls）· 一份即可覆盖多个账户；如软件导出多份也可一起上传</div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">2. 上传银行对账单（每个账户一个文件）</div>
                  <div className="text-[12px] text-slate-500 mt-1">一个银行账户 = 一个 Excel（全年流水）</div>
                </div>
                <Button variant="outline" size="sm" onClick={addBankSlot}><Banknote size={13} /> 添加一个银行账户</Button>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12px] text-amber-800">
                ⚠️ <b>关键约束</b>：每个银行账户请上传 <b>一个</b> 包含 <b>全年（1–12 月）</b> 完整流水的 Excel；不要按月/按季拆成多份，也不要把多个账户混在一个文件里。
              </div>
              <div className="mt-3 space-y-3">
                {banks.map((bank, idx) => (
                  <div key={`${bank.name}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <div className="text-[12px] text-slate-500 mb-1.5">银行名称</div>
                        <Input value={bank.name} readOnly />
                      </div>
                      <div>
                        <div className="text-[12px] text-slate-500 mb-1.5">账户尾号</div>
                        <Input value={bank.tail} readOnly />
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-[12px] text-slate-500 mb-1.5">上传该账户全年对账单（一个 Excel）</div>
                        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-[12px] text-slate-600">
                          {bank.file}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">3. 辅助材料（可选，强烈建议）</div>
                  <div className="text-[12px] text-slate-500 mt-1">用于账户身份配对</div>
                </div>
                <Badge tone={auxLoaded ? 'green' : 'neutral'}>{auxLoaded ? '已加载 3 份' : '未上传'}</Badge>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">📎</div>
                  <div>
                    <div className="text-sm font-medium text-slate-700">货币资金明细表 · 银行账户清单 · 外币汇率/本位币折算表</div>
                    <div className="text-[12px] text-slate-400 mt-1">账户身份配对；如有外币账户，请提供记账本位币与折算汇率（或原币+本位币对照）</div>
                  </div>
                </div>
              </div>
            </Card>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[12px] text-slate-500">已就绪：账面 <b className="text-slate-700">{ledgerLoaded ? 1 : 0}</b> 份 · 对账单账户 <b className="text-slate-700">{totalBankFiles}</b> 个</div>
              <Button variant="primary" onClick={runRecon} disabled={!ready}>
                <Play size={14} /> 开始双向核对
              </Button>
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="text-sm font-semibold text-slate-900">📋 输入要求与约束</div>
            </div>
            <div className="p-4 space-y-4 text-[12px] text-slate-600 leading-6">
              <div>
                <div className="font-medium text-slate-800 mb-1">账面材料</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>格式 Excel（.xlsx / .xls）</li>
                  <li>一份可含全部账户，需覆盖整年</li>
                  <li>应含：日期、摘要、借/贷（或收/付、发生额）、余额、对方单位</li>
                  <li>勿只传截图或汇总表</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-slate-800 mb-1">银行对账单（关键）</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>一个银行账户 = 一个 Excel</li>
                  <li>每个文件含该账户全年 1–12 月完整流水</li>
                  <li>不要按月 / 按季拆成多份；不要多账户混一个文件</li>
                  <li>建议命名：银行简称 + 尾号（如 建行-0202.xlsx）</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-slate-800 mb-1">辅助材料（可选）</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>货币资金明细表 → 账户身份配对</li>
                  <li>银行账户清单 → 核账户是否齐全</li>
                  <li>外币汇率 / 本位币折算表 → 如有外币账户，供原币 ↔ 本位币对齐</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-slate-800 mb-1">范围</div>
                <div>一次核对 = 一家被审单位 · 一个会计年度</div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {step === 'running' && (
        <Card className="p-8">
          <h2 className="text-xl font-semibold text-slate-900">正在进行双向核对…</h2>
          <p className="mt-2 text-sm text-slate-500">账面明细账 ⇄ 银行对账单 · 全量逐笔双向核对 · 自动出审计师底稿</p>
          <div className="mt-5">
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${currentProgress}%` }} />
            </div>
            <div className="mt-2 text-[11px] text-slate-500">当前步骤：{PROGRESS_STEPS[Math.max(0, progressIndex - 1)] || PROGRESS_STEPS[0]}（{currentProgress}%）</div>
          </div>
          <div className="mt-6 space-y-3">
            {PROGRESS_STEPS.map((label, i) => {
              const done = progressIndex > i + 1
              const active = progressIndex === i + 1
              return (
                <div key={label} className="flex items-start gap-3">
                  <div className={cn('h-6 w-6 rounded-full grid place-items-center text-[11px] font-semibold',
                    done ? 'bg-emerald-500 text-white' : active ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600')}>
                    {done ? '✓' : active ? <Loader2 size={12} className="animate-spin" /> : i + 1}
                  </div>
                  <div className="text-[13px] text-slate-700">{label}</div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {step === 'running' && (
        <Card className="p-8">
          <h2 className="text-xl font-semibold text-slate-900">正在进行双向核对…</h2>
          <p className="mt-2 text-sm text-slate-500">账面明细账 ⇄ 银行对账单 · 全量逐笔双向核对 · 自动出审计师底稿</p>
          <div className="mt-5">
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${currentProgress}%` }} />
            </div>
            <div className="mt-2 text-[11px] text-slate-500">当前步骤：{PROGRESS_STEPS[Math.max(0, progressIndex - 1)] || PROGRESS_STEPS[0]}（{currentProgress}%）</div>
          </div>
          <div className="mt-6 space-y-3">
            {PROGRESS_STEPS.map((label, i) => {
              const done = progressIndex > i + 1
              const active = progressIndex === i + 1
              return (
                <div key={label} className="flex items-start gap-3">
                  <div className={cn('h-6 w-6 rounded-full grid place-items-center text-[11px] font-semibold',
                    done ? 'bg-emerald-500 text-white' : active ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600')}>
                    {done ? '✓' : active ? <Loader2 size={12} className="animate-spin" /> : i + 1}
                  </div>
                  <div className="text-[13px] text-slate-700">{label}</div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {step === 'done' && (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] px-2.5 py-1">核对完成</div>
            <h2 className="mt-4 text-xl font-semibold text-slate-900">核对结果 · {company}</h2>
            <p className="mt-2 text-[12px] text-slate-500">会计年度 {year} · 全量逐笔 · 生成时间 {new Date().toLocaleString('zh-CN', { hour12: false })}</p>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
              <span className="text-sm font-medium text-slate-800">银行流水双向核对底稿</span>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => window.open('/cases/bank-recon-result-a.xlsx', '_blank')}>
                  <Download size={13} /> 下载 Excel
                </Button>
              </div>
            </div>
            <BankReconWorkbookPanel xlsxUrl="/cases/bank-recon-result-a.xlsx" />
          </Card>
        </div>
      )}
    </div>
  )
}


type ReconSheet = { name: string; rows: any[][] }

function BankReconWorkbookPanel({ xlsxUrl }: { xlsxUrl: string }) {
  const [sheets, setSheets] = useState<ReconSheet[]>([])
  const [activeSheet, setActiveSheet] = useState('')

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

  const current = sheets.find((s) => s.name === activeSheet) || sheets[0]
  const maxCols = Math.max(0, ...(current?.rows || []).map((r) => r.length))

  return (
    <>
      <div className="px-4 py-2 border-b border-slate-200 flex flex-wrap gap-2 bg-white">
        {sheets.map((sheet) => (
          <button
            key={sheet.name}
            onClick={() => setActiveSheet(sheet.name)}
            className={cn('px-3 py-1 rounded-md text-[12px] border', activeSheet === sheet.name ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
          >
            {sheet.name}
          </button>
        ))}
      </div>
      <div className="overflow-auto max-h-[920px] bg-white">
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
                        'px-2 py-1 align-top whitespace-pre-wrap border-r border-slate-100 min-w-[110px] leading-[1.35]',
                        rIdx < 2 ? 'bg-slate-100 font-semibold text-slate-700' : 'text-slate-700',
                        typeof cell === 'string' && (cell.includes('异常') || cell.includes('待确认') || cell.includes('不一致'))
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
    </>
  )
}

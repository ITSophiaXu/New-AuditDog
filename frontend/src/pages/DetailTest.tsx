import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload, FolderOpen, Loader2, Download, Play,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { zh } from '@/locales/zh'
import DetailTestResultPanel from '@/components/detail-test/DetailTestResultPanel'

type Step = 1 | 2 | 3
const MATERIAL_BUCKETS = [
  { label: '销售合同', count: 5 },
  { label: '报关单', count: 5 },
  { label: '提单', count: 3 },
  { label: '销售发票', count: 5 },
  { label: '发货明细', count: 5 },
  { label: '物流发票', count: 5 },
  { label: '仓库签收单', count: 5 },
  { label: '银行回单', count: 5 },
  { label: '收入/应收明细账', count: 1 },
]

const RUN_STEPS = [
  ['识别分类（9 类单据，判定解析路线）', '77 个文件'],
  ['解析（PDF/Excel/图片 + 视觉精读）', '含 10 张凭证视觉'],
  ['语义理解与字段映射（mapping_plan）', ''],
  ['契约式清洗入库（12 张业务表，缺失进复核队列）', '9,193 条'],
  ['穿透勾稽（9 勾稽点 · 收入 5 项认定）', '5 笔交易'],
  ['异常识别', '8 项发现'],
  ['套用模板生成底稿 Excel', ''],
]

export default function DetailTest() {
  const [step, setStep] = useState<Step>(1)
  const [runningIndex, setRunningIndex] = useState(0)
  const [materialsLoaded, setMaterialsLoaded] = useState(false)
  const [templateLoaded, setTemplateLoaded] = useState(false)
  const [te, setTe] = useState('')
  const [sad, setSad] = useState('')
  const [engagementName, setEngagementName] = useState('XX 服饰股份有限公司 · 2025 年报审计')
  const [txType, setTxType] = useState('外贸销售收入')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const totalFiles = useMemo(() => MATERIAL_BUCKETS.reduce((sum, x) => sum + x.count, 0), [])

  function loadDemo() {
    setMaterialsLoaded(true)
    setTemplateLoaded(true)
  }

  function runTest() {
    setStep(2)
    setRunningIndex(0)
    timers.current.forEach(clearTimeout)
    timers.current = []
    RUN_STEPS.forEach((_, i) => {
      timers.current.push(setTimeout(() => setRunningIndex(i + 1), 900 + i * 700))
    })
    timers.current.push(setTimeout(() => setStep(3), 900 + RUN_STEPS.length * 700 + 300))
  }

  function downloadXlsx() {
    const blob = new Blob(['演示：交易细节测试穿透底稿-BUSEN.xlsx'], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '交易细节测试穿透底稿-BUSEN.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-[1600px] mx-auto px-8 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-xs text-slate-500 mb-1">{zh.nav.detailTest} · 智能底稿工作台</div>
          <h1 className="text-2xl font-semibold text-slate-900">交易细节测试</h1>
        </div>
        <Badge tone="brand" className="ml-2">演示</Badge>
        <div className="ml-auto flex items-center gap-2">
          {step === 3 && (
            <Button variant="outline" onClick={downloadXlsx}>
              <Download size={14} /> 导出底稿
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-[13px]">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-3">
            <div className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1.5 border',
              step === n ? 'border-brand-300 bg-brand-50 text-brand-700' : step > n ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500')}>
              <span className={cn('h-5 w-5 rounded-full grid place-items-center text-[11px] font-semibold',
                step === n ? 'bg-brand-600 text-white' : step > n ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600')}>{n}</span>
              {n === 1 ? '上传材料与模板' : n === 2 ? '运行细节测试' : '底稿与人工待办'}
            </div>
            {n < 3 && <span className="text-slate-300">›</span>}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-sm font-semibold text-slate-900 mb-3">① 基本信息</div>
            <div className="text-[12px] text-slate-500 mb-4">用于命名底稿与留痕。演示已脱敏：仅隐去被审计单位与事务所名称，往来客户/银行/人名如实保留。</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-[12px] text-slate-500 mb-1.5">项目 / 被审计单位（脱敏）</div>
                <Input value={engagementName} onChange={(e) => setEngagementName(e.target.value)} />
              </div>
              <div>
                <div className="text-[12px] text-slate-500 mb-1.5">交易类型</div>
                <select value={txType} onChange={(e) => setTxType(e.target.value)} className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                  <option>外贸销售收入</option>
                  <option>内销收入</option>
                  <option disabled>采购与付款（规划中）</option>
                </select>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="text-sm font-semibold text-slate-900 mb-2">② 上传穿透资料</div>
              <div className="text-[12px] text-slate-500 mb-4">按业务链各环节单据（合同/报关/提单/发票/发货/物流/签收/银行/账），支持 PDF、Excel、图片、扫描件。</div>
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
                <div className="text-3xl mb-2">📁</div>
                <div className="text-sm font-medium text-slate-700">点击选择文件夹 / 拖拽上传</div>
                <div className="text-[12px] text-slate-400 mt-1">识别 9 类单据，自动分流“确定性解析 / 视觉精读”</div>
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="outline" onClick={loadDemo}><FolderOpen size={14} /> 载入演示资料</Button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {MATERIAL_BUCKETS.map((m) => (
                  <div key={m.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] flex items-center justify-between gap-2">
                    <span className="text-slate-700">{m.label}</span>
                    <span className={cn('text-[11px] font-medium', materialsLoaded ? 'text-emerald-600' : 'text-slate-400')}>{materialsLoaded ? `${m.count}` : '—'}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-sm font-semibold text-slate-900 mb-2">③ 上传底稿模板</div>
              <div className="text-[12px] text-slate-500 mb-4">模板驱动：产品先解析你的底稿模板，再据模板反推字段与输出版式。</div>
              <div className={cn('rounded-xl border px-4 py-8 text-center', templateLoaded ? 'border-emerald-300 bg-emerald-50/60' : 'border-dashed border-slate-300 bg-slate-50/60')}>
                <div className="text-3xl mb-2">📄</div>
                <div className="text-sm font-medium text-slate-700">{templateLoaded ? '模板交易细节测试.xlsx ✓' : '点击上传底稿模板（.xlsx）'}</div>
                <div className="text-[12px] text-slate-400 mt-1">{templateLoaded ? '已解析：销售全流程分析（64 列，两级表头）' : '如「合同分析参考列表-外贸」'}</div>
                <div className="mt-4">
                  <Button variant="outline" onClick={() => setTemplateLoaded(true)}><Upload size={14} /> 载入演示模板</Button>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-slate-800">重要性参数</div>
                  <Badge tone="neutral">可选</Badge>
                </div>
                <div className="text-[12px] text-slate-500 mt-2">不填也能出底稿、列差异，由审计师人工判断；填了则自动预标“单笔超 TE / 累计超 SAD”的重大差异。</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  <div>
                    <div className="text-[12px] text-slate-500 mb-1.5">可容忍错误 TE（本位币）</div>
                    <Input value={te} onChange={(e) => setTe(e.target.value)} placeholder="选填，如 500,000" />
                  </div>
                  <div>
                    <div className="text-[12px] text-slate-500 mb-1.5">累积阈值 SAD（本位币）</div>
                    <Input value={sad} onChange={(e) => setSad(e.target.value)} placeholder="选填，如 250,000" />
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={loadDemo}>载入演示数据</Button>
            <Button variant="primary" onClick={runTest} disabled={!materialsLoaded || !templateLoaded}>
              <Play size={14} /> 开始细节测试
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <Card className="p-8">
          <h2 className="text-xl font-semibold text-slate-900">正在进行穿透细节测试…</h2>
          <p className="mt-2 text-sm text-slate-500">全量逐笔、不抽样；每条数据留痕到源文件与位置。</p>
          <div className="mt-6 space-y-3">
            {RUN_STEPS.map(([label, meta], i) => {
              const done = runningIndex > i + 1
              const active = runningIndex === i + 1
              return (
                <div key={label} className="flex items-start gap-3">
                  <div className={cn('h-6 w-6 rounded-full grid place-items-center text-[11px] font-semibold',
                    done ? 'bg-emerald-500 text-white' : active ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600')}>
                    {done ? '✓' : active ? <Loader2 size={12} className="animate-spin" /> : i + 1}
                  </div>
                  <div className="text-[13px] text-slate-700">
                    <div className="font-medium">{label}</div>
                    {meta && <div className="text-[11px] text-slate-400 mt-0.5">{meta}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {step === 3 && (
        <DetailTestResultPanel />
      )}
    </div>
  )
}

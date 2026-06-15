import { useState, useRef } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Upload, Sparkles, Library, FileText, Scale, BookMarked, LayoutTemplate,
  ChevronLeft, ChevronRight, CheckCircle2, FileUp, ClipboardPaste, Wand2,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

type AssetType = 'AuditRule' | 'SpecialAuditCase' | 'PaperTemplate'

const ASSET_TYPES: Array<{
  code: AssetType; label: string; icon: any; blurb: string; tone: 'rose' | 'sky' | 'pink'
}> = [
  { code: 'AuditRule', label: '审计规则', icon: Scale, tone: 'rose',
    blurb: '本所内规、公共法规、行业准则。从 Word / PDF / 粘贴文本中抽取规则编号、名称、严重度。' },
  { code: 'SpecialAuditCase', label: '案例 / 整改建议', icon: BookMarked, tone: 'sky',
    blurb: '历史专项案例、整改建议书、复核记录。抽取案例编号、客户、专项类型、关键风险、结论。' },
  { code: 'PaperTemplate', label: '底稿模板', icon: LayoutTemplate, tone: 'pink',
    blurb: '从 Excel 模板或字段清单中抽取底稿字段，识别类型（金额 / 文本 / 日期）。' },
]

const SAMPLE_TEXT: Record<AssetType, string> = {
  AuditRule:
    `财政部《政府专项资金审计指引》第十二条\n\n` +
    `专项资金账户应实行专款专用管理，资金进出应与立项批复用途逐笔比对。` +
    `严禁将专项资金转入经营性账户。一经发现挪用情形，应立即报送主管部门并出具保留意见。\n\n` +
    `本所执行依据：政府专项类业务执行手册（2025 修订版）第 3.2 条。`,
  SpecialAuditCase:
    `案例摘要 — 2024 年某市基础设施投资有限公司\n` +
    `客户：某市基础设施投资有限公司\n` +
    `专项类型：政府专项资金审计（受市财政局委托）\n` +
    `期间：2023-01 至 2023-12\n\n` +
    `背景：对市轨道交通建设专项资金 4.5 亿元进行专项审计。` +
    `重点关注：(1) 招投标程序合规；(2) 工程款支付真实性；(3) 节余资金处理。\n\n` +
    `结论：识别 3 项中等风险（一项招标资料不齐、一项工程款拨付滞后、一项节余资金未及时上缴），` +
    `出具带强调事项段无保留意见报告，并提出 5 条整改建议。`,
  PaperTemplate:
    `应收账款底稿\n\n` +
    `账面余额：__\n` +
    `函证回函余额：__\n` +
    `差异说明：__\n` +
    `账龄分布（1 年内 / 1-2 年 / 2-3 年 / 3 年以上）：__\n` +
    `坏账准备：__\n` +
    `审计程序执行情况：__\n` +
    `审计结论：__`,
}

export default function IntakeWizard() {
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const initial = (search.get('type') as AssetType) || 'AuditRule'
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [assetType, setAssetType] = useState<AssetType>(initial)
  const [content, setContent] = useState<string>('')
  const [filename, setFilename] = useState<string>('')
  const [parsing, setParsing] = useState(false)
  const [rows, setRows] = useState<any[]>([])
  const [parseInfo, setParseInfo] = useState<{ chars: number; source: string; demo: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function onPickFile(file: File) {
    setFilename(file.name)
    // For prototype: read as text. xlsx / docx / pdf parsing is a v2 item.
    const text = await file.text().catch(() => '')
    setContent(text)
  }

  async function parse() {
    if (!content.trim()) return
    setParsing(true)
    try {
      const r = await fetch('/api/intake/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_type: assetType, content, filename: filename || undefined }),
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      setRows(data.rows)
      setParseInfo({ chars: data.raw_chars, source: data.source_label, demo: data.demo })
      setStep(3)
    } finally {
      setParsing(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const r = await fetch('/api/intake/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_type: assetType, rows }),
      })
      const data = await r.json()
      setSavedCount(data.count)
      qc.invalidateQueries()
      setStep(4)
    } finally {
      setSaving(false)
    }
  }

  const meta = ASSET_TYPES.find((a) => a.code === assetType)!

  return (
    <div className="max-w-5xl mx-auto px-8 py-7 space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/knowledge" className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
          <ChevronLeft size={12} /> 返回知识库
        </Link>
        <Stepper current={step} />
      </div>

      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-brand-600 text-white grid place-items-center">
          <Wand2 size={22} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">知识接入向导</h1>
          <p className="text-sm text-slate-500 mt-1">
            把事务所多年沉淀的 模板 / 规则 / 案例 一次性接入本体 —— 上传文件或粘贴文本，AI 自动抽取结构化字段，人工复核后加入知识库。
          </p>
        </div>
      </div>

      {/* Step 1: pick asset type */}
      {step === 1 && (
        <div className="grid grid-cols-3 gap-4">
          {ASSET_TYPES.map((a) => {
            const sel = a.code === assetType
            const I = a.icon
            return (
              <Card
                key={a.code}
                className={cn(
                  'p-5 cursor-pointer transition-all',
                  sel ? 'border-brand-400 ring-1 ring-brand-200 shadow-sm' : 'hover:border-brand-200 hover:shadow-sm',
                )}
                onClick={() => setAssetType(a.code)}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'h-10 w-10 rounded-lg grid place-items-center shrink-0',
                    a.tone === 'rose' && 'bg-rose-50 text-rose-700',
                    a.tone === 'sky' && 'bg-sky-50 text-sky-700',
                    a.tone === 'pink' && 'bg-pink-50 text-pink-700',
                  )}>
                    <I size={18} />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900">{a.label}</div>
                    <div className="text-xs text-slate-500 mt-1 leading-relaxed">{a.blurb}</div>
                  </div>
                  {sel && <CheckCircle2 size={16} className="text-brand-600" />}
                </div>
              </Card>
            )
          })}
          <div className="col-span-3 flex justify-end">
            <Button variant="primary" onClick={() => setStep(2)}>
              下一步：选择来源 <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: source */}
      {step === 2 && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-lg bg-slate-100 text-slate-700 grid place-items-center"><FileUp size={16} /></div>
              <div>
                <div className="text-sm font-semibold text-slate-900">上传文件</div>
                <div className="text-[11px] text-slate-500">.txt / .csv 直接读取；.xlsx / .docx / .pdf 即将支持</div>
              </div>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-brand-400 hover:bg-brand-50/30 transition-colors"
            >
              <Upload size={24} className="mx-auto text-slate-400 mb-2" />
              <div className="text-sm text-slate-700">{filename ? <span className="font-mono">{filename}</span> : '点击选择文件'}</div>
              <div className="text-[11px] text-slate-400 mt-1">{filename ? `${content.length} 字符已读取` : ''}</div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv,.xlsx,.docx,.pdf"
              className="hidden"
              onChange={(e) => e.target.files && onPickFile(e.target.files[0])}
            />
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-lg bg-slate-100 text-slate-700 grid place-items-center"><ClipboardPaste size={16} /></div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">粘贴文本</div>
                <div className="text-[11px] text-slate-500">从 Word / 网页 / 邮件复制</div>
              </div>
              <button
                onClick={() => setContent(SAMPLE_TEXT[assetType])}
                className="text-[11px] text-brand-600 hover:text-brand-700"
              >
                填入示例
              </button>
            </div>
            <Textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); setFilename('') }}
              rows={10}
              placeholder={`粘贴 ${meta.label} 原文…`}
              className="font-mono text-xs"
            />
            <div className="mt-2 text-[11px] text-slate-400">{content.length} 字符</div>
          </Card>

          <div className="col-span-2 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}><ChevronLeft size={14} /> 上一步</Button>
            <Button
              variant="primary"
              disabled={!content.trim() || parsing}
              onClick={parse}
            >
              <Sparkles size={14} />
              {parsing ? 'AI 解析中…' : 'AI 解析'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: review */}
      {step === 3 && (
        <div className="space-y-4">
          <Card className="p-4 bg-brand-50/40 border-brand-200">
            <div className="flex items-center gap-3">
              <Sparkles size={16} className="text-brand-600" />
              <div className="text-sm text-slate-700 flex-1">
                <span className="font-medium">AI 抽取完成 — 共 {rows.length} 条</span>
                <span className="text-slate-500 ml-2">来源 {parseInfo?.source} · 原文 {parseInfo?.chars} 字</span>
                {parseInfo?.demo && <Badge tone="amber" className="ml-2">演示模式</Badge>}
              </div>
              <Badge tone="brand">{meta.label}</Badge>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            {/* Raw on left */}
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                <FileText size={11} /> 原文
              </div>
              <div className="bg-slate-50 rounded-md p-3 text-xs text-slate-700 font-mono whitespace-pre-wrap max-h-[460px] overflow-y-auto">
                {content}
              </div>
            </Card>
            {/* Parsed rows on right */}
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                <Library size={11} /> 抽取结果（可编辑）
              </div>
              <div className="space-y-3 max-h-[460px] overflow-y-auto">
                {rows.map((row, i) => (
                  <RowEditor key={i} row={row} onChange={(r) => setRows(rows.map((x, j) => (j === i ? r : x)))} assetType={assetType} />
                ))}
              </div>
            </Card>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}><ChevronLeft size={14} /> 重新选择来源</Button>
            <Button variant="primary" disabled={saving || rows.length === 0} onClick={save}>
              {saving ? '保存中…' : `加入知识库（${rows.length}）`}
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: done */}
      {step === 4 && (
        <Card className="p-10 text-center">
          <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center mx-auto">
            <CheckCircle2 size={28} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mt-4">已加入知识库</h2>
          <p className="text-sm text-slate-500 mt-2">
            {savedCount} 条 {meta.label} 已写入本体，可在「{meta.label}」标签页查看。
          </p>
          <div className="flex justify-center gap-3 mt-6">
            <Button variant="outline" onClick={() => navigate('/knowledge')}>返回知识库</Button>
            <Button variant="primary" onClick={() => {
              setStep(1); setRows([]); setContent(''); setFilename(''); setSavedCount(null)
            }}>
              继续接入下一条
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  const steps = ['选择类型', '选择来源', 'AI 解析与复核', '保存完成']
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const n = i + 1
        const active = n === current
        const done = n < current
        return (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              'h-6 w-6 rounded-full grid place-items-center text-[11px] font-semibold',
              done ? 'bg-emerald-500 text-white' :
              active ? 'bg-brand-600 text-white' :
              'bg-slate-200 text-slate-500',
            )}>
              {done ? '✓' : n}
            </div>
            <span className={cn('text-xs', active ? 'text-slate-900 font-medium' : 'text-slate-500')}>{s}</span>
            {n < steps.length && <ChevronRight size={12} className="text-slate-300 mx-1" />}
          </div>
        )
      })}
    </div>
  )
}

function RowEditor({ row, onChange, assetType }: { row: any; onChange: (r: any) => void; assetType: AssetType }) {
  const fields: Array<{ code: string; label: string; type?: 'text' | 'long' }> = (
    assetType === 'AuditRule' ? [
      { code: 'code', label: '编号' },
      { code: 'name', label: '名称' },
      { code: 'category', label: '类别' },
      { code: 'severity', label: '严重度' },
      { code: 'issuer', label: '出处' },
      { code: 'expression', label: '表达式 / 说明', type: 'long' },
    ] : assetType === 'PaperTemplate' ? [
      { code: 'code', label: '编号' },
      { code: 'name', label: '模板名' },
      { code: 'scenario', label: '适用场景' },
    ] : [
      { code: 'case_no', label: '案例编号' },
      { code: 'client_name', label: '客户' },
      { code: 'special_type', label: '专项类型' },
      { code: 'period', label: '期间' },
      { code: 'focus_points', label: '关键关注点', type: 'long' },
      { code: 'conclusion', label: '结论', type: 'long' },
    ]
  )
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Badge tone="brand">AI 抽取</Badge>
        {row.code && <span className="text-[10px] font-mono text-slate-500">{row.code}</span>}
      </div>
      {fields.map((f) => (
        <div key={f.code}>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">{f.label}</label>
          {f.type === 'long' ? (
            <Textarea
              value={row[f.code] ?? ''}
              onChange={(e) => onChange({ ...row, [f.code]: e.target.value })}
              rows={2}
              className="text-xs"
            />
          ) : (
            <Input
              value={row[f.code] ?? ''}
              onChange={(e) => onChange({ ...row, [f.code]: e.target.value })}
              className="!h-8 text-xs"
            />
          )}
        </div>
      ))}
      {assetType === 'PaperTemplate' && Array.isArray(row.fields) && (
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">字段（{row.fields.length}）</label>
          <div className="flex flex-wrap gap-1 mt-1">
            {row.fields.map((fld: any) => (
              <span key={fld.code} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                {fld.label} · {fld.type}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

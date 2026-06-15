import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  Upload, FileSpreadsheet, Sparkles, ChevronRight, Wand2, Trash2, Plus,
  CheckCircle2, AlertTriangle, LayoutTemplate, ArrowLeft, ClipboardPaste,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import type { InferredField, InferredRule } from '@/lib/types'

type Step = 'upload' | 'editing' | 'saved'

const TYPE_OPTIONS: Array<{ value: InferredField['type']; label: string }> = [
  { value: 'string', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'money', label: '金额' },
  { value: 'text', label: '长文本' },
  { value: 'date', label: '日期' },
  { value: 'boolean', label: '是/否' },
]

const SOURCE_KINDS: Array<{ value: InferredField['source']['kind']; label: string }> = [
  { value: 'manual', label: '手工填写' },
  { value: 'tb_account', label: '试算平衡表 (TB 科目)' },
  { value: 'computed', label: '公式计算' },
  { value: 'evidence', label: '上传 / 外部证据' },
]

export default function TemplateUpload() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [filename, setFilename] = useState('')
  const [sheetName, setSheetName] = useState('')
  const [inferring, setInferring] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Inferred + editable state
  const [tplName, setTplName] = useState('')
  const [tplCode, setTplCode] = useState('')
  const [scenario, setScenario] = useState('底稿填写')
  const [fields, setFields] = useState<InferredField[]>([])
  const [rules, setRules] = useState<InferredRule[]>([])
  const [keepRules, setKeepRules] = useState<Set<number>>(new Set())

  async function handleFile(file: File) {
    setErrorMsg('')
    setFilename(file.name)
    setInferring(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const firstSheet = wb.SheetNames[0]
      setSheetName(firstSheet)
      const sheet = wb.Sheets[firstSheet]
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

      const resp = await api.inferTemplateFromSheet({
        sheet_name: firstSheet,
        rows,
        filename: file.name,
      })

      setTplName(resp.name)
      setTplCode(resp.code)
      setScenario(resp.scenario)
      setFields(resp.fields)
      setRules(resp.inferred_rules)
      setKeepRules(new Set(resp.inferred_rules.map((_, i) => i)))
      setStep('editing')
    } catch (e: any) {
      setErrorMsg(e?.message || '解析失败')
    } finally {
      setInferring(false)
    }
  }

  const save = useMutation({
    mutationFn: () => api.saveTemplate({
      code: tplCode,
      name: tplName,
      scenario,
      fields: fields.map((f) => ({ ...f, ai_guess: false })),
      save_rules: rules.filter((_, i) => keepRules.has(i)),
    }),
    onSuccess: () => {
      qc.invalidateQueries()
      setStep('saved')
    },
  })

  // ---------- Upload step ----------
  if (step === 'upload') {
    return (
      <div className="h-full bg-slate-50/40 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
          <button onClick={() => nav(-1)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
            <ArrowLeft size={12} /> 返回
          </button>

          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-pink-100 text-pink-700 grid place-items-center shrink-0">
              <LayoutTemplate size={22} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">从 Excel 创建底稿模板</h1>
              <p className="text-sm text-slate-500 mt-1">
                拖入一份现有的底稿 .xlsx, AI 会自动识别列、推断字段类型与取数来源, 并猜测可能的校验规则。
                你只需要确认 / 调整, 不需要任何代码。
              </p>
            </div>
          </div>

          <Card className="p-8">
            <label
              onDragOver={(e) => { e.preventDefault() }}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files?.[0]
                if (f) handleFile(f)
              }}
              className="block border-2 border-dashed border-slate-300 rounded-xl p-12 text-center hover:border-brand-400 hover:bg-brand-50/30 cursor-pointer transition-colors"
            >
              <Upload size={36} className="mx-auto text-slate-400 mb-3" />
              <div className="text-base font-medium text-slate-900">拖入 .xlsx 文件</div>
              <div className="text-xs text-slate-500 mt-1">或点击选择文件 — 支持 .xlsx / .xls / .csv</div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <Button
                variant="primary" size="md" className="mt-4"
                onClick={(e) => { e.preventDefault(); fileRef.current?.click() }}
              >
                <Upload size={14} /> 选择文件
              </Button>
            </label>

            {inferring && (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                <Sparkles size={14} className="text-brand-600 animate-pulse" />
                AI 正在解析「{filename}」…
              </div>
            )}
            {errorMsg && (
              <div className="mt-4 flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                <AlertTriangle size={14} /> {errorMsg}
              </div>
            )}
          </Card>

          <div className="text-xs text-slate-500 flex items-center gap-2">
            <ClipboardPaste size={12} />
            <span>没有 Excel? </span>
            <button onClick={() => nav('/knowledge/intake?type=PaperTemplate')} className="text-brand-700 underline">
              粘贴文本创建模板
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---------- Saved success ----------
  if (step === 'saved') {
    return (
      <div className="h-full bg-slate-50/40 grid place-items-center">
        <Card className="p-10 max-w-md text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
          <div className="text-lg font-semibold text-slate-900">模板已保存</div>
          <div className="text-sm text-slate-500 mt-1">
            「{tplName}」已加入模板库 · 包含 {fields.length} 个字段
            {keepRules.size > 0 ? ` · ${keepRules.size} 条规则` : ''}
          </div>
          <div className="mt-5 flex gap-2 justify-center">
            <Button variant="outline" onClick={() => { setStep('upload'); setFilename(''); setFields([]); setRules([]) }}>
              再传一份
            </Button>
            <Button variant="primary" onClick={() => nav('/workbench')}>
              去工作台试用 <ChevronRight size={14} />
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // ---------- Editing step ----------
  return (
    <div className="h-full bg-slate-50/40 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-700 grid place-items-center shrink-0">
            <FileSpreadsheet size={22} />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-slate-900">确认 AI 解析结果</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              来源：{filename} · 工作表 {sheetName} · 共识别 {fields.length} 个字段
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('upload')}>重新上传</Button>
            <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? '保存中…' : '保存模板'}
            </Button>
          </div>
        </div>

        {/* Top header inputs */}
        <Card className="p-4 grid grid-cols-3 gap-4">
          <div>
            <div className="text-[11px] text-slate-500 mb-1">模板名称</div>
            <Input value={tplName} onChange={(e) => setTplName(e.target.value)} />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 mb-1">模板编号</div>
            <Input value={tplCode} onChange={(e) => setTplCode(e.target.value)} className="font-mono" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 mb-1">适用场景</div>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option>底稿填写</option>
              <option>方案生成</option>
              <option>异常分析</option>
              <option>专项审计</option>
            </select>
          </div>
        </Card>

        {/* Fields spreadsheet-style editor */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Wand2 size={14} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">字段</h2>
            <Badge tone="neutral" className="ml-1">{fields.length}</Badge>
            <span className="ml-auto text-[11px] text-amber-700 inline-flex items-center gap-1">
              <Sparkles size={11} /> 标黄的是 AI 推测, 请确认或修改
            </span>
          </div>
          <Card>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 text-[11px]">
                <tr>
                  <th className="text-left px-3 py-2 font-medium w-12">#</th>
                  <th className="text-left px-3 py-2 font-medium">字段名 (中文)</th>
                  <th className="text-left px-3 py-2 font-medium w-32">类型</th>
                  <th className="text-left px-3 py-2 font-medium w-64">数据来源 (AI 猜)</th>
                  <th className="text-center px-3 py-2 font-medium w-16">必填</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fields.map((f, idx) => (
                  <tr key={idx} className={cn(f.ai_guess && 'bg-amber-50/30')}>
                    <td className="text-center text-slate-400 text-[10px]">{idx + 1}</td>
                    <td className="px-2 py-1">
                      <Input
                        value={f.label}
                        onChange={(e) => setFields(fields.map((x, i) => i === idx ? { ...x, label: e.target.value, ai_guess: false } : x))}
                        className="!h-7 !text-xs"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={f.type}
                        onChange={(e) => setFields(fields.map((x, i) => i === idx ? { ...x, type: e.target.value as any, ai_guess: false } : x))}
                        className="w-full h-7 px-2 text-xs bg-white border border-slate-200 rounded"
                      >
                        {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex gap-1 items-center">
                        <select
                          value={f.source.kind}
                          onChange={(e) => setFields(fields.map((x, i) => i === idx
                            ? { ...x, source: { ...x.source, kind: e.target.value as any }, ai_guess: false }
                            : x))}
                          className="h-7 px-2 text-xs bg-white border border-slate-200 rounded"
                        >
                          {SOURCE_KINDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        {f.source.kind === 'tb_account' && (
                          <Input
                            placeholder="科目"
                            value={f.source.account_code || ''}
                            onChange={(e) => setFields(fields.map((x, i) => i === idx
                              ? { ...x, source: { ...x.source, account_code: e.target.value }, ai_guess: false }
                              : x))}
                            className="!h-7 !text-xs w-20"
                          />
                        )}
                      </div>
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={!!f.required}
                        onChange={(e) => setFields(fields.map((x, i) => i === idx ? { ...x, required: e.target.checked } : x))}
                        className="accent-brand-600"
                      />
                    </td>
                    <td className="text-center">
                      <button
                        onClick={() => setFields(fields.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-3 border-t border-slate-100">
              <Button
                variant="outline" size="sm"
                onClick={() => setFields([...fields, {
                  code: `f_${Math.random().toString(36).slice(2, 6)}`,
                  label: '新字段',
                  type: 'string',
                  source: { kind: 'manual', label: '手工填写' },
                  required: false,
                  ai_guess: false,
                }])}
              >
                <Plus size={12} /> 加字段
              </Button>
            </div>
          </Card>
        </div>

        {/* Inferred rules */}
        {rules.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-amber-600" />
              <h2 className="text-sm font-semibold text-slate-900">AI 推断的审计规则</h2>
              <span className="text-[11px] text-slate-500">勾选你认可的规则, 保存模板时一并入库</span>
            </div>
            <div className="space-y-1.5">
              {rules.map((r, i) => (
                <label
                  key={i}
                  className={cn(
                    'flex items-start gap-3 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors',
                    keepRules.has(i)
                      ? 'border-brand-300 bg-brand-50/50'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={keepRules.has(i)}
                    onChange={(e) => {
                      const next = new Set(keepRules)
                      if (e.target.checked) next.add(i); else next.delete(i)
                      setKeepRules(next)
                    }}
                    className="mt-1 accent-brand-600"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                      {r.name}
                      <Badge tone={r.severity === 'high' ? 'rose' : r.severity === 'medium' ? 'amber' : 'neutral'}>
                        {r.severity === 'high' ? '严重' : r.severity === 'medium' ? '警告' : '提示'}
                      </Badge>
                      <Badge tone="neutral">{r.category}</Badge>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{r.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowRight, BookOpenCheck, Building2, Check, CheckCircle2,
  ClipboardCheck, FileArchive, FileSpreadsheet, FolderUp, Loader2, Play,
  Save, Sparkles, UploadCloud,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { AnnualAuditProjectPayload } from '@/lib/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

const STEPS = [
  { label: '项目', desc: '被审单位与期间', icon: Building2 },
  { label: '资料', desc: '账套与 PBC', icon: FolderUp },
  { label: '计划', desc: '准则与重要性', icon: BookOpenCheck },
  { label: '执行', desc: '确认并运行', icon: Play },
]

const DEFAULT_FORM: AnnualAuditProjectPayload = {
  client_name: '',
  year: 2025,
  period_start: '2025-01-01',
  period_end: '2025-12-31',
  industry: '',
  credit_code: '',
  accounting_standard: '企业会计准则',
  report_framework: '年度财务报表审计',
  materiality_basis: '营业收入',
  pm: 100000,
  te: 75000,
  trivial_threshold: 5000,
  audit_strategy: '综合审计策略',
  first_year: false,
  partner: '',
  manager: '',
  preparer: '',
  reviewer: '',
  report_date: '2026-04-30',
  notes: '',
  use_demo_data: false,
}

const SAMPLE_ACCOUNT_FILES = [
  'input_tb.xlsx · 试算平衡表',
  'input_aux.xlsx · 辅助核算明细',
  'input_vouchers.xlsx · 12,620 笔序时账',
]

const SAMPLE_PBC_FILES = [
  '营业执照及公司章程',
  '2024 年审计报告',
  '银行对账单及函证回函',
  '应收账款账龄及函证清单',
  '固定资产卡片',
  '管理层财务报表',
]

type BusyState = 'saving' | 'running' | null

export default function AnnualAuditProjectSetup() {
  const { projectCode } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const isEdit = !!projectCode
  const requestedStep = Math.min(Math.max(Number(searchParams.get('step') || 0), 0), STEPS.length - 1)
  const [step, setStep] = useState(requestedStep)
  const [form, setForm] = useState<AnnualAuditProjectPayload>(DEFAULT_FORM)
  const [accountFiles, setAccountFiles] = useState<File[]>([])
  const [supplementaryFiles, setSupplementaryFiles] = useState<File[]>([])
  const [busy, setBusy] = useState<BusyState>(null)
  const [error, setError] = useState('')
  const [activity, setActivity] = useState<string[]>([])
  const [loadedProject, setLoadedProject] = useState(false)

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ['annual-audit-project', projectCode],
    queryFn: () => api.getAnnualAuditProject(projectCode!),
    enabled: isEdit,
  })

  useEffect(() => {
    if (!snapshot || loadedProject) return
    const data = snapshot.project.data as Partial<AnnualAuditProjectPayload>
    setForm((current) => ({
      ...current,
      ...data,
      client_name: data.client_name || snapshot.project.display_name.replace(/\s+\d{4}年度审计$/, ''),
      year: Number(data.year || current.year),
      pm: Number(data.pm || current.pm),
      te: Number(data.te || current.te),
      trivial_threshold: Number(data.trivial_threshold || current.trivial_threshold),
      use_demo_data: Boolean(data.use_demo_data),
    }))
    setLoadedProject(true)
  }, [snapshot, loadedProject])

  useEffect(() => {
    setStep(requestedStep)
  }, [requestedStep])

  const existingAccountFiles = snapshot?.metrics.account_set_files || 0
  const existingSupplementaryFiles = snapshot?.metrics.supplementary_files || 0

  const readiness = useMemo(() => {
    const accountReady = form.use_demo_data || accountFiles.length > 0 || existingAccountFiles > 0
    const planningReady = form.pm > form.te && form.te > form.trivial_threshold
    return { accountReady, planningReady, ready: accountReady && planningReady && !!form.client_name }
  }, [form, accountFiles.length, existingAccountFiles])

  function setField<K extends keyof AnnualAuditProjectPayload>(
    key: K,
    value: AnnualAuditProjectPayload[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function loadJiangsuDawang() {
    setForm({
      client_name: '江苏大王通风机械有限公司',
      year: 2025,
      period_start: '2025-01-01',
      period_end: '2025-12-31',
      industry: '通用设备制造业',
      credit_code: '',
      accounting_standard: '企业会计制度（财会〔2000〕25号）',
      report_framework: '年度财务报表审计',
      materiality_basis: '营业收入',
      pm: 125000,
      te: 93750,
      trivial_threshold: 6250,
      audit_strategy: '纯实质性程序为主，重点关注收入截止、借款续贷和受限资金',
      first_year: false,
      partner: '项目合伙人',
      manager: '项目经理',
      preparer: '年审Agent',
      reviewer: '项目经理',
      report_date: '2026-04-30',
      notes: '使用江苏大王真实试点数据演示从账套解析到报表附注输出的完整年审流程。',
      use_demo_data: true,
    })
    setAccountFiles([])
    setSupplementaryFiles([])
    setError('')
  }

  function validateCurrentStep() {
    if (step === 0) {
      if (!form.client_name.trim()) return '请输入被审计单位名称'
      if (!form.period_start || !form.period_end) return '请选择完整审计期间'
      if (form.period_start > form.period_end) return '审计期间开始日不能晚于结束日'
    }
    if (step === 1 && !readiness.accountReady) {
      return '请上传账套数据，或载入江苏大王样例数据'
    }
    if (step === 2) {
      if (!form.accounting_standard) return '请选择适用会计准则'
      if (!(form.pm > form.te && form.te > form.trivial_threshold)) {
        return '重要性金额应满足 PM > TE > 明显微小金额'
      }
    }
    return ''
  }

  function nextStep() {
    const message = validateCurrentStep()
    if (message) {
      setError(message)
      return
    }
    goToStep(Math.min(step + 1, STEPS.length - 1))
  }

  function goToStep(nextStep: number) {
    setStep(nextStep)
    const next = new URLSearchParams(searchParams)
    next.set('step', String(nextStep))
    setSearchParams(next, { replace: true })
  }

  async function persist(runWorkflow: boolean) {
    const message = validateCurrentStep()
    if (message) {
      setError(message)
      return
    }
    if (!readiness.ready) {
      setError('项目资料或计划参数尚未完成')
      return
    }
    const overwriteExisting = Boolean(
      runWorkflow && isEdit && (snapshot?.metrics.ai_filled_papers || 0) > 0,
    )
    if (
      overwriteExisting
      && !window.confirm('重新执行将覆盖 Agent 已生成的底稿内容。审计师已手工修改的内容也会被重建，是否继续？')
    ) {
      return
    }
    setBusy(runWorkflow ? 'running' : 'saving')
    setError('')
    setActivity([])
    try {
      let code = projectCode
      let currentSnapshot = snapshot
      if (code) {
        setActivity((items) => [...items, '保存项目参数与职业判断'])
        const { use_demo_data: _demo, ...updates } = form
        currentSnapshot = await api.updateAnnualAuditProject(code, updates)
      } else {
        setActivity((items) => [...items, '创建年审项目与标准底稿目录'])
        currentSnapshot = await api.createAnnualAuditProject(form)
        code = String(currentSnapshot.project.data.code)
      }

      if (accountFiles.length > 0) {
        setActivity((items) => [...items, `上传并归档 ${accountFiles.length} 个账套文件`])
        const uploaded = await api.uploadAnnualAuditMaterials(code!, 'account_set', accountFiles)
        currentSnapshot = uploaded.project
      }
      if (supplementaryFiles.length > 0) {
        setActivity((items) => [...items, `上传并索引 ${supplementaryFiles.length} 个客户补充材料`])
        const uploaded = await api.uploadAnnualAuditMaterials(code!, 'supplementary', supplementaryFiles)
        currentSnapshot = uploaded.project
      }

      await qc.invalidateQueries({ queryKey: ['objects', 'Engagement'] })
      await qc.invalidateQueries({ queryKey: ['objects', 'WorkingPaper'] })
      await qc.invalidateQueries({ queryKey: ['annual-audit-project', code] })

      if (runWorkflow) {
        setActivity((items) => [
          ...items,
          '执行计划与风险评估',
          '执行各科目审计并生成审定表、明细表和账龄',
          '生成财务报表、附注与人工待办',
        ])
        const result = await api.runAnnualAudit(code!, overwriteExisting)
        await qc.invalidateQueries()
        if (result.first_paper_id) {
          navigate(`/workbench/${result.first_paper_id}?sheet=summary`)
        } else {
          navigate(`/workbench?eng=${encodeURIComponent(code!)}`)
        }
      } else {
        navigate('/annual-audit', { replace: true })
      }
    } catch (err: any) {
      setError(err?.message || '项目保存失败')
    } finally {
      setBusy(null)
    }
  }

  if (isEdit && isLoading) {
    return <div className="h-full grid place-items-center text-sm text-slate-500"><Loader2 className="animate-spin mr-2" />载入项目…</div>
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-6xl mx-auto px-8 py-7 space-y-5">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/annual-audit')}
            className="mt-1 h-9 w-9 rounded-lg border border-slate-200 bg-white grid place-items-center text-slate-500 hover:text-slate-900 hover:border-slate-300"
            title="返回"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Badge tone="brand">ANNUAL AUDIT AGENT</Badge>
              {form.use_demo_data && <Badge tone="amber"><Sparkles size={10} /> 江苏大王样例</Badge>}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2">
              {isEdit ? '年审项目设置' : '创建年审项目'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              从项目立项、账套与 PBC 上传、计划确认，到全科目底稿、财务报表和附注一次跑通。
            </p>
          </div>
          {!isEdit && (
            <Button variant="outline" onClick={loadJiangsuDawang}>
              <Sparkles size={15} className="text-amber-500" /> 载入江苏大王样例
            </Button>
          )}
        </div>

        <Card className="p-2">
          <div className="grid grid-cols-4">
            {STEPS.map((item, index) => {
              const Icon = item.icon
              const done = index < step
              const active = index === step
              return (
                <button
                  key={item.label}
                  onClick={() => index <= step && goToStep(index)}
                  className={cn(
                    'relative flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors',
                    active && 'bg-brand-50',
                    index <= step ? 'cursor-pointer' : 'cursor-default',
                  )}
                >
                  <div className={cn(
                    'h-9 w-9 rounded-full grid place-items-center border',
                    done && 'bg-emerald-500 border-emerald-500 text-white',
                    active && 'bg-brand-600 border-brand-600 text-white',
                    !done && !active && 'bg-white border-slate-200 text-slate-400',
                  )}>
                    {done ? <Check size={15} /> : <Icon size={15} />}
                  </div>
                  <div>
                    <div className={cn('text-sm font-semibold', active ? 'text-brand-900' : 'text-slate-700')}>
                      {index + 1}. {item.label}
                    </div>
                    <div className="text-[11px] text-slate-500">{item.desc}</div>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className="absolute right-0 top-1/2 w-px h-8 -translate-y-1/2 bg-slate-200" />
                  )}
                </button>
              )
            })}
          </div>
        </Card>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <Card className="overflow-hidden">
          {step === 0 && (
            <section>
              <SectionHeader
                eyebrow="STEP 1 · ENGAGEMENT"
                title="项目立项信息"
                desc="这些字段将进入底稿抬头、审计计划、报表和归档清单。"
              />
              <div className="p-6 grid grid-cols-2 gap-5">
                <Field label="被审计单位名称" required className="col-span-2">
                  <input value={form.client_name} onChange={(e) => setField('client_name', e.target.value)} placeholder="营业执照或审计报告使用的全称" />
                </Field>
                <Field label="所属行业">
                  <input value={form.industry} onChange={(e) => setField('industry', e.target.value)} placeholder="例如：通用设备制造业" />
                </Field>
                <Field label="统一社会信用代码">
                  <input value={form.credit_code} onChange={(e) => setField('credit_code', e.target.value)} placeholder="18 位代码" />
                </Field>
                <Field label="审计期间开始日" required>
                  <input type="date" value={form.period_start} onChange={(e) => setField('period_start', e.target.value)} />
                </Field>
                <Field label="审计期间结束日" required>
                  <input type="date" value={form.period_end} onChange={(e) => {
                    const end = e.target.value
                    setField('period_end', end)
                    if (end) setField('year', Number(end.slice(0, 4)))
                  }} />
                </Field>
                <Field label="计划报告日">
                  <input type="date" value={form.report_date} onChange={(e) => setField('report_date', e.target.value)} />
                </Field>
                <Field label="业务类型">
                  <select value={form.report_framework} onChange={(e) => setField('report_framework', e.target.value)}>
                    <option>年度财务报表审计</option>
                    <option>首次公开发行审计</option>
                    <option>集团财务报表审计</option>
                  </select>
                </Field>
                <label className="col-span-2 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={form.first_year}
                    onChange={(e) => setField('first_year', e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <strong className="block text-sm text-slate-800">首次承接审计</strong>
                    <span className="text-xs text-slate-500">启用期初余额、前任沟通和比较数据专项程序。</span>
                  </span>
                </label>
              </div>
            </section>
          )}

          {step === 1 && (
            <section>
              <SectionHeader
                eyebrow="STEP 2 · DATA & PBC"
                title="上传账套和客户补充材料"
                desc="账套是数值真相源；合同、函证、盘点、工商与报告资料作为审计证据进入各科目任务。"
              />
              <div className="p-6 grid grid-cols-2 gap-5">
                <UploadBox
                  title="账套数据"
                  hint="必需 · 支持 XLSX / XLS / XLSM / CSV / ZIP"
                  icon={FileSpreadsheet}
                  files={accountFiles}
                  existingCount={existingAccountFiles}
                  sampleFiles={form.use_demo_data ? SAMPLE_ACCOUNT_FILES : []}
                  onFiles={setAccountFiles}
                />
                <UploadBox
                  title="客户补充材料"
                  hint="营业执照、合同、函证、盘点表、上年报告等"
                  icon={FileArchive}
                  files={supplementaryFiles}
                  existingCount={existingSupplementaryFiles}
                  sampleFiles={form.use_demo_data ? SAMPLE_PBC_FILES : []}
                  onFiles={setSupplementaryFiles}
                />
                <div className="col-span-2 rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <div className="text-sm font-semibold text-sky-900">上传后系统会做什么</div>
                  <div className="grid grid-cols-4 gap-3 mt-3">
                    {['文件分类与版本留痕', '账套科目与审计科目映射', '资料缺口识别', '证据关联到科目底稿'].map((text, index) => (
                      <div key={text} className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs text-sky-800">
                        <span className="font-mono text-sky-500 mr-1">{String(index + 1).padStart(2, '0')}</span>{text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <SectionHeader
                eyebrow="STEP 3 · AUDIT PLAN"
                title="确认准则、重要性和审计策略"
                desc="系统提供建议值，但最终参数必须由审计师确认并保留职业判断。"
              />
              <div className="p-6 grid grid-cols-3 gap-5">
                <Field label="适用会计准则" required className="col-span-2">
                  <select value={form.accounting_standard} onChange={(e) => setField('accounting_standard', e.target.value)}>
                    <option>企业会计准则</option>
                    <option>小企业会计准则（财会〔2013〕17号）</option>
                    <option>企业会计制度（财会〔2000〕25号）</option>
                    <option>其他财务报告编制基础</option>
                  </select>
                </Field>
                <Field label="重要性基准" required>
                  <select value={form.materiality_basis} onChange={(e) => setField('materiality_basis', e.target.value)}>
                    <option>营业收入</option>
                    <option>资产总额</option>
                    <option>净资产</option>
                    <option>税前利润</option>
                    <option>综合判断</option>
                  </select>
                </Field>
                <MoneyField label="整体重要性 PM" value={form.pm} onChange={(value) => setField('pm', value)} />
                <MoneyField label="执行重要性 TE" value={form.te} onChange={(value) => setField('te', value)} />
                <MoneyField label="明显微小金额" value={form.trivial_threshold} onChange={(value) => setField('trivial_threshold', value)} />
                <Field label="总体审计策略" className="col-span-3">
                  <textarea rows={3} value={form.audit_strategy} onChange={(e) => setField('audit_strategy', e.target.value)} />
                </Field>
                <Field label="项目合伙人">
                  <input value={form.partner} onChange={(e) => setField('partner', e.target.value)} />
                </Field>
                <Field label="项目经理">
                  <input value={form.manager} onChange={(e) => setField('manager', e.target.value)} />
                </Field>
                <Field label="底稿编制人">
                  <input value={form.preparer} onChange={(e) => setField('preparer', e.target.value)} />
                </Field>
                <Field label="项目说明" className="col-span-3">
                  <textarea rows={3} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="审计范围、重大时间点或其他约定" />
                </Field>
              </div>
            </section>
          )}

          {step === 3 && (
            <section>
              <SectionHeader
                eyebrow="STEP 4 · RUN"
                title="创建项目并执行年审工作流"
                desc="Agent 将按先后依赖执行：资料解析 → 计划 → 各科目审计 → 报表附注 → 人工复核。"
              />
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <SummaryCard label="项目" value={`${form.client_name} · ${form.year}`} ready={!!form.client_name} />
                  <SummaryCard
                    label="资料"
                    value={form.use_demo_data ? '江苏大王账套 + PBC 样例' : `${accountFiles.length + existingAccountFiles} 个账套文件 · ${supplementaryFiles.length + existingSupplementaryFiles} 个补充材料`}
                    ready={readiness.accountReady}
                  />
                  <SummaryCard
                    label="计划"
                    value={`${form.accounting_standard} · PM ¥${form.pm.toLocaleString()} · TE ¥${form.te.toLocaleString()}`}
                    ready={readiness.planningReady}
                  />
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-800">
                    本次运行将生成
                  </div>
                  <div className="grid grid-cols-4 divide-x divide-slate-200">
                    {[
                      ['70+', '计划及全科目底稿'],
                      ['审定表/明细表', '含账龄、截止和重算'],
                      ['4 张主表', '资产负债表至权益变动表'],
                      ['财务报表附注', '含勾稽与披露任务'],
                    ].map(([value, label]) => (
                      <div key={label} className="p-4 text-center">
                        <div className="text-lg font-bold text-brand-700">{value}</div>
                        <div className="text-xs text-slate-500 mt-1">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {activity.length > 0 && (
                  <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 space-y-2">
                    <div className="text-sm font-semibold text-brand-900 flex items-center gap-2">
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                      年审Agent执行记录
                    </div>
                    {activity.map((item, index) => (
                      <div key={`${item}-${index}`} className="flex items-center gap-2 text-xs text-brand-800">
                        <Check size={12} className="text-brand-500" /> {item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 flex items-center">
            <div className="text-xs text-slate-500">
              {step + 1} / {STEPS.length} · 数据、判断与运行结果均保留版本和操作轨迹
            </div>
            <div className="ml-auto flex gap-2">
              {step > 0 && (
                <Button variant="outline" onClick={() => goToStep(step - 1)} disabled={!!busy}>
                  <ArrowLeft size={14} /> 上一步
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button variant="primary" onClick={nextStep}>
                  下一步 <ArrowRight size={14} />
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => persist(false)} disabled={!!busy}>
                    {busy === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    仅保存
                  </Button>
                  <Button variant="primary" onClick={() => persist(true)} disabled={!!busy || !readiness.ready}>
                    {busy === 'running' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {busy === 'running' ? '正在执行年审工作流…' : '保存并执行年审工作流'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function SectionHeader({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) {
  return (
    <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-white to-slate-50">
      <div className="text-[10px] font-semibold tracking-[0.18em] text-brand-600">{eyebrow}</div>
      <h2 className="text-lg font-semibold text-slate-900 mt-1">{title}</h2>
      <p className="text-xs text-slate-500 mt-1">{desc}</p>
    </div>
  )
}

function Field({
  label, required, className, children,
}: {
  label: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <label className={cn('block', className)}>
      <span className="block text-xs font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      <div className="[&>input]:w-full [&>input]:h-10 [&>input]:rounded-md [&>input]:border [&>input]:border-slate-200 [&>input]:bg-white [&>input]:px-3 [&>input]:text-sm [&>input]:outline-none [&>input:focus]:border-brand-400 [&>input:focus]:ring-2 [&>input:focus]:ring-brand-100 [&>select]:w-full [&>select]:h-10 [&>select]:rounded-md [&>select]:border [&>select]:border-slate-200 [&>select]:bg-white [&>select]:px-3 [&>select]:text-sm [&>select]:outline-none [&>textarea]:w-full [&>textarea]:rounded-md [&>textarea]:border [&>textarea]:border-slate-200 [&>textarea]:bg-white [&>textarea]:px-3 [&>textarea]:py-2 [&>textarea]:text-sm [&>textarea]:outline-none">
        {children}
      </div>
    </label>
  )
}

function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Field label={label} required>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">¥</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-10 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </div>
    </Field>
  )
}

function UploadBox({
  title, hint, icon: Icon, files, existingCount, sampleFiles, onFiles,
}: {
  title: string
  hint: string
  icon: any
  files: File[]
  existingCount: number
  sampleFiles: string[]
  onFiles: (files: File[]) => void
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-brand-50 text-brand-700 grid place-items-center"><Icon size={17} /></div>
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="text-[11px] text-slate-500">{hint}</div>
        </div>
        {(existingCount > 0 || sampleFiles.length > 0) && <Badge tone="green" className="ml-auto">已就绪</Badge>}
      </div>
      <label className="m-4 min-h-36 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 grid place-items-center cursor-pointer hover:border-brand-300 hover:bg-brand-50/40">
        <div className="text-center py-5">
          <UploadCloud size={24} className="mx-auto text-slate-400" />
          <div className="text-sm font-medium text-slate-700 mt-2">选择或拖入文件</div>
          <div className="text-[11px] text-slate-400 mt-1">可一次选择多个文件</div>
        </div>
        <input type="file" multiple className="hidden" onChange={(e) => onFiles(Array.from(e.target.files || []))} />
      </label>
      <div className="px-4 pb-4 space-y-1">
        {existingCount > 0 && <FileLine label={`已归档 ${existingCount} 个历史文件`} tone="green" />}
        {sampleFiles.map((name) => <FileLine key={name} label={name} tone="amber" />)}
        {files.map((file) => <FileLine key={`${file.name}-${file.size}`} label={`${file.name} · ${formatBytes(file.size)}`} tone="sky" />)}
        {existingCount === 0 && sampleFiles.length === 0 && files.length === 0 && (
          <div className="text-[11px] text-slate-400">尚未选择文件</div>
        )}
      </div>
    </div>
  )
}

function FileLine({ label, tone }: { label: string; tone: 'green' | 'amber' | 'sky' }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
      <CheckCircle2 size={12} className={cn(
        tone === 'green' && 'text-emerald-500',
        tone === 'amber' && 'text-amber-500',
        tone === 'sky' && 'text-sky-500',
      )} />
      <span className="truncate">{label}</span>
    </div>
  )
}

function SummaryCard({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className={cn(
      'rounded-xl border p-4',
      ready ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50',
    )}>
      <div className="flex items-center gap-2">
        {ready ? <CheckCircle2 size={15} className="text-emerald-600" /> : <ClipboardCheck size={15} className="text-rose-600" />}
        <span className="text-xs font-semibold text-slate-700">{label}</span>
      </div>
      <div className="text-sm text-slate-900 mt-2 line-clamp-2">{value}</div>
    </div>
  )
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

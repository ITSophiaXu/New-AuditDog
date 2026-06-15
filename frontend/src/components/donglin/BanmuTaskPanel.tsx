import { useEffect, useState } from 'react'
import {
  AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight,
  ClipboardList, FolderOpen, Info, Loader2, Lock, MessageSquare, RefreshCw, Sparkles, Upload, X,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { type QuoteRef } from '@/components/agent/ChatPanel'
import { AUDIT_CHECKPOINTS_BANMU } from './AuditConfirmPanel'

type Stage = '计划' | '执行' | '报告'
type MaterialStatus = 'uploaded' | 'missing'
type SharedCheckpoint = (typeof AUDIT_CHECKPOINTS_BANMU)[number]

interface BanmuTaskPanelProps {
  paperIndex?: string
  paperId?: number
  engagementCode?: string
  onCheckpointConfirmed?: (relatedIndices: string[], extra?: { checkpointId?: string; selectValue?: string }) => Promise<void>
  onAskInChat?: (quote: QuoteRef) => void
  className?: string
}

interface MaterialDef {
  id: string
  label: string
}

interface TaskCheckpoint {
  id: string
  stage: Stage
  index: string
  label: string
  desc: string
  suggestion: string
  warning?: string
  /** 当有此字段时，渲染下拉选择而非纯文本意见框 */
  selectOptions?: { label: string; value: string }[]
}

interface PhaseDef {
  id: string
  stage: Stage
  title: string
  icon: string
  paperIndices: string[]
  aiDone: string[]
  materials: MaterialDef[]
  gateMaterialIds: string[]
  checkpointMaterialIds: string[]
  checkpoints: TaskCheckpoint[]
}

const ENGAGEMENT_CODE = 'ENG-BANMU-2024'
const MATERIAL_PREFIX = 'banmu-material-'

const PHASE1_CHECKPOINTS: TaskCheckpoint[] = [
  {
    id: 'X-accept', stage: '计划', index: 'X1/X2/X4',
    label: '项目承接确认',
    desc: '结合工商资料、历史包和约定书确认本期业务可承接。',
    suggestion: '建议承接：账套已解析，历史年度资料可复用，需补齐营业执照与约定书归档。',
  },
  {
    id: 'X-independence', stage: '计划', index: 'X1/X4',
    label: '独立性检查',
    desc: '确认项目组不存在财务利益、亲属或管理参与冲突。',
    suggestion: '建议确认独立性通过，并将独立性检查记录归入项目包。',
  },
  {
    id: 'X-scope', stage: '计划', index: 'X2',
    label: '审计范围确认',
    desc: '确认仅覆盖无锡斑目 2025 年度财务报表审计及相关附注。',
    suggestion: '建议按年审范围执行，不扩展专项审计；待业务约定书签署后固化。',
  },
  {
    id: 'X-gaap', stage: '计划', index: 'X1/Y5',
    label: '会计准则确认',
    desc: '确认本期采用的会计准则，与管理层口头询问结果一致后填写，影响所有底稿准则口径。',
    suggestion: '建议确认"小企业会计准则（财会〔2013〕17号）"。',
    selectOptions: [
      { label: '小企业会计准则（推荐）', value: '小企业会计准则（财会〔2013〕17号）' },
      { label: '企业会计准则', value: '企业会计准则（财政部2006年及后续修订）' },
      { label: '企业会计制度', value: '企业会计制度（财会〔2000〕25号）' },
      { label: '其他', value: '其他' },
    ],
  },
  {
    id: 'X-history', stage: '计划', index: 'X4',
    label: '历史项目包使用',
    desc: '确认是否复用上年审计报告、纳税申报表和底稿模板。',
    suggestion: '建议复用历史项目包结构，但需以本年账套和工商信息重新校验关键结论。',
  },
]

const PHASE2_CHECKPOINTS: TaskCheckpoint[] = [
  {
    id: 'KM-authority', stage: '计划', index: 'KM/Z9',
    label: '权威账套确认',
    desc: '确认当前电子账套为本次审计唯一权威数据源。',
    suggestion: '建议确认当前上传账套为权威版本，并锁定为后续全流程底稿基础。',
  },
  {
    id: 'KM-mapping', stage: '计划', index: 'KM',
    label: '科目编码映射冲突处理',
    desc: 'AI 已识别映射冲突，需确认最终归并逻辑。',
    suggestion: '建议沿用 AI 映射结果，对冲突科目按余额方向和辅助核算口径统一。',
  },
  {
    id: 'KM-reverse', stage: '计划', index: 'KM',
    label: '反向余额说明',
    desc: '对异常借贷方向余额补充业务解释。',
    suggestion: '建议保留 AI 识别的反向余额清单，并在后续循环底稿中逐项解释。',
  },
  {
    id: 'KM-base', stage: '计划', index: 'KM/Z9',
    label: '期间/币种/辅助核算基础',
    desc: '确认期间完整、币种正确且辅助核算维度可用。',
    suggestion: '建议确认 2025 全年期间完整，人民币为主币种，辅助核算可支持往来与工资分析。',
  },
]

function fromShared(c: SharedCheckpoint): TaskCheckpoint {
  return {
    id: c.id,
    stage: c.stage,
    index: c.index,
    label: c.label,
    desc: c.desc,
    suggestion: c.recommendation?.selected || c.desc,
    warning: c.recommendation?.warning,
  }
}

const sharedById = new Map(AUDIT_CHECKPOINTS_BANMU.map(c => [c.id, c] as const))
const sharedPick = (...ids: string[]) => ids
  .map(id => sharedById.get(id))
  .filter((c): c is SharedCheckpoint => !!c)
  .map(fromShared)

export const BANMU_PHASES: PhaseDef[] = [
  {
    id: 'phase-1',
    stage: '计划',
    title: '计划',
    icon: '📋',
    paperIndices: ['X1', 'X2', 'X4', 'KM'],
    aiDone: [
      '解析账套', '工商查询', '完整性校验', '生成科目余额表/试算平衡表',
      '识别科目映射冲突', '处理反向余额', '确认期间/币种/辅助核算',
    ],
    materials: [
      { id: 'tb-2025', label: '电子账套 2025（凭证+余额表）' },
      { id: 'business-license', label: '营业执照副本' },
      { id: 'articles', label: '公司章程' },
      { id: 'prior-audit-tax', label: '2024年审计报告及纳税申报表' },
      { id: 'engagement-record', label: '业务约定书/独立性检查记录' },
    ],
    gateMaterialIds: ['tb-2025'],
    checkpointMaterialIds: ['tb-2025', 'business-license', 'articles', 'prior-audit-tax', 'engagement-record'],
    checkpoints: [...PHASE1_CHECKPOINTS, ...PHASE2_CHECKPOINTS],
  },
  {
    id: 'phase-2',
    stage: '计划',
    title: '风险评估',
    icon: '🎯',
    paperIndices: ['Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8'],
    aiDone: ['计算重要性', '生成风险矩阵', '识别特别风险', '生成审计策略'],
    materials: [
      { id: 'loan-contract', label: '银行借款合同（1250万，3笔：工商300万+中行+农行）' },
      { id: 'industry-history', label: '行业信息/历史数据' },
    ],
    gateMaterialIds: ['loan-contract', 'industry-history'],
    checkpointMaterialIds: ['loan-contract', 'industry-history'],
    checkpoints: sharedPick('Y3-basis', 'Y3-pm', 'Y3-lower', 'Y5-size', 'Y5-strategy', 'Y8-risk', 'Y8-fraud', 'Y2-ics'),
  },
  {
    id: 'phase-3',
    stage: '执行',
    title: '实质性程序',
    icon: '🧪',
    paperIndices: ['A1', 'A3', 'A6', 'A9', 'A10', 'A24', 'B1', 'B6', 'B11', 'D1', 'D2', 'D5', 'D7'],
    aiDone: ['编制各循环底稿', '账龄分析', '截止测试', '关联方核查', '薪酬合理性测试'],
    materials: [
      { id: 'bank-statements', label: '银行对账单（全年各账户）' },
      { id: 'bank-confirmations', label: '银行函证回函' },
      { id: 'ar-aging', label: '应收账款往来账龄明细' },
      { id: 'ar-confirms', label: '应收账款询证函回函' },
      { id: 'payroll', label: '全年工资表（1-12月）' },
      { id: 'social-fund', label: '社保公积金缴纳明细（1-12月）' },
      { id: 'fixed-assets', label: '固定资产明细卡片/折旧计算表' },
      { id: 'inventory-count', label: '存货盘点表' },
    ],
    gateMaterialIds: ['bank-statements', 'bank-confirmations', 'ar-aging', 'ar-confirms', 'payroll', 'social-fund', 'fixed-assets', 'inventory-count'],
    checkpointMaterialIds: ['bank-statements', 'bank-confirmations', 'ar-aging', 'ar-confirms', 'fixed-assets', 'inventory-count'],
    checkpoints: sharedPick('A1-diff', 'A6-confirm', 'A6-bad', 'A10-inv', 'A24-imp', 'rel-party'),
  },
  {
    id: 'phase-4',
    stage: '报告',
    title: '调整汇总',
    icon: '🧾',
    paperIndices: ['Z6'],
    aiDone: ['汇总差异和调整建议', '区分审计调整和重分类', '编制调整分录汇总表', '过入调整后试算平衡表'],
    materials: [
      { id: 'mgmt-fs', label: '管理层编制财务报表（小企业会计准则，2025.12）' },
      { id: 'payroll-tax-summary', label: '工资申报明细表（全年汇总）' },
    ],
    gateMaterialIds: ['mgmt-fs', 'payroll-tax-summary'],
    checkpointMaterialIds: ['mgmt-fs', 'payroll-tax-summary'],
    checkpoints: sharedPick('Z12-unadj'),
  },
  {
    id: 'phase-5',
    stage: '报告',
    title: '报表与意见',
    icon: '📘',
    paperIndices: ['Z9', 'ZK3', 'ZK5', 'Z5', 'ZS'],
    aiDone: ['编制审定财务报表和附注', '最终勾稽', '总体分析性程序', '检查完整性'],
    materials: [
      { id: 'loan-contract', label: '银行借款合同（用于现金流分类）' },
      { id: 'contingencies', label: '或有事项及承诺事项资料' },
    ],
    gateMaterialIds: ['loan-contract', 'contingencies'],
    checkpointMaterialIds: ['loan-contract', 'contingencies'],
    checkpoints: sharedPick('Z5-opinion', 'ZS-disc'),
  },
]

export type BanmuPhaseSummary = { id: string; title: string; icon: string; paperIndices: string[] }
export const BANMU_PHASE_SUMMARIES: BanmuPhaseSummary[] = BANMU_PHASES.map(p => ({
  id: p.id, title: p.title, icon: p.icon, paperIndices: p.paperIndices,
}))

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')) } catch { return new Set() }
}

function saveSet(key: string, value: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...value])) } catch {}
}

function loadOptionalSet(key: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? new Set(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function normalizeIndex(index?: string) {
  return (index || '').split('.')[0]
}

function phaseMatchesPaper(phase: PhaseDef, paperIndex?: string) {
  const current = normalizeIndex(paperIndex)
  return !!current && phase.paperIndices.some(idx => normalizeIndex(idx) === current)
}

function readMaterialStatus(id: string) {
  try {
    const raw = localStorage.getItem(`${MATERIAL_PREFIX}${id}`)
    if (raw === 'uploaded' || raw === 'missing') return raw
  } catch {}
  return id === 'tb-2025' ? 'uploaded' : 'missing'
}

function saveMaterialStatus(id: string, status: MaterialStatus) {
  try { localStorage.setItem(`${MATERIAL_PREFIX}${id}`, status) } catch {}
}

function collectInitialMaterials() {
  const ids = new Set(BANMU_PHASES.flatMap(phase => phase.materials.map(m => m.id)))
  return [...ids].reduce<Record<string, MaterialStatus>>((acc, id) => {
    acc[id] = readMaterialStatus(id)
    return acc
  }, {})
}

function materialCountLabel(uploaded: number, total: number) {
  return `${uploaded}/${total} 材料`
}

export default function BanmuTaskPanel({ paperIndex, paperId, engagementCode, onCheckpointConfirmed, onAskInChat, className }: BanmuTaskPanelProps) {
  const qc = useQueryClient()
  const effectiveEngagementCode = engagementCode || ENGAGEMENT_CODE
  const lsKey = `audit-confirm-${effectiveEngagementCode}`
  const currentPhaseId = BANMU_PHASES.find(phase => phaseMatchesPaper(phase, paperIndex))?.id || 'phase-1'

  // ── FillDecision 待确认 ──────────────────────────────────────────
  type FillDecisionData = {
    paper_id: number; paper_index: string; key: string; cell_path: string
    question: string; context: string
    options: Array<{ label: string; value: string; amount?: string; rate?: string; note?: string }>
    status: 'pending' | 'resolved'; resolved_value: string | null
  }
  const { data: allFillDecisions = [] } = useQuery({
    queryKey: ['objects', 'FillDecision'],
    queryFn: () => api.listObjects('FillDecision'),
    enabled: paperId != null,
  })
  const pendingDecisions = allFillDecisions.filter(
    (o) => (o.data as FillDecisionData)?.paper_id === paperId &&
            (o.data as FillDecisionData)?.status === 'pending',
  )
  const [selectedValues, setSelectedValues] = useState<Record<number, string>>({})
  const [confirmingDecId, setConfirmingDecId] = useState<number | null>(null)

  async function resolveDecision(decId: number, value: string) {
    setConfirmingDecId(decId)
    try {
      await api.banmuResolve(decId, value)
      qc.invalidateQueries({ queryKey: ['objects', 'FillDecision'] })
      qc.invalidateQueries({ queryKey: ['object', paperId] })
      qc.invalidateQueries({ queryKey: ['objects', 'WorkingPaper'] })
      qc.invalidateQueries({ queryKey: ['objects', 'Engagement'] })
    } catch (e: any) {
      alert(`提交失败：${e.message}`)
    } finally { setConfirmingDecId(null) }
  }

  // ── Anomaly 待确认 ────────────────────────────────────────────────
  type AnomalyData = {
    paper_id: number; paper_index: string
    severity: 'high' | 'medium' | 'low'
    title: string; detail: string; triggered_by: string; recommendation: string
    review_status?: '待审计' | '已确认' | '已驳回'; review_note?: string
    reviewed_by?: string; reviewed_at?: string
  }
  const { data: allAnomalies = [] } = useQuery({
    queryKey: ['objects', 'Anomaly'],
    queryFn: () => api.listObjects('Anomaly'),
    enabled: paperId != null,
  })
  const pendingAnomalies = allAnomalies.filter(
    (a) => (a.data as AnomalyData)?.paper_id === paperId &&
            (!(a.data as AnomalyData)?.review_status || (a.data as AnomalyData)?.review_status === '待审计'),
  )
  const [confirmingAnomalyId, setConfirmingAnomalyId] = useState<number | null>(null)

  async function setAnomalyStatus(anomalyId: number, d: AnomalyData, status: '已确认' | '已驳回') {
    setConfirmingAnomalyId(anomalyId)
    try {
      await api.patchObject(anomalyId, {
        data: { ...d, review_status: status, reviewed_by: '审计师', reviewed_at: new Date().toISOString() },
      })
      qc.invalidateQueries({ queryKey: ['objects', 'Anomaly'] })
    } finally { setConfirmingAnomalyId(null) }
  }

  const [materials, setMaterials] = useState<Record<string, MaterialStatus>>(() => collectInitialMaterials())
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(() => loadSet(`${lsKey}-confirmed`))
  const [deferredIds, setDeferredIds] = useState<Set<string>>(() => loadSet(`${lsKey}-deferred`))
  const [openAiLogs, setOpenAiLogs] = useState<Set<string>>(() => loadOptionalSet(`banmu-task-${effectiveEngagementCode}-open-ai`) || new Set())
  const [noteMap, setNoteMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(`${lsKey}-notes`) || '{}') } catch { return {} }
  })
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set())
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set())
  const [selectMap, setSelectMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(`${lsKey}-selects`) || '{}') } catch { return {} }
  })
  const [pendingRecalc, setPendingRecalc] = useState<number>(() => {
    try { return Number(localStorage.getItem(`banmu-task-${effectiveEngagementCode}-recalc`) || '0') || 0 } catch { return 0 }
  })

  useEffect(() => {
    saveSet(`banmu-task-${effectiveEngagementCode}-open-ai`, openAiLogs)
  }, [effectiveEngagementCode, openAiLogs])

  useEffect(() => {
    try { localStorage.setItem(`banmu-task-${effectiveEngagementCode}-recalc`, String(pendingRecalc)) } catch {}
  }, [effectiveEngagementCode, pendingRecalc])

  function toggleNoteExpand(id: string) {
    setExpandedNoteIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function updateNote(id: string, text: string) {
    setNoteMap(prev => {
      const next = { ...prev, [id]: text }
      try { localStorage.setItem(`${lsKey}-notes`, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function updateSelect(id: string, value: string) {
    setSelectMap(prev => {
      const next = { ...prev, [id]: value }
      try { localStorage.setItem(`${lsKey}-selects`, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function toggleAiLog(phaseId: string) {
    setOpenAiLogs(prev => {
      const next = new Set(prev)
      if (next.has(phaseId)) next.delete(phaseId)
      else next.add(phaseId)
      return next
    })
  }

  function uploadMaterial(materialId: string) {
    if (materials[materialId] === 'uploaded') return
    setMaterials(prev => {
      const next = { ...prev, [materialId]: 'uploaded' as MaterialStatus }
      saveMaterialStatus(materialId, 'uploaded')
      return next
    })
    setPendingRecalc(v => v + 1)
  }

  async function confirmCheckpoint(id: string, relatedIndex: string, selectValue?: string) {
    if (confirmedIds.has(id)) return
    const nextConfirmed = new Set(confirmedIds).add(id)
    const nextDeferred = new Set(deferredIds)
    nextDeferred.delete(id)
    setConfirmedIds(nextConfirmed)
    setDeferredIds(nextDeferred)
    saveSet(`${lsKey}-confirmed`, nextConfirmed)
    saveSet(`${lsKey}-deferred`, nextDeferred)
    setPendingRecalc(v => v + 1)
    if (onCheckpointConfirmed) {
      const indices = relatedIndex.split('/').map(s => s.trim()).filter(Boolean)
      setRefreshingIds(prev => new Set([...prev, id]))
      try { await onCheckpointConfirmed(indices, { checkpointId: id, selectValue }) } finally {
        setRefreshingIds(prev => { const next = new Set(prev); next.delete(id); return next })
      }
    }
  }

  function deferCheckpoint(id: string) {
    const nextDeferred = new Set(deferredIds).add(id)
    const nextConfirmed = new Set(confirmedIds)
    nextConfirmed.delete(id)
    setDeferredIds(nextDeferred)
    setConfirmedIds(nextConfirmed)
    saveSet(`${lsKey}-deferred`, nextDeferred)
    saveSet(`${lsKey}-confirmed`, nextConfirmed)
  }

  function resetCheckpoint(id: string) {
    const nextDeferred = new Set(deferredIds)
    const nextConfirmed = new Set(confirmedIds)
    nextDeferred.delete(id)
    nextConfirmed.delete(id)
    setDeferredIds(nextDeferred)
    setConfirmedIds(nextConfirmed)
    saveSet(`${lsKey}-deferred`, nextDeferred)
    saveSet(`${lsKey}-confirmed`, nextConfirmed)
  }

  return (
    <div className={cn('h-full flex flex-col bg-slate-50/40', className)}>
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-violet-50 text-violet-700 border border-violet-200 grid place-items-center shrink-0">
            <ClipboardList size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-slate-900">无锡斑目 · 2025年度审计</div>
            <div className="text-[10px] text-slate-500">选择左侧底稿查看对应阶段任务</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        {(() => {
          const phase = BANMU_PHASES.find(p => p.id === currentPhaseId)
          if (!phase) return (
            <div className="px-4 py-8 text-center text-xs text-slate-400">请选择一个阶段</div>
          )
          const isActive = phaseMatchesPaper(phase, paperIndex)
          const missingMaterials = phase.materials.filter(m => materials[m.id] !== 'uploaded')
          const uploadedCount = phase.materials.length - missingMaterials.length
          const isLocked = phase.gateMaterialIds.some(id => materials[id] !== 'uploaded')
          const checkpointsActionable = phase.checkpointMaterialIds.every(id => materials[id] === 'uploaded')
          const confirmedCount = phase.checkpoints.filter(c => confirmedIds.has(c.id)).length
          const deferredCount = phase.checkpoints.filter(c => deferredIds.has(c.id)).length
          const pendingCheckpoints = phase.checkpoints.filter(c => !confirmedIds.has(c.id) && !deferredIds.has(c.id))
          return (
            <>
              {/* 阶段标题 */}
              <div className={cn(
                'rounded-md border px-3 py-2 flex items-center gap-2',
                isActive ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white',
              )}>
                <span className="text-[18px] leading-none">{phase.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-semibold text-slate-800">{phase.title}</span>
                    {isActive && <span className="text-[9px] rounded border border-violet-200 bg-violet-100 px-1 py-px text-violet-700">当前底稿</span>}
                    {isLocked ? (
                      <span className="inline-flex items-center gap-1 text-[9px] rounded border border-rose-200 bg-rose-50 px-1 py-px text-rose-700"><Lock size={9} /> 待补材料</span>
                    ) : checkpointsActionable ? (
                      <span className="text-[9px] rounded border border-emerald-200 bg-emerald-50 px-1 py-px text-emerald-700">可确认</span>
                    ) : (
                      <span className="text-[9px] rounded border border-amber-200 bg-amber-50 px-1 py-px text-amber-700">待补材料</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    {materialCountLabel(uploadedCount, phase.materials.length)} · {confirmedCount}/{phase.checkpoints.length} 已确认
                    {deferredCount > 0 && ` · ${deferredCount} 项暂缓`}
                  </div>
                </div>
              </div>

              {/* 所需材料 */}
              <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-700 mb-1.5">
                  <FolderOpen size={11} className="text-slate-400" />
                  所需材料
                </div>
                <div className="space-y-1">
                  {phase.materials.map(material => {
                    const uploaded = materials[material.id] === 'uploaded'
                    return (
                      <div
                        key={`${phase.id}-${material.id}`}
                        className={cn(
                          'flex items-start gap-1.5 rounded border px-2 py-1.5',
                          uploaded ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700',
                        )}
                      >
                        {uploaded ? <CheckCircle2 size={11} className="shrink-0 mt-0.5" /> : <AlertCircle size={11} className="shrink-0 mt-0.5" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium leading-tight">{material.label}</div>
                        </div>
                        {uploaded ? (
                          <span className="text-[9px] rounded border border-emerald-200 bg-white/70 px-1 py-px">已上传</span>
                        ) : (
                          <button
                            onClick={() => uploadMaterial(material.id)}
                            className="shrink-0 inline-flex items-center gap-1 rounded border border-rose-300 bg-white px-1.5 py-1 text-[10px] text-rose-700 hover:bg-rose-100"
                          >
                            <Upload size={10} /> 上传
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                {missingMaterials.length > 0 && (
                  <div className="mt-1.5 text-[10px] text-slate-500">
                    {isLocked
                      ? `当前阻塞：${missingMaterials.map(m => m.label).join('、')}`
                      : `补齐材料后可确认本阶段 ${pendingCheckpoints.length} 个判断点。`}
                  </div>
                )}
              </div>

              {/* 待确认 */}
              <div className="rounded-md border border-slate-200 bg-white p-2">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-700 mb-1.5">
                  <span>👤</span>
                  待确认
                  <span className="ml-auto text-[9px] text-slate-400">
                    {pendingDecisions.length + pendingAnomalies.length + phase.checkpoints.length} 项
                  </span>
                </div>
                <div className="space-y-1.5">
                  {/* AI 填稿判断点 */}
                  {pendingDecisions.map(o => {
                    const d = o.data as FillDecisionData
                    const isBusy = confirmingDecId === o.id
                    const sel = selectedValues[o.id]
                    return (
                      <div key={o.id} className="rounded-md border mb-1 border-violet-200 bg-white hover:border-violet-300 transition-colors">
                        <div className="flex items-start gap-1.5 px-2 py-1.5">
                          <Sparkles size={11} className="shrink-0 mt-0.5 text-violet-400" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[9px] font-bold px-1 py-px rounded border text-violet-600 bg-violet-50 border-violet-200">AI判断点</span>
                              <span className="text-[11px] font-medium text-slate-800 leading-tight">{d.question}</span>
                            </div>
                            {d.context && (
                              <div className="mt-1 text-[10px] text-slate-600 leading-relaxed whitespace-pre-wrap border-l-2 border-violet-100 pl-2"
                                dangerouslySetInnerHTML={{
                                  __html: d.context
                                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                                    .replace(/^•\s/gm, '<span class="text-violet-400 mr-1">•</span>')
                                }}
                              />
                            )}
                          </div>
                        </div>
                        <div className="px-2 pb-1 space-y-1">
                          {d.options.map(opt => (
                            <label key={opt.value}
                              className={cn(
                                'flex items-start gap-1.5 px-2 py-1 rounded cursor-pointer border text-[10px] transition-colors',
                                sel === opt.value
                                  ? 'border-violet-400 bg-violet-50 text-violet-800'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                              )}
                            >
                              <input type="radio" name={`dec-${o.id}`} value={opt.value}
                                checked={sel === opt.value}
                                onChange={() => setSelectedValues(prev => ({ ...prev, [o.id]: opt.value }))}
                                className="mt-0.5 accent-violet-600"
                              />
                              <span className="flex-1">
                                {opt.label}
                                {opt.amount && <span className="ml-1 font-mono text-violet-700">{opt.amount}</span>}
                                {opt.rate && <span className="ml-1 text-slate-500">× {opt.rate}</span>}
                                {opt.note && <span className="ml-1 text-slate-400 italic">{opt.note}</span>}
                              </span>
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-1 px-2 pb-1.5">
                          <button
                            disabled={isBusy || !sel}
                            onClick={() => sel && resolveDecision(o.id, sel)}
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 text-[10px] disabled:opacity-50"
                          >
                            {isBusy ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />} 确认选择
                          </button>
                          <button
                            onClick={() => onAskInChat?.({ label: d.question, detail: d.context, color: 'violet' })}
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-violet-300 bg-white text-violet-700 hover:bg-violet-50 text-[10px]"
                          >
                            <MessageSquare size={9} /> 询问
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {/* AI 识别的异常 */}
                  {pendingAnomalies.map(a => {
                    const d = a.data as AnomalyData
                    const isBusy = confirmingAnomalyId === a.id
                    const sevColor = d.severity === 'high'
                      ? 'text-rose-600 bg-rose-50 border-rose-200'
                      : d.severity === 'medium'
                      ? 'text-amber-600 bg-amber-50 border-amber-200'
                      : 'text-sky-600 bg-sky-50 border-sky-200'
                    const sevLabel = d.severity === 'high' ? '高风险' : d.severity === 'medium' ? '中风险' : '低风险'
                    const SevIcon = d.severity === 'high' ? AlertTriangle
                      : d.severity === 'medium' ? AlertCircle : Info
                    return (
                      <div key={a.id} className="rounded-md border mb-1 border-slate-200 bg-white hover:border-amber-200 transition-colors">
                        <div className="flex items-start gap-1.5 px-2 py-1.5">
                          <SevIcon size={11} className="shrink-0 mt-0.5 text-slate-400" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className={cn('text-[9px] font-bold px-1 py-px rounded border', sevColor)}>{sevLabel}</span>
                              <span className="text-[11px] font-medium text-slate-800 leading-tight">{d.title}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{d.detail}</div>
                            {d.recommendation && (
                              <div className="text-[10px] text-slate-400 italic mt-0.5 line-clamp-1">建议：{d.recommendation}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 px-2 pb-1.5">
                          <button disabled={isBusy} onClick={() => setAnomalyStatus(a.id, d, '已确认')}
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 text-[10px] disabled:opacity-50">
                            {isBusy ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />} 确认
                          </button>
                          <button disabled={isBusy} onClick={() => setAnomalyStatus(a.id, d, '已驳回')}
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 text-[10px] disabled:opacity-50">
                            {isBusy ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />} 驳回
                          </button>
                          <button onClick={() => onAskInChat?.({
                              label: d.title,
                              detail: d.detail,
                              color: d.severity === 'high' ? 'rose' : d.severity === 'medium' ? 'amber' : 'blue',
                            })}
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-violet-300 bg-white text-violet-700 hover:bg-violet-50 text-[10px]">
                            <MessageSquare size={9} /> 询问
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {phase.checkpoints.map(checkpoint => {
                    const confirmed = confirmedIds.has(checkpoint.id)
                    const deferred = deferredIds.has(checkpoint.id)
                    const disabled = !checkpointsActionable && !confirmed && !deferred
                    const noteExpanded = expandedNoteIds.has(checkpoint.id)
                    const note = noteMap[checkpoint.id] || ''
                    const selectedOption = selectMap[checkpoint.id] || (checkpoint.selectOptions?.[0]?.value ?? '')
                    return (
                      <div
                        key={checkpoint.id}
                        className={cn(
                          'rounded border px-2 py-1.5',
                          confirmed ? 'border-emerald-200 bg-emerald-50'
                            : deferred ? 'border-slate-200 bg-slate-50'
                            : disabled ? 'border-slate-200 bg-slate-50/80 opacity-70'
                            : 'border-amber-200 bg-amber-50/70',
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          <div className={cn('text-[9px] font-mono mt-0.5 shrink-0', confirmed ? 'text-emerald-600' : 'text-slate-400')}>
                            {checkpoint.index}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-medium text-slate-800 leading-tight">{checkpoint.label}</div>
                            {/* 已有笔记时显示笔记，否则显示 AI 建议 */}
                            {note ? (
                              <div className="text-[10px] text-slate-700 mt-0.5 bg-white/70 rounded px-1.5 py-1 border border-slate-200">
                                {note}
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2 italic">AI建议：{checkpoint.suggestion}</div>
                            )}
                            {checkpoint.warning && (
                              <div className="mt-1 inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-px text-[9px] text-amber-700">
                                <AlertCircle size={9} /> {checkpoint.warning}
                              </div>
                            )}
                          </div>
                          {confirmed && <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />}
                        </div>

                        {/* 意见输入框 or 选项下拉 */}
                        {checkpoint.selectOptions ? (
                          <div className="mt-1.5">
                            <select
                              value={selectedOption}
                              disabled={confirmed || deferred}
                              onChange={e => updateSelect(checkpoint.id, e.target.value)}
                              className="w-full text-[11px] rounded border border-violet-300 bg-white px-2 py-1 text-slate-800 focus:border-violet-500 focus:outline-none disabled:opacity-60 disabled:bg-slate-50"
                            >
                              {checkpoint.selectOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            {confirmed && selectedOption && (
                              <div className="mt-0.5 text-[10px] text-emerald-700 font-medium px-1">✓ 已确认：{selectedOption}</div>
                            )}
                          </div>
                        ) : noteExpanded && (
                          <div className="mt-1.5">
                            <textarea
                              value={note}
                              onChange={e => updateNote(checkpoint.id, e.target.value)}
                              placeholder={`填写审计判断（AI建议：${checkpoint.suggestion}）`}
                              rows={3}
                              className="w-full text-[11px] rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none resize-none"
                            />
                          </div>
                        )}

                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          {confirmed || deferred ? (
                            <>
                              <span className={cn(
                                'text-[9px] rounded border px-1 py-px',
                                confirmed ? 'border-emerald-200 bg-white text-emerald-700' : 'border-slate-200 bg-white text-slate-500',
                              )}>
                                {confirmed ? '已确认' : '已暂缓'}
                              </span>
                              <button
                                onClick={() => toggleNoteExpand(checkpoint.id)}
                                className="text-[9px] text-slate-500 hover:text-slate-700 underline"
                              >
                                {noteExpanded ? '收起' : (note ? '编辑意见' : '填写意见')}
                              </button>
                              <button onClick={() => resetCheckpoint(checkpoint.id)} className="text-[9px] text-slate-500 hover:text-slate-700 underline">撤销</button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => confirmCheckpoint(checkpoint.id, checkpoint.index, checkpoint.selectOptions ? selectedOption : undefined)}
                                disabled={disabled || refreshingIds.has(checkpoint.id)}
                                className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700 hover:bg-emerald-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                              >
                                {refreshingIds.has(checkpoint.id)
                                  ? <><span className="animate-spin">⏳</span> 更新中…</>
                                  : <><Check size={10} /> 确认</>
                                }
                              </button>
                              <button
                                onClick={() => deferCheckpoint(checkpoint.id)}
                                disabled={disabled}
                                className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-50 disabled:text-slate-400"
                              >
                                暂缓
                              </button>
                              <button
                                onClick={() => toggleNoteExpand(checkpoint.id)}
                                disabled={disabled}
                                className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-50 disabled:text-slate-400"
                              >
                                {noteExpanded ? '收起' : '填写意见'}
                              </button>
                              {disabled && <span className="text-[9px] text-slate-400">材料未齐，暂不可确认</span>}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* AI 已完成 */}
              <div className="rounded-md border border-violet-200 bg-violet-50/60 overflow-hidden">
                <button
                  onClick={() => toggleAiLog(phase.id)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[10px] font-medium text-violet-700 hover:bg-violet-100/60"
                >
                  {openAiLogs.has(phase.id) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  <Sparkles size={11} />
                  AI 已完成
                </button>
                {openAiLogs.has(phase.id) && (
                  <div className="border-t border-violet-200 px-2 py-1.5 space-y-1 bg-white/60">
                    {phase.aiDone.map(item => (
                      <div key={item} className="text-[10px] text-violet-700 flex items-start gap-1.5">
                        <span className="mt-0.5">•</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )
        })()}
      </div>

      {pendingRecalc > 0 && (
        <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 flex items-center gap-2">
          <div className="text-[10px] text-slate-600">📊 {pendingRecalc} 项变更待重新计算</div>
          <button
            onClick={() => setPendingRecalc(0)}
            className="ml-auto inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] text-violet-700 hover:bg-violet-100"
          >
            <RefreshCw size={10} /> 重新计算底稿
          </button>
        </div>
      )}
    </div>
  )
}

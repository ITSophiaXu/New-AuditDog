import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardList, Sparkles, Building2,
  FileSpreadsheet, ChevronLeft, ChevronUp, ChevronDown,
  ChevronRight, MessageSquare, RefreshCw, AlertTriangle,
  PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import CorrectionLayer from '@/components/workpaper/CorrectionLayer'
import AuditConfirmPanel from '@/components/donglin/AuditConfirmPanel'
import BanmuTaskPanel, { BANMU_PHASE_SUMMARIES } from '@/components/donglin/BanmuTaskPanel'
import { cn } from '@/lib/utils'
import { DonglinPaperView } from '@/components/donglin/DonglinPaperView'
import WorkbenchProgressBar from '@/components/donglin/WorkbenchProgressBar'
import WorkbenchKnowledgePanel from '@/components/donglin/WorkbenchKnowledgePanel'
import { isDonglinFilledDemo, isDonglinPaper } from '@/lib/donglin'
import type { DonglinPaperCode } from '@/lib/donglin'
import PlanningPaperView from '@/components/donglin/PlanningPaperView'
import { type QuoteRef } from '@/components/agent/ChatPanel'


// ─── 阶段 → 类别（letter）映射 ──────────────────────────────
type WBCat = { code: string; label: string; letters: string[] }
type WBStage = { code: string; label: string; name: string; cats: WBCat[] }
const STAGE_TREE: WBStage[] = [
  { code: 'planning', label: '📋 计划', name: '计划',
    cats: [{ code: 'X', label: '业务计划', letters: ['X'] }] },
  { code: 'risk', label: '🎯 风险评估', name: '风险评估',
    cats: [{ code: 'Y', label: '风险评估', letters: ['Y'] }] },
  { code: 'execution', label: '⚙ 执行', name: '执行',
    cats: [
      { code: 'A', label: '💼 资产', letters: ['A'] },
      { code: 'B', label: '💳 负债', letters: ['B'] },
      { code: 'C', label: '🪙 权益', letters: ['C'] },
      { code: 'D', label: '📊 损益', letters: ['D'] },
      { code: 'T', label: '🧾 税务', letters: ['G', 'H', 'S'] },
    ] },
  { code: 'reporting', label: '📕 报告', name: '报告',
    cats: [{ code: 'Z', label: '报告', letters: ['Z', 'ZK', 'ZS'] }] },
  { code: 'misc', label: '🗂 其他', name: '其他',
    cats: [{ code: 'M', label: '辅助', letters: ['K', 'N', 'O', 'P', 'TB', 'KM'] }] },
]

// ─── 子表代号 → 显示名 ──────────────────────────────────────
const SHEET_LABEL: Record<string, string> = {
  summary: '审定表',
  bank_detail: '银行存款明细',
  cash_count: '现金盘点',
  cutoff_test: '截止测试',
  customer_detail: '客户明细',
  aging_analysis: '账龄分析',
  employee_detail: '员工明细',
  asset_detail: '资产明细',
  loan_detail: '借款明细',
  depreciation: '折旧重算',
  related_guarantee: '关联担保',
  interest_recalc: '利息重算',
  // ── 计划阶段底稿 sheet_data keys ──
  entity_understanding: '被审单位了解',
  industry_background: '行业背景',
  business_model: '商业模式',
  financial_performance: '财务表现',
  going_concern_indicators: '持续经营指标',
  entity_level_controls: '实体层面控制',
  overall_control_risk: '整体控制风险',
  planned_response: '拟采用审计响应',
  basis_analysis: '重要性基准分析',
  conclusion: '重要性结论',
  risk_matrix: '重大错报风险矩阵',
  company_info: '公司基本信息',
  business_overview: '业务概况',
  key_financials: '关键财务数据',
  key_cycles: '主要业务循环',
  control_environment: '控制环境',
  going_concern: '持续经营评估',
  scale_judgement: '小企业规模判断',
}

// 5-state 状态
type PaperState = '完成' | '待 review' | 'AI 已填' | '缺数据' | '未启动'
function paperStateOf(p: any): PaperState {
  const d = (p?.data as any) || {}
  if (d.status === '已完成' || d.status === '完成') return '完成'
  if (d.review_status === '已复核') return '完成'
  if (d.review_status === '待复核') return '待 review'
  if (d.review_status === 'AI 初稿' || d.ai_prefilled_at) return 'AI 已填'
  if (d.sheet_data && Object.keys(d.sheet_data).length > 0) return 'AI 已填'
  if (d.review_status === '未开始') return '未启动'
  return '未启动'
}
function statusDotClass(state: PaperState): string {
  switch (state) {
    case '完成': return 'bg-emerald-500'
    case '待 review': return 'bg-amber-500'
    case 'AI 已填': return 'bg-blue-500'
    case '缺数据': return 'bg-rose-500'
    default: return 'bg-slate-300'
  }
}

// 提取 letter
function getLetter(p: any): string {
  const idx = ((p?.data as any)?.index || '') as string
  const m = idx.match(/^([A-Z]+)/)
  return m ? m[1] : ''
}
// メタデータキー（底稿 section ではなく編制者情報）
const META_KEYS = new Set(['preparer', 'prepared_at', 'reviewer', 'reviewed_at'])

function getSubSheets(p: any): string[] {
  const sd = (p?.data as any)?.sheet_data || {}
  return Object.keys(sd).filter(k => !META_KEYS.has(k))
}

export default function WorkingPaperWorkbench() {
  const { paperId } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: papers = [] } = useQuery({
    queryKey: ['objects', 'WorkingPaper'],
    queryFn: () => api.listObjects('WorkingPaper'),
  })
  const { data: engagements = [] } = useQuery({
    queryKey: ['objects', 'Engagement'],
    queryFn: () => api.listObjects('Engagement'),
  })

  const activeId = paperId ? Number(paperId) : papers[0]?.id

  // ?eng= 参数：从首页点击项目卡片时跳转到指定项目
  const engParam = searchParams.get('eng')
  useEffect(() => {
    if (paperId) return // already on a specific paper
    if (engParam && papers.length > 0) {
      const firstInEng = papers.find((p) => (p.data as any)?.engagement_code === engParam)
      const target = firstInEng || papers[0]
      if (target) nav(`/workbench/${target.id}`, { replace: true })
    } else if (!paperId && papers[0]) {
      nav(`/workbench/${papers[0].id}`, { replace: true })
    }
  }, [paperId, papers, nav, engParam])

  // 当前项目 = active paper 所属 engagement
  const activePaper = papers.find((p) => p.id === activeId)
  const activeEngCode = (activePaper?.data as any)?.engagement_code as string | undefined
  const activeEngagement = engagements.find((e) => (e.data as any)?.code === activeEngCode)
  const isBanmuProject = activeEngCode === 'ENG-BANMU-2024'

  // 项目切换器
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false)
  const switchProject = (newEngCode: string) => {
    const firstPaper = papers.find((p) => (p.data as any)?.engagement_code === newEngCode)
    if (firstPaper) nav(`/workbench/${firstPaper.id}`)
    setShowProjectSwitcher(false)
  }

  // 仅展示当前项目的底稿
  const currentProjectPapers = useMemo(
    () => papers.filter((p) => (p.data as any)?.engagement_code === activeEngCode),
    [papers, activeEngCode],
  )

  // papersByStageCat[stage.code][cat.code] = papers[]
  const papersByStageCat = useMemo(() => {
    const out: Record<string, Record<string, typeof papers>> = {}
    for (const s of STAGE_TREE) {
      out[s.code] = {}
      for (const c of s.cats) out[s.code][c.code] = []
    }
    for (const p of currentProjectPapers) {
      const letter = getLetter(p)
      let placed = false
      for (const s of STAGE_TREE) {
        const c = s.cats.find((cc) => cc.letters.includes(letter))
        if (c) { out[s.code][c.code].push(p); placed = true; break }
      }
      if (!placed) out['misc']['M'].push(p)
    }
    // 排序（React Query 数组冻结 — 必须先复制）
    const sortFn = (a: any, b: any) => {
      const ai = ((a.data as any)?.index || a.display_name || '') as string
      const bi = ((b.data as any)?.index || b.display_name || '') as string
      return ai.localeCompare(bi, 'zh-Hans-CN', { numeric: true })
    }
    for (const s of STAGE_TREE) {
      for (const c of s.cats) {
        out[s.code][c.code] = [...out[s.code][c.code]].sort(sortFn)
      }
    }
    return out
  }, [currentProjectPapers])

  // 全项目阶段统计（顶部 ProgressBar 用）
  const stageStats = useMemo(() => {
    return STAGE_TREE.map((s) => {
      const list = Object.values(papersByStageCat[s.code] || {}).flat()
      const done = list.filter((p) => paperStateOf(p) === '完成').length
      return { code: s.code, name: s.name, done, total: list.length }
    }).filter((s) => s.total > 0)
  }, [papersByStageCat])
  const statusCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const p of currentProjectPapers) {
      const s = paperStateOf(p)
      out[s] = (out[s] || 0) + 1
    }
    return out
  }, [currentProjectPapers])

  // 展开状态：阶段 / 类别 / 主表
  const [openStages, setOpenStages] = useState<Set<string>>(() => new Set(['execution']))
  const [openCats, setOpenCats] = useState<Set<string>>(new Set())
  const [openMains, setOpenMains] = useState<Set<number>>(new Set())
  const [openBanmuPhases, setOpenBanmuPhases] = useState<Set<string>>(() => new Set(['phase-1']))
  const toggleBanmuPhase = (id: string) => setOpenBanmuPhases(p => {
    const next = new Set(p); if (next.has(id)) next.delete(id); else next.add(id); return next
  })
  const toggleStage = (code: string) => {
    setOpenStages((p) => {
      const next = new Set(p)
      if (next.has(code)) next.delete(code); else next.add(code)
      return next
    })
  }
  const toggleCat = (key: string) => {
    setOpenCats((p) => {
      const next = new Set(p)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  const toggleMain = (id: number) => {
    setOpenMains((p) => {
      const next = new Set(p)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // 自动展开包含当前 paper 的主表
  useEffect(() => {
    if (!activePaper) return
    setOpenMains((prev) => {
      if (prev.has(activePaper.id)) return prev
      const next = new Set(prev)
      next.add(activePaper.id)
      return next
    })
  }, [activeId])

  useEffect(() => {
    if (!isBanmuProject || !paper) return
    const paperIdx = ((paper.data as any)?.index as string || '').split('.')[0]
    const matchPhase = BANMU_PHASE_SUMMARIES.find(ph =>
      ph.paperIndices.some(i => i.split('.')[0] === paperIdx)
    )
    if (matchPhase) {
      setOpenBanmuPhases(prev => prev.has(matchPhase.id) ? prev : new Set(prev).add(matchPhase.id))
    }
  }, [activeId, isBanmuProject])

  // prev / next paper（按 stage→cat 顺序遍历）
  const orderedPapers = useMemo(() => {
    const out: typeof papers = []
    for (const s of STAGE_TREE) {
      for (const c of s.cats) out.push(...(papersByStageCat[s.code][c.code] || []))
    }
    return out
  }, [papersByStageCat])
  const activeIndex = orderedPapers.findIndex((p) => p.id === activeId)
  const prevPaper = activeIndex > 0 ? orderedPapers[activeIndex - 1] : null
  const nextPaper = (activeIndex >= 0 && activeIndex < orderedPapers.length - 1)
    ? orderedPapers[activeIndex + 1] : null

  // active paper 详情
  const { data: paperDetail } = useQuery({
    queryKey: ['object', activeId],
    queryFn: () => api.getObject(activeId!),
    enabled: !!activeId,
  })
  const paper = paperDetail?.object

  // pending FillDecisions for the current paper (for banner + right-tab badge)
  const { data: allFillDecisions = [] } = useQuery({
    queryKey: ['objects', 'FillDecision'],
    queryFn: () => api.listObjects('FillDecision'),
    enabled: !!paper?.id,
  })
  const pendingDecisionsForPaper = allFillDecisions.filter(
    d => (d.data as any)?.paper_id === paper?.id && (d.data as any)?.status === 'pending'
  )

  // active sheet（URL 控制）
  const activeSheetParam = searchParams.get('sheet') || null
  const setActiveSheetParam = (s: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (s) next.set('sheet', s); else next.delete('sheet')
    setSearchParams(next, { replace: true })
  }

  // 右侧 tab + 收起 — 2 个: 任务 / 对话
  const [rightTab, setRightTab] = useState<'rules' | 'audit'>('rules')
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(false)

  // 任务区域"询问"按钮 → 切换到对话区域并携带引用
  const [pendingChatQuote, setPendingChatQuote] = useState<QuoteRef | undefined>()
  function handleAskInChat(quote: QuoteRef) {
    setPendingChatQuote(quote)
    setRightTab('audit')
    setRightCollapsed(false)
  }
  useEffect(() => {
    try { localStorage.setItem('workbench-right-collapsed', rightCollapsed ? '1' : '0') } catch {}
  }, [rightCollapsed])

  // 左侧底稿树 收起 / 展开
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('workbench-left-collapsed') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('workbench-left-collapsed', leftCollapsed ? '1' : '0') } catch {}
  }, [leftCollapsed])

  // 项目名快查
  const engByCode = (code: string) =>
    engagements.find((e) => (e.data as any)?.code === code)?.display_name || code

  // 当前 paper 是否为东林
  const isActiveDonglin = !!paper && isDonglinFilledDemo(paper.data as any)
  const activeDonglinCode = isActiveDonglin
    ? ((paper!.data as any)?.index as DonglinPaperCode)
    : null
  const isActiveDonglinPaper = !!paper && isDonglinPaper(paper.data as any)
  // 有 sheet_data 但不是 5 张 demo → 计划底稿通用视图
  const hasSheetData = !!paper && Object.keys((paper?.data as any)?.sheet_data || {}).length > 0
  const isPlanningPaper = isActiveDonglinPaper && !isActiveDonglin && hasSheetData
  const isActiveDonglinEmpty = isActiveDonglinPaper && !isActiveDonglin && !isPlanningPaper
  const isBanmuPaper = !!paper && (paper.data as any)?.engagement_code === 'ENG-BANMU-2024'
  const isJsdwPlanningPaper = !!paper && (paper.data as any)?.engagement_code === 'ENG-JSDW-2025'
    && ['Y1','Y2','Y3','Y4','Y5','Y8','X1','X4'].includes((paper.data as any)?.index)
  const currentPaperState = paper ? paperStateOf(paper) : undefined

  const [fillingPaper, setFillingPaper] = useState(false)
  async function handleBanmuFill() {
    if (!paper) return
    const paperIndex = (paper.data as any)?.index as string
    setFillingPaper(true)
    try {
      await api.banmuFill(paperIndex)
      qc.invalidateQueries({ queryKey: ['object', paper.id] })
      qc.invalidateQueries({ queryKey: ['objects', 'FillDecision'] })
      qc.invalidateQueries({ queryKey: ['objects', 'WorkingPaper'] })
      setRightTab('audit')
      setRightCollapsed(false)
    } catch (e: any) {
      alert(`填稿失败：${e.message}`)
    } finally {
      setFillingPaper(false)
    }
  }

  async function handleCheckpointConfirmed(relatedIndices: string[], extra?: { checkpointId?: string; selectValue?: string }) {
    // 会计准则确认：调专用接口写入 Engagement 并重填 X1/Y5
    if (extra?.checkpointId === 'X-gaap' && extra.selectValue) {
      try {
        await api.banmuSetAccountingStandard(extra.selectValue)
        // 重新拉取所有受影响的底稿（X1, Y5）
        const papersToRefresh = currentProjectPapers.filter(p => {
          const idx = ((p.data as any)?.index as string || '').split('.')[0]
          return ['X1', 'Y5'].includes(idx)
        })
        papersToRefresh.forEach(p => qc.invalidateQueries({ queryKey: ['object', p.id] }))
        qc.invalidateQueries({ queryKey: ['objects', 'FillDecision'] })
        qc.invalidateQueries({ queryKey: ['objects', 'WorkingPaper'] })
      } catch (e: any) {
        console.error('设置会计准则失败：', e)
      }
      return
    }

    // 普通确认：对每个相关底稿调 banmuFill
    const toUpdate = currentProjectPapers.filter(p => {
      const idx = ((p.data as any)?.index as string || '').split('.')[0]
      return relatedIndices.some(i => i.split('.')[0] === idx)
    })
    await Promise.all(toUpdate.map(async p => {
      const idx = (p.data as any)?.index as string
      try {
        await api.banmuFill(idx)
        qc.invalidateQueries({ queryKey: ['object', p.id] })
      } catch {}
    }))
    qc.invalidateQueries({ queryKey: ['objects', 'FillDecision'] })
    qc.invalidateQueries({ queryKey: ['objects', 'WorkingPaper'] })
  }

  async function handleJsdwFill() {
    if (!paper) return
    const paperIndex = (paper.data as any)?.index as string
    setFillingPaper(true)
    try {
      await api.donglinFillPlanning(paperIndex)
      qc.invalidateQueries({ queryKey: ['object', paper.id] })
      qc.invalidateQueries({ queryKey: ['objects', 'FillDecision'] })
      qc.invalidateQueries({ queryKey: ['objects', 'WorkingPaper'] })
      setRightTab('audit')
      setRightCollapsed(false)
    } catch (e: any) {
      alert(`填稿失败：${e.message}`)
    } finally {
      setFillingPaper(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top: 项目级 ProgressBar */}
      <WorkbenchProgressBar
        engagementName={activeEngagement?.display_name}
        paperName={paper?.display_name}
        paperStatus={currentPaperState}
        stages={stageStats}
        totalPapers={currentProjectPapers.length}
        statusCounts={statusCounts}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left: 4 级树 (可收起) */}
        <div className={cn(
          'shrink-0 bg-white border-r border-slate-200 flex flex-col transition-[width] duration-200',
          leftCollapsed ? 'w-11' : 'w-64',
        )}>
          {leftCollapsed ? (
            // —— 收起态：仅图标条 ——
            <div className="flex flex-col items-center pt-3 gap-1.5 flex-1">
              <button
                onClick={() => setLeftCollapsed(false)}
                className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                title="展开底稿树"
              >
                <PanelLeftOpen size={14} />
              </button>
              <div className="w-6 h-px bg-slate-200 my-1" />
              {/* 项目图标 */}
              <button
                onClick={() => setLeftCollapsed(false)}
                className="p-1.5 rounded text-brand-600 hover:bg-brand-50"
                title={activeEngagement?.display_name || '项目'}
              >
                <Building2 size={14} />
              </button>
              <div className="w-6 h-px bg-slate-200 my-1" />
              {/* 阶段快捷跳转：点击任一阶段图标 → 展开并展开该阶段 */}
              {STAGE_TREE.map((stage) => {
                const cnt = Object.values(papersByStageCat[stage.code] || {}).flat().length
                if (cnt === 0) return null
                return (
                  <button
                    key={stage.code}
                    onClick={() => {
                      setLeftCollapsed(false)
                      setOpenStages((p) => new Set([...p, stage.code]))
                    }}
                    className="p-1 rounded hover:bg-slate-100 flex flex-col items-center"
                    title={`${stage.label} (${cnt})`}
                  >
                    <span className="text-[14px] leading-none">{stage.label.split(' ')[0]}</span>
                    <span className="text-[9px] text-slate-400 leading-tight">{cnt}</span>
                  </button>
                )
              })}
              <div className="flex-1" />
              {/* 上一张 / 下一张（vertical） */}
              <button
                disabled={!prevPaper}
                onClick={() => prevPaper && nav(`/workbench/${prevPaper.id}`)}
                className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                title="上一张"
              >
                <ChevronUp size={13} />
              </button>
              <button
                disabled={!nextPaper}
                onClick={() => nextPaper && nav(`/workbench/${nextPaper.id}`)}
                className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 mb-2"
                title="下一张"
              >
                <ChevronDown size={13} />
              </button>
            </div>
          ) : (
          <>
          {/* —— 展开态：完整树 —— */}
          {/* 项目切换器 header */}
          <div className="border-b border-slate-200 bg-slate-50/50">
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <Link to="/" className="text-[11px] text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
                <ChevronLeft size={11} /> 返回首页
              </Link>
              <button
                onClick={() => setLeftCollapsed(true)}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                title="收起底稿树"
              >
                <PanelLeftClose size={12} />
              </button>
            </div>
            <button
              onClick={() => setShowProjectSwitcher((v) => !v)}
              className="w-full px-4 pb-3 pt-1 flex items-start gap-2 text-left hover:bg-slate-100/50"
            >
              <Building2 size={14} className="text-brand-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">当前项目</div>
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {activeEngagement?.display_name || '请选择项目'}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {currentProjectPapers.length} 张底稿
                </div>
              </div>
              {showProjectSwitcher
                ? <ChevronUp size={14} className="text-slate-400 shrink-0 mt-1" />
                : <ChevronDown size={14} className="text-slate-400 shrink-0 mt-1" />}
            </button>
            {showProjectSwitcher && (
              <div className="border-t border-slate-200 bg-white max-h-60 overflow-y-auto">
                {engagements.map((e) => {
                  const ec = (e.data as any)?.code
                  const cnt = papers.filter((p) => (p.data as any)?.engagement_code === ec).length
                  const isActive = ec === activeEngCode
                  return (
                    <button key={e.id}
                            onClick={() => switchProject(ec)}
                            disabled={cnt === 0}
                            className={cn(
                              'w-full px-4 py-2 text-left text-xs flex items-center gap-2 hover:bg-slate-50 disabled:opacity-40',
                              isActive && 'bg-brand-50 text-brand-700',
                            )}>
                      <Building2 size={11} className="text-slate-400 shrink-0" />
                      <span className="flex-1 truncate">{e.display_name}</span>
                      <span className="text-[10px] text-slate-400">{cnt}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 阶段→类别→主表→子表 4 级树 */}
          <div className="flex-1 overflow-y-auto py-2">
            {isBanmuProject ? (
              <>
                {BANMU_PHASE_SUMMARIES.map((phase, phaseIdx) => {
                  const phasePapers = currentProjectPapers.filter(p => {
                    const idx = ((p.data as any)?.index as string || '').split('.')[0]
                    return phase.paperIndices.some(pi => pi.split('.')[0] === idx)
                  })
                  if (phasePapers.length === 0) return null
                  const isOpen = openBanmuPhases.has(phase.id)
                  const doneCount = phasePapers.filter(p => paperStateOf(p) === '完成').length
                  return (
                    <div key={phase.id}>
                      <button
                        onClick={() => toggleBanmuPhase(phase.id)}
                        className="w-full px-3 py-1.5 flex items-center gap-1.5 text-left hover:bg-slate-50"
                      >
                        {isOpen ? <ChevronDown size={11} className="text-slate-400" /> : <ChevronRight size={11} className="text-slate-400" />}
                        <span className="text-[11px]">{phase.icon}</span>
                        <span className="text-xs font-semibold text-slate-700">{`P${phaseIdx + 1} · ${phase.title}`}</span>
                        <Badge tone="neutral" className="!text-[10px] ml-auto !h-4">{phasePapers.length}</Badge>
                        {doneCount > 0 && <Badge tone="green" className="!text-[10px] !h-4">✓{doneCount}</Badge>}
                      </button>
                      {isOpen && phasePapers.map(mainPaper => {
                        const idx = (mainPaper.data as any)?.index as string
                        const name = (mainPaper.data as any)?.name || mainPaper.display_name?.replace(/^[A-Z]+\d*\s+/, '')
                        const isMainActive = mainPaper.id === activeId
                        const subSheets = getSubSheets(mainPaper)
                        const hasChildren = subSheets.length > 0
                        const mainOpen = openMains.has(mainPaper.id)
                        const mainState = paperStateOf(mainPaper)
                        return (
                          <div key={mainPaper.id}>
                            <div className="flex items-stretch">
                              {hasChildren && (
                                <button
                                  onClick={() => toggleMain(mainPaper.id)}
                                  className="pl-6 shrink-0 pr-1 text-slate-400 hover:text-slate-700"
                                >
                                  {mainOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  nav(`/workbench/${mainPaper.id}`)
                                  setActiveSheetParam(null)
                                  if (hasChildren && !mainOpen) toggleMain(mainPaper.id)
                                }}
                                className={cn(
                                  'flex-1 text-left pr-2 py-1.5 flex items-center gap-1.5 text-xs transition-colors',
                                  !hasChildren && 'pl-6',
                                  isMainActive && !activeSheetParam
                                    ? 'bg-brand-50 text-brand-900 font-medium'
                                    : 'hover:bg-slate-50 text-slate-800',
                                )}
                                title={mainState}
                              >
                                <span className={cn('w-2 h-2 rounded-full shrink-0', statusDotClass(mainState))} />
                                <span className={cn('font-mono text-[10px] w-9 shrink-0 font-semibold', isMainActive ? 'text-brand-600' : 'text-slate-500')}>{idx}</span>
                                <span className="flex-1 truncate">{name}</span>
                                {hasChildren && <span className="text-[9px] text-slate-400 shrink-0">{subSheets.length}</span>}
                                {mainState === 'AI 已填' && <span className="text-[9px] bg-violet-100 text-violet-700 rounded-full px-1 shrink-0">✨</span>}
                              </button>
                            </div>
                            {mainOpen && subSheets.map(sheetCode => {
                              const isSubActive = isMainActive && activeSheetParam === sheetCode
                              return (
                                <button
                                  key={sheetCode}
                                  onClick={() => {
                                    if (mainPaper.id !== activeId) nav(`/workbench/${mainPaper.id}?sheet=${sheetCode}`)
                                    else setActiveSheetParam(sheetCode)
                                  }}
                                  className={cn(
                                    'w-full text-left pr-2 py-1 flex items-center gap-1.5 text-[11px] transition-colors pl-12',
                                    isSubActive ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50 text-slate-600',
                                  )}
                                >
                                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', sheetCode === 'summary' ? 'bg-violet-400' : 'bg-slate-300')} />
                                  <span className={cn('font-mono text-[10px] w-14 shrink-0', isSubActive ? 'text-brand-600' : 'text-slate-400')}>
                                    {sheetCode === 'summary' ? `${idx}` : `${idx}-${shortenCode(sheetCode)}`}
                                  </span>
                                  <span className="flex-1 truncate">{SHEET_LABEL[sheetCode] || sheetCode}</span>
                                </button>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                {currentProjectPapers.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-slate-400">本项目还没有底稿</div>
                )}
              </>
            ) : (
              <>
                {STAGE_TREE.map((stage) => {
                  const stageData = papersByStageCat[stage.code] || {}
                  const allInStage = Object.values(stageData).flat()
                  if (allInStage.length === 0) return null
                  const isOpen = openStages.has(stage.code)
                  const doneCount = allInStage.filter((p) => paperStateOf(p) === '完成').length
                  const hasMultipleCats = stage.cats.filter((c) => (stageData[c.code] || []).length > 0).length > 1
                  return (
                    <div key={stage.code}>
                      <button
                        onClick={() => toggleStage(stage.code)}
                        className="w-full px-3 py-1.5 flex items-center gap-1.5 text-left hover:bg-slate-50"
                      >
                        {isOpen
                          ? <ChevronDown size={11} className="text-slate-400" />
                          : <ChevronRight size={11} className="text-slate-400" />}
                        <span className="text-xs font-semibold text-slate-700">{stage.label}</span>
                        <Badge tone="neutral" className="!text-[10px] ml-auto !h-4">{allInStage.length}</Badge>
                        {doneCount > 0 && <Badge tone="green" className="!text-[10px] !h-4">✓{doneCount}</Badge>}
                      </button>
                      {isOpen && stage.cats.map((cat) => {
                        const list = stageData[cat.code] || []
                        if (list.length === 0) return null
                        const catKey = `${stage.code}:${cat.code}`
                        const catOpen = openCats.has(catKey) || !hasMultipleCats
                        const catDone = list.filter((p) => paperStateOf(p) === '完成').length
                        return (
                          <div key={cat.code}>
                            {hasMultipleCats && (
                              <button
                                onClick={() => toggleCat(catKey)}
                                className="w-full pl-6 pr-3 py-1 flex items-center gap-1.5 text-left hover:bg-slate-50"
                              >
                                {catOpen
                                  ? <ChevronDown size={10} className="text-slate-400" />
                                  : <ChevronRight size={10} className="text-slate-400" />}
                                <span className="text-[11px] font-medium text-slate-600">{cat.label}</span>
                                <Badge tone="neutral" className="!text-[10px] ml-auto !h-4">{list.length}</Badge>
                                {catDone > 0 && <Badge tone="green" className="!text-[9px] !h-4">✓{catDone}</Badge>}
                              </button>
                            )}
                            {catOpen && list.map((mainPaper) => {
                              const idx = (mainPaper.data as any)?.index as string
                              const name = (mainPaper.data as any)?.name || mainPaper.display_name?.replace(/^[A-Z]+\d*\s+/, '')
                              const isMainActive = mainPaper.id === activeId
                              const subSheets = getSubSheets(mainPaper)
                              const hasChildren = subSheets.length > 0
                              const mainOpen = openMains.has(mainPaper.id)
                              const mainState = paperStateOf(mainPaper)
                              const baseIndent = hasMultipleCats ? 'pl-6' : 'pl-3'
                              const subIndent = hasMultipleCats ? 'pl-12' : 'pl-9'
                              return (
                                <div key={mainPaper.id}>
                                  {/* 主表行 */}
                                  <div className="flex items-stretch">
                                    {hasChildren && (
                                      <button
                                        onClick={() => toggleMain(mainPaper.id)}
                                        className={cn(baseIndent, 'shrink-0 pr-1 text-slate-400 hover:text-slate-700')}
                                        title={mainOpen ? '收起明细' : `展开 ${subSheets.length} 张明细`}
                                      >
                                        {mainOpen
                                          ? <ChevronDown size={10} />
                                          : <ChevronRight size={10} />}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        nav(`/workbench/${mainPaper.id}`)
                                        setActiveSheetParam(null)
                                        // 有子表时自动展开
                                        if (hasChildren && !mainOpen) toggleMain(mainPaper.id)
                                      }}
                                      className={cn(
                                        'flex-1 text-left pr-2 py-1.5 flex items-center gap-1.5 text-xs transition-colors',
                                        !hasChildren && baseIndent,
                                        isMainActive && !activeSheetParam
                                          ? 'bg-brand-50 text-brand-900 font-medium'
                                          : 'hover:bg-slate-50 text-slate-800',
                                      )}
                                      title={mainState}
                                    >
                                      <span className={cn(
                                        'w-2 h-2 rounded-full shrink-0',
                                        statusDotClass(mainState),
                                      )} />
                                      <span className={cn(
                                        'font-mono text-[10px] w-9 shrink-0 font-semibold',
                                        isMainActive ? 'text-brand-600' : 'text-slate-500',
                                      )}>{idx}</span>
                                      <span className="flex-1 truncate">{name}</span>
                                      {hasChildren && (
                                        <span className="text-[9px] text-slate-400 shrink-0">{subSheets.length}</span>
                                      )}
                                      {mainState === 'AI 已填' && (
                                        <span className="text-[9px] bg-violet-100 text-violet-700 rounded-full px-1 shrink-0" title="AI 已填">✨</span>
                                      )}
                                    </button>
                                  </div>
                                  {/* 子表（明细）行 */}
                                  {mainOpen && subSheets.map((sheetCode) => {
                                    const isSubActive = isMainActive && activeSheetParam === sheetCode
                                    return (
                                      <button
                                        key={sheetCode}
                                        onClick={() => {
                                          if (mainPaper.id !== activeId) nav(`/workbench/${mainPaper.id}?sheet=${sheetCode}`)
                                          else setActiveSheetParam(sheetCode)
                                        }}
                                        className={cn(
                                          'w-full text-left pr-2 py-1 flex items-center gap-1.5 text-[11px] transition-colors',
                                          subIndent,
                                          isSubActive ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50 text-slate-600',
                                        )}
                                      >
                                        <span className={cn(
                                          'w-1.5 h-1.5 rounded-full shrink-0',
                                          sheetCode === 'summary' ? 'bg-violet-400' : 'bg-slate-300',
                                        )} />
                                        <span className={cn(
                                          'font-mono text-[10px] w-14 shrink-0',
                                          isSubActive ? 'text-brand-600' : 'text-slate-400',
                                        )}>{sheetCode === 'summary' ? `${idx}` : `${idx}-${shortenCode(sheetCode)}`}</span>
                                        <span className="flex-1 truncate">{SHEET_LABEL[sheetCode] || sheetCode}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                {currentProjectPapers.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-slate-400">
                    本项目还没有底稿
                  </div>
                )}
              </>
            )}
          </div>

          {/* prev/next paper */}
          <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 flex items-center gap-1 text-xs">
            <button
              disabled={!prevPaper}
              onClick={() => prevPaper && nav(`/workbench/${prevPaper.id}`)}
              className="flex-1 px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
            >
              <ChevronLeft size={11} /> 上一张
            </button>
            <button
              disabled={!nextPaper}
              onClick={() => nextPaper && nav(`/workbench/${nextPaper.id}`)}
              className="flex-1 px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
            >
              下一张 <ChevronRight size={11} />
            </button>
          </div>
          </>
          )}
        </div>

        {/* Center: paper workbook */}
        <div className="flex-1 overflow-y-auto bg-slate-50/40">
          {paper ? (
            <div className="max-w-5xl mx-auto px-6 py-5 space-y-4">
              {/* Header */}
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-brand-600 text-white grid place-items-center shrink-0">
                  <FileSpreadsheet size={22} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl font-semibold text-slate-900">{paper.display_name}</h1>
                    <span className="font-mono text-xs text-slate-500">{(paper.data as any)?.index}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>项目：{engByCode((paper.data as any)?.engagement_code || '—')}</span>
                    <span>·</span>
                    <span>{getSubSheets(paper).length} 个子表</span>
                    {activeSheetParam && (
                      <>
                        <span>·</span>
                        <span className="text-brand-700 font-medium">
                          当前 → {SHEET_LABEL[activeSheetParam] || activeSheetParam}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Badge
                  tone={
                    currentPaperState === '完成' ? 'green'
                      : currentPaperState === '待 review' ? 'amber'
                      : currentPaperState === 'AI 已填' ? 'brand'
                      : 'neutral'
                  }
                  className="!h-7 px-3"
                >
                  {currentPaperState || '—'}
                </Badge>
              </div>

              {/* 待确认 banner + 重新填表 — shown for planning papers (Y/X filled) */}
              {isPlanningPaper && isBanmuPaper && (
                <div className="flex items-center gap-2">
                  {pendingDecisionsForPaper.length > 0 && (
                    <button
                      onClick={() => { setRightTab('audit'); setRightCollapsed(false) }}
                      className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 hover:bg-amber-100 transition-colors"
                    >
                      <AlertTriangle size={14} className="shrink-0 text-amber-500" />
                      <span className="font-medium">有 {pendingDecisionsForPaper.length} 项待确认</span>
                      <span className="text-amber-600">— 点击在右侧面板中查看并确认</span>
                      <ChevronRight size={13} className="ml-auto shrink-0" />
                    </button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={fillingPaper}
                    onClick={handleBanmuFill}
                    className="shrink-0 text-slate-500 border border-slate-200 hover:border-slate-300"
                  >
                    {fillingPaper
                      ? <><span className="animate-spin mr-1">⏳</span>AI 重新填稿中…</>
                      : <><RefreshCw size={13} /> 重新填表</>
                    }
                  </Button>
                </div>
              )}

              {/* 东林已填 → DonglinPaperView */}
              {isActiveDonglin && activeDonglinCode && (
                <DonglinPaperView
                  paperCode={activeDonglinCode}
                  paperId={paper.id}
                  paperData={paper.data}
                  activeSheetProp={activeSheetParam}
                  onActiveSheetChange={(s) => setActiveSheetParam(s)}
                />
              )}

              {/* 计划阶段底稿 (Y/X 系列, sheet_data 已填) → 通用视图 */}
              {isPlanningPaper && paper && (
                <PlanningPaperView
                  paperIndex={(paper.data as any)?.index || ''}
                  paperName={paper.display_name || ''}
                  paperData={paper.data}
                  activeSheet={activeSheetParam}
                  onActiveSheetChange={(s) => setActiveSheetParam(s)}
                />
              )}

              {/* 东林未填 → 空状态 */}
              {isActiveDonglinEmpty && (
                <Card className="p-6 bg-gradient-to-br from-slate-50 to-white border-slate-200/80">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-slate-100 text-slate-400 grid place-items-center shrink-0">
                      <ClipboardList size={22} />
                    </div>
                    <div className="flex-1">
                      <div className="text-base font-semibold text-slate-900 mb-1">
                        此底稿尚未由 AI Agent 填稿
                      </div>
                      <div className="text-xs text-slate-600 leading-relaxed mb-3">
                        <span className="font-mono px-1.5 py-0.5 mx-1 rounded bg-slate-100">
                          {(paper.data as any)?.index} {paper.display_name?.replace(/^[A-Z]+\d*\s+/, '')}
                        </span>
                        {isBanmuPaper
                          ? '点击下方按钮，AI 将根据斑目账套数据和东林所知识自动预填此底稿，遇到需要人工判断的节点会暂停等待。'
                          : isJsdwPlanningPaper
                          ? '点击下方按钮，AI 将根据江苏大王账套数据和东林所知识自动预填此底稿，遇到需要人工判断（如适用会计准则）的节点会暂停等待。'
                          : <>尚未配置 fill 函数；目前 Demo 已实现的 5 张是
                            <span className="font-mono"> A1 / A6 / A9 / A24 / B1</span>。
                            点击右侧 <strong>「任务」</strong> 标签页查看相关本体规则。</>
                        }
                      </div>
                      <div className="flex items-center gap-2">
                        {(isBanmuPaper || isJsdwPlanningPaper) ? (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={fillingPaper}
                            onClick={isBanmuPaper ? handleBanmuFill : handleJsdwFill}
                          >
                            {fillingPaper
                              ? <><span className="animate-spin mr-1">⏳</span>AI 填稿中…</>
                              : <><Sparkles size={13} /> AI 预填底稿</>
                            }
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => window.dispatchEvent(new CustomEvent('chat:submit', {
                              detail: `请基于本体知识库帮我填写 ${(paper.data as any)?.index} ${paper.display_name} 底稿。`,
                            }))}
                          >
                            <Sparkles size={13} /> 让 Agent 用本体知识填写
                          </Button>
                        )}
                        {!isBanmuPaper && !isJsdwPlanningPaper && (
                          <a href="/ontology" className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1">
                            查看相关本体对象 →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          ) : (
            <div className="h-full grid place-items-center text-slate-500">请选择一份底稿</div>
          )}
        </div>

        {/* Right: tabbed panel (collapsible) */}
        <div className={cn(
          'shrink-0 border-l border-slate-200 bg-white flex flex-col transition-[width] duration-200',
          rightCollapsed ? 'w-11' : 'w-[420px]',
        )}>
          {/* Tab bar / collapsed icon strip */}
          {rightCollapsed ? (
            <div className="flex flex-col items-center border-b border-slate-200 bg-slate-50/60 shrink-0 py-2 gap-1">
              <button onClick={() => setRightCollapsed(false)} className="p-1.5 rounded text-slate-500 hover:bg-slate-100" title="展开侧栏">
                <PanelRightOpen size={14} />
              </button>
              <div className="w-6 h-px bg-slate-200 my-1" />
              <button onClick={() => { setRightTab('rules'); setRightCollapsed(false) }}
                      className={cn('p-1.5 rounded text-slate-500 hover:text-violet-700 hover:bg-violet-50', rightTab === 'rules' && 'text-violet-700')}
                      title="任务"><ClipboardList size={14} /></button>
              <button onClick={() => { setRightTab('audit'); setRightCollapsed(false) }}
                      className={cn('p-1.5 rounded hover:bg-amber-50', rightTab === 'audit' ? 'text-amber-600' : 'text-slate-500 hover:text-amber-600')}
                      title="对话">
                <MessageSquare size={14} />
              </button>
            </div>
          ) : (
            <div className="flex border-b border-slate-200 bg-slate-50/60 shrink-0">
              <button onClick={() => setRightTab('rules')}
                      className={cn('flex-1 px-2 py-2 text-[12px] font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors',
                        rightTab === 'rules' ? 'border-violet-600 text-violet-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700')}>
                <ClipboardList size={13} /> 任务
              </button>
              <button onClick={() => setRightTab('audit')}
                      className={cn('flex-1 px-2 py-2 text-[12px] font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors',
                        rightTab === 'audit' ? 'border-amber-500 text-amber-700 bg-white' : 'border-transparent text-slate-500 hover:text-amber-600')}>
                <MessageSquare size={13} /> 对话
              </button>
              <button onClick={() => setRightCollapsed(true)} className="px-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 border-l border-slate-200" title="收起侧栏">
                <PanelRightClose size={13} />
              </button>
            </div>
          )}

          {/* Tab content */}
          <div className={cn('flex-1 min-h-0 overflow-hidden', rightCollapsed && 'hidden')}>
            {rightTab === 'rules' && (
              isBanmuPaper ? (
                <BanmuTaskPanel
                  paperIndex={paper ? (paper.data as any)?.index : undefined}
                  paperId={paper?.id}
                  engagementCode={activeEngCode}
                  onCheckpointConfirmed={handleCheckpointConfirmed}
                  onAskInChat={handleAskInChat}
                  className="h-full"
                />
              ) : (
                paper && (
                  <WorkbenchKnowledgePanel
                    paperCode={activeDonglinCode}
                    paperIndex={(paper.data as any)?.index}
                    paperId={paper.id}
                    isPlanningPaper={isPlanningPaper}
                    className="h-full"
                  />
                )
              )
            )}
            {rightTab === 'audit' && (
              <AuditConfirmPanel
                paperId={paper?.id}
                paperIndex={paper ? ((paper.data as any)?.index as string) : undefined}
                currentProjectPapers={currentProjectPapers}
                activeId={activeId}
                engagementCode={activeEngCode}
                externalQuote={pendingChatQuote}
                onExternalQuoteConsumed={() => setPendingChatQuote(undefined)}
                onNavigate={(id) => nav(`/workbench/${id}`)}
                onAfterRun={() => qc.invalidateQueries()}
                className="h-full"
              />
            )}
          </div>
        </div>
      </div>

      <CorrectionLayer />
    </div>
  )
}

function shortenCode(s: string): string {
  return ({
    summary: 'S',
    bank_detail: 'bank',
    cash_count: 'cash',
    cutoff_test: 'cut',
    customer_detail: 'cust',
    aging_analysis: 'age',
    employee_detail: 'emp',
    asset_detail: 'ast',
    loan_detail: 'loan',
    depreciation: 'dep',
    related_guarantee: 'rg',
    interest_recalc: 'int',
  } as Record<string, string>)[s] || s.slice(0, 4)
}

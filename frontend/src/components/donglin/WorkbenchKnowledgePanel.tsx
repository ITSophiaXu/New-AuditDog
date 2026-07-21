/** 底稿工作台右侧"填表规则"面板
 *
 *   ▶ 重新填本表 (按钮)
 *   📜 应用的审计规则（含 formal_expression + 引用准则）
 *   🧮 使用的算法（含伪代码 + 选型理由 + Review 状态）
 *   📐 引用的准则/法律
 *   Σ  模板填表公式 (v5 FillRule)
 *   🗂 数据源
 *   🔀 填表流程概览
 *
 * 数据全部从后端实时拉：AuditRule / AuditMethod / AccountingStandard / LawArticle / FillRule。
 */
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Scale, Calculator, BookOpen, Database, GitBranch, Sparkles,
  ChevronDown, ChevronRight, FileSpreadsheet, RefreshCw, Sigma,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import {
  donglinApi, DonglinPaperCode, DONGLIN_PAPER_CODES, ProvenanceCell,
} from '@/lib/donglin'

type Props = {
  paperCode: DonglinPaperCode | null
  paperIndex: string | undefined
  paperId?: number
  isPlanningPaper?: boolean
  paperData?: any
  engagementName?: string
  accountingStandard?: string
  className?: string
}

// ── 从 ontology_refs 抽出算法名/规则代号 ──
function extractRefs(refs: string[]) {
  const algos: string[] = []
  const rules: string[] = []
  for (const r of refs) {
    const a = r.match(/(?:AT::\w+|OT::Knowledge)\s*\(([^)]+)\)/)
    if (a) { algos.push(a[1].trim()); continue }
    const ru = r.match(/Rule::([\w-]+)/)
    if (ru) rules.push(ru[1])
  }
  return { algos, rules }
}

// 算法名模糊匹配：忽略"算法/方法/规则"后缀差异
const norm = (s: string) =>
  s.replace(/(?:算法|方法|规则|计算)$/g, '').trim().toLowerCase()

function fallbackGuidance(paperIndex?: string) {
  const letter = (paperIndex || '').match(/^([A-Z]+)/)?.[1] || ''
  if (['X', 'Y'].includes(letter)) {
    return {
      methods: [
        { code: 'PLAN-01', name: '项目承接与风险识别', description: '结合客户背景、行业、前期事项和独立性结果形成总体计划。' },
        { code: 'MAT-01', name: '重要性水平与风险应对', description: '测算 PM、TE 和明显微小金额，并据此设计审计程序。' },
      ],
      standards: [
        { code: 'CSA-1201', name: '计划审计工作' },
        { code: 'CSA-1211', name: '识别和评估重大错报风险' },
        { code: 'CSA-1221', name: '计划和执行审计工作时的重要性' },
      ],
    }
  }
  if (['Z', 'ZK', 'ZS'].includes(letter)) {
    return {
      methods: [
        { code: 'FS-01', name: '审定TB生成报表与附注', description: '将科目审定结果映射到主表和附注并执行跨表勾稽。' },
        { code: 'REPORT-01', name: '报告层面复核', description: '汇总未更正错报、披露缺口和意见影响。' },
      ],
      standards: [
        { code: 'CSA-1501', name: '对财务报表形成审计意见和出具审计报告' },
        { code: 'CAS-DISCLOSURE', name: '适用财务报告编制基础的列报与披露要求' },
      ],
    }
  }
  return {
    methods: [
      { code: 'SUB-01', name: '账表勾稽与明细核对', description: '将总账、明细账、报表列报和外部证据逐层核对。' },
      { code: 'SUB-02', name: '分析性程序与细节测试', description: '按余额、发生额、账龄和风险执行抽样、函证、重算或截止测试。' },
    ],
    standards: [
      { code: 'CSA-1301', name: '审计证据' },
      { code: 'CSA-1312', name: '函证' },
      { code: 'CSA-1314', name: '审计抽样' },
    ],
  }
}

export default function WorkbenchKnowledgePanel({
  paperCode,
  paperIndex,
  paperId,
  isPlanningPaper,
  paperData,
  engagementName,
  accountingStandard,
  className,
}: Props) {
  const qc = useQueryClient()
  const [refilling, setRefilling] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(['rules', 'methods', 'standards']),
  )
  const toggle = (k: string) => setOpenGroups((s) => {
    const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n
  })

  const canRefill = !!paperCode && DONGLIN_PAPER_CODES.includes(paperCode)
  async function runRefill() {
    if (!canRefill) return
    setRefilling(true)
    try {
      await donglinApi.fill(paperCode!)
      if (paperId) await qc.invalidateQueries({ queryKey: ['object', paperId] })
      await qc.invalidateQueries({ queryKey: ['donglin-provenance', paperCode] })
      await qc.invalidateQueries({ queryKey: ['donglin-adjustments'] })
    } finally {
      setRefilling(false)
    }
  }

  // —— 本表的填稿运行 + 单元格追溯 ——
  const { data: runs = [] } = useQuery({
    queryKey: ['donglin-agent-runs'],
    queryFn: () => donglinApi.listAgentRuns(),
  })
  const { data: prov } = useQuery({
    queryKey: ['donglin-provenance', paperCode],
    queryFn: () => donglinApi.getProvenance(paperCode!),
    enabled: !!paperCode,
  })
  // —— 全量本体：规则 / 算法 / 准则 / 法律 ——
  const { data: allRules = [] } = useQuery({
    queryKey: ['objects', 'AuditRule'],
    queryFn: () => api.listObjects('AuditRule'),
    staleTime: 5 * 60 * 1000,
  })
  const { data: allMethods = [] } = useQuery({
    queryKey: ['objects', 'AuditMethod'],
    queryFn: () => api.listObjects('AuditMethod'),
    staleTime: 5 * 60 * 1000,
  })
  const { data: allStandards = [] } = useQuery({
    queryKey: ['objects', 'AccountingStandard'],
    queryFn: () => api.listObjects('AccountingStandard'),
    staleTime: 5 * 60 * 1000,
  })
  const { data: allLaws = [] } = useQuery({
    queryKey: ['objects', 'LawArticle'],
    queryFn: () => api.listObjects('LawArticle'),
    staleTime: 5 * 60 * 1000,
  })
  // —— v5 FillRule (本底稿模板的 Excel 公式) ——
  const { data: allFillRules = [] } = useQuery({
    queryKey: ['objects', 'FillRule'],
    queryFn: () => api.listObjects('FillRule'),
    staleTime: 5 * 60 * 1000,
  })
  const paperFillRules = useMemo(() => {
    if (!paperIndex) return []
    const tplKey = `tpl-${paperIndex.toLowerCase()}`
    return allFillRules.filter((r) => {
      const t = (r.data as any)?.appliesToWorkpaper || ''
      return t === tplKey || t.startsWith(tplKey + '-')
    })
  }, [allFillRules, paperIndex])

  const myRun = useMemo(
    () => (paperCode ? runs.find((r: any) => r.paper_code === paperCode) : null) as any,
    [runs, paperCode],
  )

  // —— 聚合：本表里实际触发的 规则代号 / 算法名 + 频次 ——
  const usage = useMemo(() => {
    const ruleHits = new Map<string, { count: number; ctx: string[] }>()
    const algoHits = new Map<string, { count: number; ctx: string[] }>()

    const bump = (m: Map<string, any>, key: string, ctx?: string) => {
      const cur = m.get(key) || { count: 0, ctx: [] }
      cur.count += 1
      if (ctx && cur.ctx.length < 3) cur.ctx.push(ctx)
      m.set(key, cur)
    }

    if (myRun) {
      for (const tc of myRun.tool_calls || []) {
        const { algos, rules } = extractRefs(tc.ontology_refs || [])
        const ctx = tc.result_summary?.slice(0, 80)
        algos.forEach((a) => bump(algoHits, a, ctx))
        rules.forEach((r) => bump(ruleHits, r, ctx))
      }
    }
    for (const c of Object.values(prov?.cells || {}) as ProvenanceCell[]) {
      for (const t of c.trace) {
        const { algos, rules } = extractRefs(t.ontology_refs || [])
        const ctx = t.source_detail?.slice(0, 80)
        algos.forEach((a) => bump(algoHits, a, ctx))
        rules.forEach((r) => bump(ruleHits, r, ctx))
        if (t.rule_code) bump(ruleHits, t.rule_code, ctx)
      }
    }
    return { ruleHits, algoHits }
  }, [myRun, prov])

  // —— 匹配到本体实例（带完整信息）——
  const matchedRules = useMemo(() => {
    return allRules
      .filter((r) => usage.ruleHits.has((r.data as any)?.code))
      .map((r) => ({
        instance: r,
        info: usage.ruleHits.get((r.data as any).code)!,
      }))
  }, [allRules, usage])

  const matchedMethods = useMemo(() => {
    const targets = new Set([...usage.algoHits.keys()].map(norm))
    return allMethods
      .filter((m) => targets.has(norm((m.data as any)?.name || '')))
      .map((m) => {
        const name = (m.data as any).name
        const directKey = [...usage.algoHits.keys()].find((k) => norm(k) === norm(name)) || name
        return {
          instance: m,
          info: usage.algoHits.get(directKey) || { count: 0, ctx: [] },
        }
      })
  }, [allMethods, usage])

  const matchedStandards = useMemo(() => {
    const codes = new Set<string>()
    matchedRules.forEach((r) => {
      const refs = (r.instance.data as any)?.references_standards || []
      refs.forEach((c: string) => codes.add(c))
    })
    matchedMethods.forEach((m) => {
      const refs = (m.instance.data as any)?.references_standards || []
      refs.forEach((c: string) => codes.add(c))
    })
    return [...allStandards, ...allLaws].filter(
      (s) => codes.has((s.data as any)?.code))
  }, [matchedRules, matchedMethods, allStandards, allLaws])

  // —— 数据源文件 ——
  const dataSources = useMemo(() => {
    const m = new Map<string, number>()
    if (myRun) {
      for (const tc of myRun.tool_calls || []) {
        const file = tc.params?.source_file || tc.params?.source
        if (file) m.set(String(file), (m.get(String(file)) || 0) + 1)
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [myRun])

  // —— 计划阶段：查询底稿数据以展示填表概要 ——
  const { data: planningPaperObj } = useQuery({
    queryKey: ['object', paperId],
    queryFn: () => api.getObject(paperId!),
    enabled: !!paperId && !paperCode && !paperData,
    staleTime: 30 * 1000,
  })

  if (!paperCode) {
    const resolvedPaperData = paperData || planningPaperObj?.object?.data || {}
    const sd = (resolvedPaperData as any)?.sheet_data || {}
    const META_KEYS = new Set(['preparer', 'prepared_at', 'reviewer', 'reviewed_at'])
    const contentKeys = Object.keys(sd).filter(k => !META_KEYS.has(k))
    const preparer = sd.preparer || sd.prepared_by || ''
    const preparedAt = sd.prepared_at || ''
    const fallback = fallbackGuidance(paperIndex)
    const methods = (resolvedPaperData as any)?.methods || fallback.methods
    const standards = (resolvedPaperData as any)?.standards || fallback.standards
    const totalFields = contentKeys.reduce((n, k) => {
      const v = sd[k]
      if (v && typeof v === 'object') return n + Object.keys(v).filter(f => v[f]).length
      return n + (v ? 1 : 0)
    }, 0)

    const DATA_SOURCES: Array<{ icon: string; label: string; desc: string }> =
      (resolvedPaperData as any)?.data_sources || [
      { icon: '📊', label: '账套数据', desc: '试算平衡表、辅助账和序时账' },
      { icon: '📂', label: '客户补充材料', desc: '合同、函证、盘点和管理层资料' },
      { icon: '🧠', label: '审计知识库', desc: '会计准则、审计准则、事务所方法和行业知识' },
      { icon: '🧾', label: '其他科目底稿', desc: '审定TB、调整分录和跨表勾稽结果' },
    ]

    const SECTION_LABELS: Record<string, string> = {
        entity_understanding: '了解被审计单位',
        key_contacts: '关键人员',
        company_info: '企业基本情况',
        business_overview: '业务概况',
        internal_control: '内部控制',
        materiality: '重要性水平',
        risk_assessment: '风险评估',
        audit_plan: '审计计划',
        team_assignment: '项目组分工',
        independence: '独立性声明',
        engagement_letter: '业务约定书',
        client_acceptance: '客户接受',
    }

    return (
        <div className={cn('flex flex-col h-full overflow-auto', className)}>
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50/40 shrink-0">
            <div className="text-[10px] text-amber-600 uppercase tracking-wider">方法与准则</div>
            <div className="text-sm font-semibold text-slate-900 truncate">
              ★ {engagementName || '年审项目'} — {isPlanningPaper ? '计划底稿' : '科目底稿'}方法依据
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {paperIndex}{accountingStandard ? ` · ${accountingStandard}` : ''}
            </div>
          </div>

          <div className="p-3 space-y-3 text-xs">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                <div className="text-lg font-bold text-amber-700">{contentKeys.length}</div>
                <div className="text-[10px] text-amber-600">填写章节</div>
              </div>
              <div className="bg-green-50 rounded-lg p-2.5 text-center">
                <div className="text-lg font-bold text-green-700">{totalFields}</div>
                <div className="text-[10px] text-green-600">已填字段</div>
              </div>
            </div>

            {/* Filled sections */}
            {contentKeys.length > 0 && (
              <div className="space-y-1">
                <div className="font-semibold text-slate-700 flex items-center gap-1">
                  <BookOpen size={12} /> 已填章节
                </div>
                {contentKeys.map(k => {
                  const v = sd[k]
                  const fieldCount = v && typeof v === 'object'
                    ? Object.keys(v).filter(f => v[f]).length
                    : (v ? 1 : 0)
                  const label = SECTION_LABELS[k] || k
                  return (
                    <div key={k} className="flex items-center justify-between py-1 px-2 bg-slate-50 rounded">
                      <span className="text-slate-600">{label}</span>
                      <span className="text-slate-400 font-mono">{fieldCount} 字段</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="space-y-1">
              <div className="font-semibold text-slate-700 flex items-center gap-1">
                <Calculator size={12} /> 本底稿执行方法
              </div>
              {methods.map((method: any) => (
                <div key={method.code || method.name} className="rounded border border-violet-200 bg-violet-50/50 px-2 py-1.5">
                  <div className="text-[10px] font-mono font-semibold text-violet-700">{method.code}</div>
                  <div className="text-[11px] font-semibold text-violet-900">{method.name}</div>
                  <div className="text-[10px] leading-relaxed text-violet-700 mt-0.5">{method.description}</div>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <div className="font-semibold text-slate-700 flex items-center gap-1">
                <BookOpen size={12} /> 引用准则
              </div>
              {standards.map((standard: any) => (
                <div key={standard.code || standard.name} className="rounded border border-teal-200 bg-teal-50/50 px-2 py-1.5">
                  <span className="text-[10px] font-mono font-semibold text-teal-700">{standard.code}</span>
                  <div className="text-[11px] text-teal-900">{standard.name}</div>
                </div>
              ))}
            </div>

            {/* Data sources */}
            <div className="space-y-1">
              <div className="font-semibold text-slate-700 flex items-center gap-1">
                <Database size={12} /> 数据来源
              </div>
              {DATA_SOURCES.map(src => (
                <div key={src.label} className="flex items-start gap-2 py-1 px-2 bg-slate-50 rounded">
                  <span className="text-base leading-none mt-0.5">{src.icon}</span>
                  <div>
                    <div className="font-medium text-slate-700">{src.label}</div>
                    <div className="text-[10px] text-slate-400">{src.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Preparer */}
            {(preparer || preparedAt) && (
              <div className="border-t border-slate-100 pt-2 text-slate-400 space-y-0.5">
                {preparer && <div>编制人：<span className="text-slate-600">{preparer}</span></div>}
                {preparedAt && <div>编制日期：<span className="text-slate-600">{preparedAt}</span></div>}
              </div>
            )}

            <p className="text-slate-400 border-t border-slate-100 pt-2 leading-relaxed">
              方法、准则、数据源和人工判断点均随底稿保留；审计师确认后进入项目操作轨迹。
            </p>
          </div>
        </div>
    )
  }
  if (!myRun && !prov) {
    return (
      <div className={cn('p-4 text-xs text-slate-500', className)}>载入填表过程…</div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* —— Header —— */}
      <div className="px-3 py-2.5 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-rose-50/40 shrink-0">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider">填表规则</div>
        <div className="text-sm font-semibold text-slate-900 truncate mb-2">
          {paperIndex} 用了什么规则 / 算法 / 准则
        </div>
        <div className="flex flex-wrap gap-1 text-[10.5px] mb-2">
          <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
            📜 <strong>{matchedRules.length}</strong> 规则
          </span>
          <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-800 border border-violet-200">
            🧮 <strong>{matchedMethods.length}</strong> 算法
          </span>
          <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
            📐 <strong>{matchedStandards.length}</strong> 准则
          </span>
          <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-800 border border-violet-200">
            Σ <strong>{paperFillRules.length}</strong> 公式
          </span>
          <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
            🗂 <strong>{dataSources.length}</strong> 数据源
          </span>
        </div>
        {canRefill && (
          <button
            onClick={runRefill}
            disabled={refilling}
            className="w-full px-2.5 py-1.5 text-[11px] font-medium rounded flex items-center justify-center gap-1.5 bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {refilling ? (
              <><RefreshCw size={11} className="animate-spin" /> AI 正在重填…</>
            ) : (
              <><Sparkles size={11} /> 让 Agent 重新填本表</>
            )}
          </button>
        )}
      </div>

      {/* —— Body —— */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* 1. 应用的审计规则 */}
        <Group
          icon={<Scale size={12} className="text-rose-700" />}
          title="应用的审计规则"
          count={matchedRules.length}
          color="rose"
          open={openGroups.has('rules')}
          onToggle={() => toggle('rules')}
        >
          {matchedRules.length === 0 ? (
            <Empty text="本表无规则触发" />
          ) : (
            <ul className="space-y-1.5">
              {matchedRules.map(({ instance: r, info }) => {
                const d = r.data as any
                const refs: string[] = d?.references_standards || []
                return (
                  <li key={r.id} className="rounded border border-rose-200 bg-rose-50/40 p-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10.5px] font-mono font-bold text-rose-800">📜 {d?.code}</span>
                      <span className="ml-auto text-[10px] text-rose-500">{info.count} 次</span>
                    </div>
                    <div className="text-[11.5px] font-semibold text-rose-900 mt-0.5">{d?.name}</div>
                    {(d?.narrative || d?.expression) && (
                      <div className="text-[11px] text-rose-800 leading-snug mt-0.5">
                        {d?.narrative || d?.expression}
                      </div>
                    )}
                    {d?.formal_expression && (
                      <div className="text-[10px] font-mono text-rose-700 bg-white border border-rose-200 rounded px-1.5 py-0.5 mt-1">
                        ⚙ {d.formal_expression}
                      </div>
                    )}
                    {refs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {refs.map((c) => (
                          <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                            📐 {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Group>

        {/* 2. 使用的算法 */}
        <Group
          icon={<Calculator size={12} className="text-violet-700" />}
          title="使用的算法 / 方法"
          count={matchedMethods.length}
          color="violet"
          open={openGroups.has('methods')}
          onToggle={() => toggle('methods')}
        >
          {matchedMethods.length === 0 ? (
            <Empty text="本表暂未引用算法" />
          ) : (
            <ul className="space-y-1.5">
              {matchedMethods.map(({ instance: m, info }) => {
                const d = m.data as any
                const sev = d?.review_severity as string | undefined
                const sevBg = sev?.startsWith('关键') ? 'bg-rose-100 text-rose-800'
                  : sev?.startsWith('重要') ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-700'
                return (
                  <li key={m.id} className="rounded border border-violet-200 bg-violet-50/40 p-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10.5px] font-mono font-bold text-violet-800">🧮 {d?.code}</span>
                      <span className="text-[10px] text-violet-600">{d?.category}</span>
                      {sev && <span className={cn('text-[9.5px] px-1 py-0.5 rounded', sevBg)}>{sev}</span>}
                      <span className="ml-auto text-[10px] text-violet-500">{info.count} 次</span>
                    </div>
                    <div className="text-[11.5px] font-semibold text-violet-900 mt-0.5">{d?.name}</div>
                    <div className="text-[11px] text-violet-800 leading-snug mt-0.5">
                      {d?.algorithm_description}
                    </div>
                    {d?.formal_logic && (
                      <details className="mt-1">
                        <summary className="text-[10.5px] text-violet-700 cursor-pointer hover:underline">
                          展开伪代码
                        </summary>
                        <pre className="mt-1 text-[10px] bg-slate-900 text-emerald-300 p-1.5 rounded overflow-x-auto whitespace-pre-wrap leading-snug">{d.formal_logic}</pre>
                      </details>
                    )}
                    {d?.firm_choice_rationale && (
                      <div className="text-[10.5px] text-violet-700 mt-1">
                        <strong>选型理由：</strong>{d.firm_choice_rationale}
                      </div>
                    )}
                    {d?.fallback_method && (
                      <div className="text-[10.5px] text-violet-600 mt-0.5">
                        <strong>降级：</strong>{d.fallback_method}
                      </div>
                    )}
                    {d?.review_status && (
                      <div className="mt-1 text-[10px] text-amber-700 bg-amber-50/60 border border-amber-200 rounded px-1.5 py-0.5">
                        Review：{d.review_status}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Group>

        {/* 3. 引用的准则 / 法律 */}
        <Group
          icon={<BookOpen size={12} className="text-teal-700" />}
          title="引用的准则 / 法律"
          count={matchedStandards.length}
          color="teal"
          open={openGroups.has('standards')}
          onToggle={() => toggle('standards')}
        >
          {matchedStandards.length === 0 ? (
            <Empty text="未识别到具体准则引用" />
          ) : (
            <ul className="space-y-1">
              {matchedStandards.map((s) => {
                const d = s.data as any
                return (
                  <li key={s.id} className="rounded border border-teal-200 bg-teal-50/40 p-1.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[10.5px] font-mono font-bold text-teal-800">📐 {d?.code}</span>
                      <span className="text-[11px] text-teal-900 flex-1">{d?.name}</span>
                    </div>
                    <div className="text-[10px] text-teal-600 mt-0.5">{d?.issuer} · {d?.effective}</div>
                  </li>
                )
              })}
            </ul>
          )}
        </Group>

        {/* 4. 模板填表公式 (v5 FillRule) */}
        <Group
          icon={<Sigma size={12} className="text-violet-700" />}
          title="模板填表公式 (Excel 公式)"
          count={paperFillRules.length}
          color="violet"
          open={openGroups.has('formulas')}
          onToggle={() => toggle('formulas')}
        >
          {paperFillRules.length === 0 ? (
            <Empty text="本表暂无模板公式 (v5 仅抽了 A6/A6-2/A6-99/B6-2/ZK4 五张模板的 47 条)" />
          ) : (
            <ul className="space-y-1">
              {paperFillRules.slice(0, 50).map((fr) => {
                const d = (fr.data as any) || {}
                return (
                  <li key={fr.id} className="rounded border border-violet-200 bg-violet-50/40 p-1.5">
                    <div className="flex items-baseline gap-1.5">
                      <Sigma size={10} className="text-violet-700 shrink-0" />
                      <span className="text-[10.5px] font-mono font-semibold text-violet-900 truncate" title={fr.display_name}>
                        {fr.display_name}
                      </span>
                      <span className="text-[10px] text-violet-500 ml-auto shrink-0">
                        {d.hasRuleKind || 'rule'}
                      </span>
                    </div>
                    {d.hasFormulaExpression && (
                      <code className="block text-[10.5px] text-violet-800 bg-white border border-violet-200 rounded px-1.5 py-0.5 mt-1 break-all">
                        {d.hasFormulaExpression}
                      </code>
                    )}
                    {d.hasEvidenceRef && (
                      <div className="text-[10px] text-violet-600 font-mono mt-1 truncate" title={d.hasEvidenceRef}>
                        证据：{d.hasEvidenceRef}
                      </div>
                    )}
                  </li>
                )
              })}
              {paperFillRules.length > 50 && (
                <li className="text-[10px] text-violet-500 italic text-center py-1">
                  … 还有 {paperFillRules.length - 50} 条
                </li>
              )}
            </ul>
          )}
        </Group>

        {/* 5. 数据源 */}
        <Group
          icon={<Database size={12} className="text-sky-700" />}
          title="客户数据源"
          count={dataSources.length}
          color="sky"
          open={openGroups.has('ds')}
          onToggle={() => toggle('ds')}
        >
          {dataSources.length === 0 ? (
            <Empty text="未发现数据源" />
          ) : (
            <ul className="space-y-1">
              {dataSources.map(([f, n]) => (
                <li key={f} className="rounded border border-sky-200 bg-sky-50/40 p-1.5 flex items-center gap-2">
                  <FileSpreadsheet size={11} className="text-sky-700" />
                  <span className="text-[11px] font-mono text-sky-900 flex-1 truncate">{f}</span>
                  <span className="text-[10px] text-sky-600">读取 {n} 次</span>
                </li>
              ))}
            </ul>
          )}
        </Group>

        {/* 5. 填表流程概览 */}
        {myRun && (
          <Group
            icon={<GitBranch size={12} className="text-slate-600" />}
            title="填表流程概览"
            count={myRun.tool_calls.length}
            color="slate"
            open={openGroups.has('flow')}
            onToggle={() => toggle('flow')}
          >
            <ol className="space-y-1 list-none">
              {myRun.tool_calls.map((tc: any, i: number) => (
                <li
                  key={i}
                  className="rounded border border-slate-200 bg-white p-1.5 flex items-start gap-1.5 text-[11px]"
                >
                  <span className="font-mono text-slate-400 shrink-0 w-5 text-center">{tc.seq}</span>
                  <span className="flex-1 text-slate-700 leading-snug truncate" title={tc.result_summary}>
                    {tc.result_summary}
                  </span>
                </li>
              ))}
            </ol>
          </Group>
        )}
      </div>

      {/* —— Footer —— */}
      <div className="border-t border-slate-200 bg-slate-50/60 px-3 py-2 text-[10.5px] text-slate-500 shrink-0">
        <Sparkles size={10} className="inline text-violet-500 mr-1" />
        点底稿任意单元格 → 右下抽屉显示该格用了什么规则 / 算法 / 准则。
      </div>
    </div>
  )
}

// ── 小组件 ──
function Group({
  icon, title, count, color, open, onToggle, children,
}: {
  icon: React.ReactNode; title: string; count: number; color: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-2.5 py-1.5 flex items-center gap-1.5 hover:bg-slate-50 text-left"
      >
        {icon}
        <span className="text-[11.5px] font-semibold text-slate-800 flex-1">{title}</span>
        <span className={cn(
          'text-[10px] font-mono px-1.5 py-0.5 rounded',
          color === 'violet' && 'bg-violet-100 text-violet-700',
          color === 'rose' && 'bg-rose-100 text-rose-700',
          color === 'teal' && 'bg-teal-100 text-teal-700',
          color === 'sky' && 'bg-sky-100 text-sky-700',
          color === 'slate' && 'bg-slate-200 text-slate-700',
        )}>{count}</span>
        {open ? <ChevronDown size={11} className="text-slate-400" />
              : <ChevronRight size={11} className="text-slate-400" />}
      </button>
      {open && <div className="px-2.5 pb-2 pt-1">{children}</div>}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="text-[11px] text-slate-400 italic">{text}</div>
}

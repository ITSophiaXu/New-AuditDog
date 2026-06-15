/** 单元格追溯抽屉 — 审计师视角
 *
 * 不再展示"OT/LT/AT chip"（工程师视角），而是按审计师关心的 5 个问题：
 *   ① 这个数字是什么？（值 + 单元格地址）
 *   ② 数据从哪儿来的？（人话描述，不是 OT 代号）
 *   ③ 用了什么规则？（点击查看完整规则 + 引用准则）
 *   ④ 用了什么算法？（点击查看 AuditMethod 实例详情）
 *   ⑤ 引用了哪些准则？（CSA/CAS/法律全文）
 */
import { useQuery } from '@tanstack/react-query'
import { X, Database, BookOpen, Scale, Calculator, FileText } from 'lucide-react'
import { useMemo } from 'react'
import { api } from '@/lib/api'
import { ProvenanceCell, SOURCE_KIND_TONE } from '@/lib/donglin'
import { cn } from '@/lib/utils'

interface Props {
  cellKey: string | null
  cell: ProvenanceCell | null
  onClose: () => void
}

// ── 从 ontology_refs 里识别 算法/规则/准则 ──
// 支持格式:
//   "⚡ AT::Recompute (FIFO 账龄方法)"          AT 携带算法
//   "📦 OT::Knowledge (FIFO 账龄算法)"          OT 携带算法 (旧)
//   "📜 Rule::AR-RULE-001"                      规则代号
function parseAuditorView(refs: string[]) {
  const methodMatches: string[] = []
  const ruleCodes: string[] = []
  const otherRefs: string[] = []

  for (const r of refs) {
    const algoMatch = r.match(/(?:AT::\w+|OT::Knowledge)\s*\(([^)]+)\)/)
    if (algoMatch) {
      methodMatches.push(algoMatch[1].trim())
      continue
    }
    const ruleMatch = r.match(/Rule::([\w-]+)/)
    if (ruleMatch) {
      ruleCodes.push(ruleMatch[1])
      continue
    }
    otherRefs.push(r)
  }
  return { methodMatches, ruleCodes, otherRefs }
}

// 算法名模糊匹配：忽略 算法/方法/规则 后缀差异
function normalizeMethodName(s: string): string {
  return s.replace(/(?:算法|方法|规则|计算)$/g, '').trim().toLowerCase()
}

export function ProvenanceDrawer({ cellKey, cell, onClose }: Props) {
  // 拉所有 AuditRule / AccountingStandard / AuditMethod
  const { data: allRules = [] } = useQuery({
    queryKey: ['objects', 'AuditRule'],
    queryFn: () => api.listObjects('AuditRule'),
    staleTime: 5 * 60 * 1000,
  })
  const { data: allStandards = [] } = useQuery({
    queryKey: ['objects', 'AccountingStandard'],
    queryFn: () => api.listObjects('AccountingStandard'),
    staleTime: 5 * 60 * 1000,
  })
  const { data: allLawArticles = [] } = useQuery({
    queryKey: ['objects', 'LawArticle'],
    queryFn: () => api.listObjects('LawArticle'),
    staleTime: 5 * 60 * 1000,
  })
  const { data: allMethods = [] } = useQuery({
    queryKey: ['objects', 'AuditMethod'],
    queryFn: () => api.listObjects('AuditMethod'),
    staleTime: 5 * 60 * 1000,
  })

  // —— 解析当前 cell 引用的规则/算法/准则 ——
  const enriched = useMemo(() => {
    if (!cell) return null
    const allMethodNames = new Set<string>()
    const allRuleCodes = new Set<string>()
    const sourceDetails: { kind: string; detail: string; tone: string }[] = []

    for (const t of cell.trace) {
      const { methodMatches, ruleCodes } = parseAuditorView(t.ontology_refs)
      methodMatches.forEach((m) => allMethodNames.add(m))
      ruleCodes.forEach((r) => allRuleCodes.add(r))
      if (t.rule_code) allRuleCodes.add(t.rule_code)
      const meta = SOURCE_KIND_TONE[t.source_kind] || {
        label: t.source_kind, tone: 'neutral', emoji: '·',
      }
      sourceDetails.push({
        kind: `${meta.emoji} ${meta.label}`,
        detail: t.source_detail,
        tone: meta.tone,
      })
    }

    // —— 关联规则 + 准则 ——
    const matchedRules = allRules.filter(
      (r) => allRuleCodes.has((r.data as any)?.code))
    // 收集规则引用的准则
    const referencedStandardCodes = new Set<string>()
    matchedRules.forEach((r) => {
      const refs = (r.data as any)?.references_standards || []
      refs.forEach((c: string) => referencedStandardCodes.add(c))
    })
    const matchedStandards = [...allStandards, ...allLawArticles].filter(
      (s) => referencedStandardCodes.has((s.data as any)?.code))

    // —— 关联算法 (模糊匹配，忽略"算法"/"方法"后缀差异) ——
    const normalizedTargets = new Set(
      [...allMethodNames].map(normalizeMethodName))
    const matchedMethods = allMethods.filter(
      (m) => normalizedTargets.has(normalizeMethodName((m.data as any)?.name || '')))

    return {
      sourceDetails,
      matchedRules,
      matchedStandards,
      matchedMethods,
    }
  }, [cell, allRules, allStandards, allLawArticles, allMethods])

  if (!cellKey || !cell) return null

  return (
    <div className="fixed inset-y-0 right-0 w-[440px] bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col">
      {/* —— Header —— */}
      <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-br from-brand-50/40 to-white">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-brand-600 text-white grid place-items-center shrink-0">
            <FileText size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              填表过程追溯
            </div>
            <div className="font-mono text-xs text-slate-600 mt-0.5 break-all">{cellKey}</div>
            <div className="text-base font-bold text-slate-900 mt-1.5">
              数值：<span className="font-mono text-brand-700">{formatVal(cell.value)}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ═══════ ① 数据从哪里来 ═══════ */}
        <Section icon={<Database size={14} />} title="① 数据来源" tone="sky">
          {enriched?.sourceDetails.map((s, i) => (
            <div key={i} className="rounded-md border border-sky-200 bg-sky-50/40 p-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-semibold text-sky-800">{s.kind}</span>
              </div>
              <div className="text-[12.5px] text-slate-800 leading-relaxed">
                {s.detail}
              </div>
            </div>
          ))}
        </Section>

        {/* ═══════ ② 应用了哪些规则 ═══════ */}
        {enriched && enriched.matchedRules.length > 0 && (
          <Section icon={<Scale size={14} />} title={`② 应用的审计规则 (${enriched.matchedRules.length})`} tone="rose">
            {enriched.matchedRules.map((r) => {
              const d = r.data as any
              return (
                <div key={r.id} className="rounded-md border border-rose-200 bg-rose-50/40 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-mono font-bold text-rose-700 bg-white px-1.5 py-0.5 rounded border border-rose-200">
                      📜 {d?.code}
                    </span>
                    <span className="text-[10px] text-rose-600">
                      {d?.source} · {d?.effective}
                    </span>
                  </div>
                  <div className="text-[13px] font-semibold text-rose-900 mb-1">
                    {d?.name}
                  </div>
                  <div className="text-[12px] text-rose-800 leading-relaxed mb-1.5">
                    {d?.narrative || d?.expression}
                  </div>
                  {d?.formal_expression && (
                    <div className="text-[10.5px] font-mono text-rose-700 bg-white border border-rose-200 rounded px-2 py-1">
                      <strong>判定逻辑：</strong>{d.formal_expression}
                    </div>
                  )}
                </div>
              )
            })}
          </Section>
        )}

        {/* ═══════ ③ 用了哪些算法 ═══════ */}
        {enriched && enriched.matchedMethods.length > 0 && (
          <Section icon={<Calculator size={14} />} title={`③ 使用的算法 (${enriched.matchedMethods.length})`} tone="violet">
            {enriched.matchedMethods.map((m) => {
              const d = m.data as any
              return (
                <div key={m.id} className="rounded-md border border-violet-200 bg-violet-50/40 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-mono font-bold text-violet-700 bg-white px-1.5 py-0.5 rounded border border-violet-200">
                      🧮 {d?.code}
                    </span>
                    <span className="text-[10px] text-violet-600">{d?.category}</span>
                  </div>
                  <div className="text-[13px] font-semibold text-violet-900 mb-1">
                    {d?.name}
                  </div>
                  <div className="text-[12px] text-violet-800 leading-relaxed mb-2">
                    {d?.algorithm_description}
                  </div>
                  {d?.formal_logic && (
                    <details className="mt-2">
                      <summary className="text-[11px] text-violet-700 cursor-pointer hover:underline">
                        展开形式化逻辑 (伪代码)
                      </summary>
                      <pre className="mt-1.5 text-[10.5px] bg-slate-900 text-emerald-300 p-2 rounded overflow-x-auto whitespace-pre-wrap leading-snug">{d.formal_logic}</pre>
                    </details>
                  )}
                  <div className="mt-2 text-[10.5px] text-violet-700 grid grid-cols-1 gap-0.5">
                    <div><strong>适用条件：</strong>{d?.applicability}</div>
                    {d?.fallback_method && (
                      <div><strong>降级方法：</strong>{d.fallback_method}</div>
                    )}
                    {d?.firm_choice_rationale && (
                      <div><strong>事务所选择理由：</strong>{d.firm_choice_rationale}</div>
                    )}
                    {d?.review_status && (
                      <div className="text-amber-700"><strong>Review 状态：</strong>{d.review_status}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </Section>
        )}

        {/* ═══════ ④ 引用了哪些准则 ═══════ */}
        {enriched && enriched.matchedStandards.length > 0 && (
          <Section icon={<BookOpen size={14} />} title={`④ 引用的准则/法律 (${enriched.matchedStandards.length})`} tone="teal">
            <div className="flex flex-wrap gap-1.5">
              {enriched.matchedStandards.map((s) => {
                const d = s.data as any
                return (
                  <div key={s.id} className="rounded-md border border-teal-200 bg-teal-50/40 p-2 flex-1 min-w-[180px]">
                    <div className="text-[10px] font-mono font-bold text-teal-700">
                      📐 {d?.code}
                    </div>
                    <div className="text-[12px] text-teal-900 mt-0.5">{d?.name}</div>
                    <div className="text-[10px] text-teal-600 mt-1">
                      {d?.issuer} · {d?.effective}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* ═══════ ⑤ 提示信息 ═══════ */}
        {(!enriched || (
          enriched.matchedRules.length === 0 &&
          enriched.matchedMethods.length === 0 &&
          enriched.matchedStandards.length === 0
        )) && (
          <div className="text-[12px] text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-3">
            此单元格仅基于<strong>数据来源</strong>直接读取，未应用业务规则或算法。
          </div>
        )}

      </div>
    </div>
  )
}

// ── 公共 Section 组件 ──
function Section({ icon, title, tone, children }: {
  icon: React.ReactNode
  title: string
  tone: 'sky' | 'rose' | 'violet' | 'teal'
  children: React.ReactNode
}) {
  const colorMap: Record<string, string> = {
    sky: 'border-sky-300 text-sky-800 bg-sky-50/70',
    rose: 'border-rose-300 text-rose-800 bg-rose-50/70',
    violet: 'border-violet-300 text-violet-800 bg-violet-50/70',
    teal: 'border-teal-300 text-teal-800 bg-teal-50/70',
  }
  return (
    <div>
      <div className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[12px] font-semibold mb-1.5',
        colorMap[tone],
      )}>
        {icon}
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function formatVal(v: any): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') {
    if (Number.isInteger(v) && Math.abs(v) < 1e6) return String(v)
    return v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  }
  if (typeof v === 'boolean') return v ? '是' : '否'
  return String(v)
}

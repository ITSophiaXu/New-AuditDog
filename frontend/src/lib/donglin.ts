/** 甲会计师事务所样式底稿 — 客户端工具与类型。 */

export const DONGLIN_PAPER_CODES = ['A1', 'A6', 'A9', 'A24', 'B1'] as const
export type DonglinPaperCode = (typeof DONGLIN_PAPER_CODES)[number]
export const DONGLIN_ENGAGEMENT = 'ENG-JSDW-2025'

/** 一条单元格追溯条目。 */
export interface ProvenanceTrace {
  source_kind: 'TB' | 'Aux' | 'Voucher' | 'Computed' | 'RuleDerived' | 'Knowledge' | 'TemplateConst' | string
  ontology_refs: string[]
  source_detail: string
  rule_code: string | null
}

/** 一个填好的单元格。 */
export interface ProvenanceCell {
  value: any
  trace: ProvenanceTrace[]
}

/** /api/donglin/provenance/{code} 返回结构。 */
export interface ProvenanceResponse {
  paper_code: string
  wp_key: string
  cells: Record<string, ProvenanceCell>
}

export interface DonglinPaperMeta {
  id: number
  index: string
  name: string
  review_status?: string
  audit_conclusion?: string
  filled_by?: string
  filled_at?: string
  has_sheet_data: boolean
}

/** 判断一个 WorkingPaper instance 是否为甲所（甲公司）填稿。 */
export function isDonglinPaper(data: any): boolean {
  if (!data) return false
  if (data.engagement_code === DONGLIN_ENGAGEMENT) return true
  if (data.template_code === 'TPL-DL-FY2025') return true
  return false
}

/** 该底稿是否为已被 agent 填稿的 5 张 demo 之一。 */
export function isDonglinFilledDemo(data: any): boolean {
  const idx = data?.index
  return isDonglinPaper(data) && DONGLIN_PAPER_CODES.includes(idx)
}

/** 该底稿是否为「自由底稿」(freeform，不套母版，原始 2D 网格渲染)。 */
export function isFreeformPaper(data: any): boolean {
  return data?.layout === 'freeform'
}

/** 该底稿是否为「穿行测试」(walkthrough，过程说明 + 细节测试底稿)。 */
export function isWalkthroughPaper(data: any): boolean {
  return data?.layout === 'walkthrough'
}

/** ------ HTTP ------ */

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

export const donglinApi = {
  listPapers: () => jget<DonglinPaperMeta[]>('/api/donglin/papers'),
  getPaper: (code: string) =>
    jget<{ id: number; type_code: string; display_name: string; data: any }>(
      `/api/donglin/papers/${code}`,
    ),
  getProvenance: (code: string) =>
    jget<ProvenanceResponse>(`/api/donglin/provenance/${code}`),
  listAdjustments: () => jget<any[]>('/api/donglin/adjustments'),
  listAgentRuns: () => jget<any[]>('/api/donglin/agent-runs'),
  fill: async (code: string) => {
    const r = await fetch(`/api/donglin/fill/${code}`, { method: 'POST' })
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
    return r.json()
  },

  // Sprint 1 + 2 + 3
  getTemplateLayout: () => jget<any>('/api/donglin/template-layout'),
  verifyFillRules: (code: string) => jget<any>(`/api/donglin/verify-fill-rules/${code}`),
  exportXlsxUrl: (code: string) => `/api/donglin/export-xlsx/${code}`,
}

/** ------ Trace 渲染辅助 ------ */

export const SOURCE_KIND_TONE: Record<string, { label: string; tone: 'sky' | 'green' | 'amber' | 'rose' | 'brand' | 'neutral'; emoji: string }> = {
  TB:            { label: '试算平衡', tone: 'sky',     emoji: '📊' },
  Aux:           { label: '辅助账',   tone: 'sky',     emoji: '📂' },
  Voucher:       { label: '凭证',     tone: 'sky',     emoji: '🧾' },
  Computed:      { label: '计算导出', tone: 'brand',   emoji: '🧮' },
  RuleDerived:   { label: '规则触发', tone: 'green',   emoji: '⚡' },
  Knowledge:     { label: '本体知识', tone: 'amber',   emoji: '💡' },
  TemplateConst: { label: '模板常量', tone: 'neutral', emoji: '📋' },
}

/** 解析 '📦 OT::Account[1122]' → { kind:'OT', code:'Account[1122]', emoji:'📦' } */
export function parseOntologyRef(ref: string): { emoji: string; kind: string; code: string } {
  const m = ref.match(/^(\S+)\s+(OT|LT|AT|Rule)::(.+)$/)
  if (m) return { emoji: m[1], kind: m[2], code: m[3] }
  return { emoji: '', kind: '', code: ref }
}

/** 把扁平的 cell-key (如 'customer_detail.rows[3].closing_dr') 拆分。 */
export function parseCellKey(key: string): { sheet: string; rowIdx: number | null; field: string } {
  const m = key.match(/^([^.]+)\.rows\[(\d+)\]\.(.+)$/)
  if (m) return { sheet: m[1], rowIdx: Number(m[2]), field: m[3] }
  const m2 = key.match(/^([^.]+)\.(.+)$/)
  if (m2) return { sheet: m2[1], rowIdx: null, field: m2[2] }
  return { sheet: '', rowIdx: null, field: key }
}

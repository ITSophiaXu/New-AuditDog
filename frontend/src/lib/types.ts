export type ProvenanceOrigin = 'base' | 'public' | 'firm' | 'customer-derived' | 'wizard'
export type ProvenanceStatus = 'active' | 'draft' | 'superseded' | 'deprecated'

export interface Provenance {
  origin: ProvenanceOrigin
  bundle?: string | null
  version?: string | null
  issuer?: string | null
  effective_from?: string | null
  effective_until?: string | null
  contributed_by?: string[]
  anonymized_from?: string | null
  author?: string | null
  status: ProvenanceStatus
  created_at?: string
  updated_at?: string
}

export interface KnowledgeBundle {
  id: string                                     // 'gov-special-audit@2025-09'
  name: string
  description: string
  issuer: string
  version: string
  scope: string[]
}

export interface PropertyDef {
  code: string
  label: string
  type: 'string' | 'number' | 'enum' | 'json' | 'text' | 'date' | 'money'
  required?: boolean
  default?: unknown
  enum?: string[]
  help?: string
}

// ---------- Multi-sheet working paper schema ----------

export type CellType =
  | 'string' | 'number' | 'money' | 'percent' | 'boolean' | 'date' | 'text' | 'enum'

export interface SheetColumn {
  code: string
  label: string
  type: CellType
  width?: number
  computed?: boolean
  formula?: string
  enum?: string[]
}

export interface SheetField {
  code: string
  label: string
  type: CellType
  computed?: boolean
  formula?: string
  default?: unknown
  help?: string
}

export interface Sheet {
  code: string
  name: string
  kind: 'summary' | 'table' | 'checklist' | 'freeform'
  description?: string
  columns?: SheetColumn[]
  fields?: SheetField[]
}

export interface SummarySheetData {
  [field_code: string]: any
}

export interface TableSheetData {
  rows: Record<string, any>[]
}

export type SheetData = SummarySheetData & Partial<TableSheetData>

export interface ObjectType {
  id: number
  code: string
  display_name: string
  description: string
  icon: string
  color: string
  properties_schema: PropertyDef[]
  is_seed: boolean
  created_at: string
}

export interface LinkType {
  id: number
  code: string
  display_name: string
  source_type_code: string
  target_type_code: string
  cardinality: 'one' | 'many'
  description: string
  is_seed: boolean
}

export interface ActionType {
  id: number
  code: string
  display_name: string
  description: string
  target_type_code: string
  kind: 'fill' | 'flag' | 'apply_rule' | 'attach'
  parameters_schema: PropertyDef[]
  is_seed: boolean
}

export interface ObjectInstance {
  id: number
  type_code: string
  display_name: string
  data: Record<string, any>
  created_at: string
  updated_at: string
}

export interface AgentConfig {
  id: number
  code: string
  name: string
  description: string
  scenario: 'working_paper_fill' | 'plan_generation' | 'anomaly_analysis' | 'special_audit'
  avatar: string
  system_prompt: string
  tools: Array<{ kind: 'action' | 'query' | 'mcp'; ref: string }>
  retrieval_object_types: string[]
  is_seed: boolean
  is_stub: boolean
  created_at: string
  updated_at: string
}

export interface ToolCallTrace {
  id: string
  name: string
  arguments: Record<string, any>
  output: any
}

export interface ChatResponse {
  run_id: number
  final_message: string
  tool_calls: ToolCallTrace[]
}

export interface MCPServer {
  id: number
  name: string
  transport: 'stdio' | 'http'
  command: string
  args: string[]
  env: Record<string, string>
  description: string
  enabled: boolean
  tools: Array<{ name: string; description?: string; parameters?: any }>
}

export interface Health {
  ok: boolean
  llm_demo_mode: boolean
  model: string
}

// ---------- Correction loop ----------

export type CorrectionReasonCode =
  | 'value_wrong' | 'source_wrong' | 'rule_misfire' | 'rule_missed'
  | 'field_missing' | 'other'

export interface Correction {
  id: number
  paper_id: number
  field_path: string
  old_value: any
  new_value: any
  reason_code: CorrectionReasonCode
  reason_text: string
  agent_run_id: number | null
  user: string
  promoted_change_id: number | null
  created_at: string
}

export interface ScopeOption {
  value: 'paper' | 'template' | 'firm'
  label: string
  affected_count: number
  recommended?: boolean
  warning?: string
}

export interface ProposeDeltaResponse {
  has_proposal: boolean
  kind?: string
  summary?: string
  target_kind?: 'PaperTemplate' | 'AuditRule' | string
  target_code?: string
  delta?: Record<string, any>
  scope_options?: ScopeOption[]
  affected_papers?: Array<{ id: number; display_name: string; status: string }>
}

export interface OntologyChange {
  id: number
  kind: string
  target_kind: string
  target_code: string
  scope: 'paper' | 'template' | 'firm'
  paper_id: number | null
  delta: Record<string, any>
  before_snapshot: Record<string, any>
  summary: string
  source_correction_id: number | null
  applied_by: string
  applied_at: string
  rolled_back_at: string | null
}

export interface InboxSuggestion {
  template_code: string
  field_root: string
  reason_code: CorrectionReasonCode
  correction_count: number
  auditor_count: number
  auditors: string[]
  sample_correction_ids: number[]
  latest_at: string
  suggested_action: string
}

// ---------- Template upload ----------

export interface InferredField {
  code: string
  label: string
  type: 'string' | 'number' | 'money' | 'text' | 'date' | 'boolean'
  required?: boolean
  source: { kind: 'tb_account' | 'computed' | 'evidence' | 'manual'; label?: string; account_code?: string; field?: string }
  ai_guess?: boolean
}

export interface InferredRule {
  name: string
  category: string
  description: string
  severity: 'low' | 'medium' | 'high'
  ai_guess?: boolean
}

export interface InferTemplateResponse {
  code: string
  name: string
  scenario: string
  fields: InferredField[]
  inferred_rules: InferredRule[]
  demo: boolean
  stats: { header_count: number; sample_row_count: number }
}

// ---------- Rule authoring ----------

export interface CompiledRule {
  name: string
  category: string
  severity: 'low' | 'medium' | 'high'
  nl_description: string
  eval_kind: 'field_diff' | 'table_predicate'
  left?: string
  right?: string
  op?: string
  threshold?: number
  sheet_code?: string
  column?: string
  value?: any
  interpretation: string
  scope_template_code?: string | null
  code?: string
  ai_guess?: boolean
  refined_from?: any
}

export interface RuleHit {
  paper_id: number
  paper_name: string
  explanation: string
  context: Record<string, any>
}

export interface RuleCompileResponse {
  compiled: CompiledRule
  interpretation: string
  scanned_papers: number
  hits: RuleHit[]
  demo?: boolean
  refined?: boolean
}

// ---------- Agent tools (business-name catalog) ----------

export interface AgentToolEntry {
  kind: 'query' | 'action' | 'mcp'
  ref: string
  business_name: string
  description: string
  raw_name: string
}

import type {
  ObjectType, LinkType, ActionType, ObjectInstance,
  AgentConfig, ChatResponse, MCPServer, Health, KnowledgeBundle,
  Correction, CorrectionReasonCode, ProposeDeltaResponse, OntologyChange,
  InboxSuggestion, InferTemplateResponse, CompiledRule, RuleCompileResponse,
  AgentToolEntry,
} from './types'

const API = '/api'

async function json<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const r = await fetch(input, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!r.ok) {
    let detail = await r.text()
    try { detail = JSON.parse(detail).detail || detail } catch {}
    throw new Error(`${r.status} ${detail}`)
  }
  return r.json() as Promise<T>
}

export const api = {
  health: () => json<Health>(`${API}/health`),

  // Ontology
  listObjectTypes: () => json<ObjectType[]>(`${API}/ontology/object-types`),
  getObjectType: (code: string) => json<ObjectType>(`${API}/ontology/object-types/${code}`),
  updateObjectType: (code: string, body: Partial<ObjectType>) =>
    json<ObjectType>(`${API}/ontology/object-types/${code}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  listLinkTypes: () => json<LinkType[]>(`${API}/ontology/link-types`),
  listActionTypes: () => json<ActionType[]>(`${API}/ontology/action-types`),

  // Instances
  listObjects: (typeCode?: string) => {
    const qs = typeCode ? `?type_code=${encodeURIComponent(typeCode)}` : ''
    return json<ObjectInstance[]>(`${API}/ontology/objects${qs}`)
  },
  getObject: (id: number) => json<{
    object: ObjectInstance
    out_links: Array<{ id: number; link_type_code: string; source_id: number; target_id: number }>
    in_links: Array<{ id: number; link_type_code: string; source_id: number; target_id: number }>
  }>(`${API}/ontology/objects/${id}`),
  patchObject: (id: number, body: Partial<{ data: Record<string, any>; display_name: string }>) =>
    json<ObjectInstance>(`${API}/ontology/objects/${id}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),
  executeAction: (code: string, body: { target_id: number; parameters: Record<string, any> }) =>
    json<any>(`${API}/ontology/actions/${code}/execute`, {
      method: 'POST', body: JSON.stringify(body),
    }),

  // Agents
  listAgents: () => json<AgentConfig[]>(`${API}/agents`),
  getAgent: (code: string) => json<AgentConfig>(`${API}/agents/${code}`),
  updateAgent: (code: string, body: Partial<AgentConfig>) =>
    json<AgentConfig>(`${API}/agents/${code}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  chat: (code: string, body: { message: string; paper_id?: number }) =>
    json<ChatResponse>(`${API}/agents/${code}/chat`, {
      method: 'POST', body: JSON.stringify(body),
    }),

  // Knowledge bundles
  listBundles: () => json<KnowledgeBundle[]>(`${API}/bundles`),

  // MCP
  listMCPServers: () => json<MCPServer[]>(`${API}/mcp/servers`),
  toggleMCPServer: (name: string, enabled: boolean) =>
    json<MCPServer>(`${API}/mcp/servers/${name}`, {
      method: 'PATCH', body: JSON.stringify({ enabled }),
    }),

  // ---------- Correction loop ----------
  recordCorrection: (body: {
    paper_id: number
    field_path: string
    old_value: any
    new_value: any
    reason_code: CorrectionReasonCode
    reason_text?: string
    agent_run_id?: number | null
    user?: string
    apply_to_paper?: boolean
  }) => json<{ ok: boolean; correction_id: number }>(`${API}/corrections`, {
    method: 'POST', body: JSON.stringify(body),
  }),
  listCorrections: (paperId?: number) => {
    const qs = paperId ? `?paper_id=${paperId}` : ''
    return json<Correction[]>(`${API}/corrections${qs}`)
  },
  proposeDelta: (correctionId: number) =>
    json<ProposeDeltaResponse>(`${API}/corrections/${correctionId}/propose`, {
      method: 'POST', body: '{}',
    }),
  applyOntologyChange: (body: {
    correction_id?: number | null
    kind: string
    target_kind: string
    target_code: string
    scope: 'paper' | 'template' | 'firm'
    paper_id?: number | null
    delta: Record<string, any>
    summary?: string
    applied_by?: string
  }) => json<{ ok: boolean; change_id: number }>(`${API}/ontology-changes/apply`, {
    method: 'POST', body: JSON.stringify(body),
  }),
  rollbackChange: (changeId: number) =>
    json<{ ok: boolean; rolled_back?: boolean }>(`${API}/ontology-changes/${changeId}/rollback`, {
      method: 'POST', body: '{}',
    }),
  listOntologyChanges: () => json<OntologyChange[]>(`${API}/ontology-changes`),
  learningInbox: () => json<InboxSuggestion[]>(`${API}/learning-inbox`),

  // ---------- Template authoring (Excel) ----------
  inferTemplateFromSheet: (body: {
    sheet_name?: string
    rows: any[][]
    filename?: string
  }) => json<InferTemplateResponse>(`${API}/templates/infer-from-sheet`, {
    method: 'POST', body: JSON.stringify(body),
  }),
  saveTemplate: (body: any) =>
    json<{ ok: boolean; template_id: number; template_code: string; rule_codes_saved: string[] }>(
      `${API}/templates/save`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  // ---------- Rule authoring (NL) ----------
  compileRule: (body: {
    description: string
    scope_template_code?: string | null
    severity?: 'low' | 'medium' | 'high'
  }) => json<RuleCompileResponse>(`${API}/rules/compile-and-preview`, {
    method: 'POST', body: JSON.stringify(body),
  }),
  refineRule: (body: {
    description: string
    compiled: CompiledRule
    false_positives: any[]
  }) => json<RuleCompileResponse>(`${API}/rules/refine`, {
    method: 'POST', body: JSON.stringify(body),
  }),
  saveRule: (body: {
    compiled: CompiledRule
    scope_template_code?: string | null
    run_on_existing?: boolean
  }) => json<{ ok: boolean; rule_id: number; rule_code: string; triggered: any[] }>(
    `${API}/rules/save`,
    { method: 'POST', body: JSON.stringify(body) },
  ),

  // ---------- 斑目项目底稿预填 ----------
  banmuFill: (paperIndex: string) =>
    json<{ ok: boolean; paper_id: number; decisions_count: number; fill_summary: string; status: string }>(
      `${API}/banmu/fill/${encodeURIComponent(paperIndex)}`,
      { method: 'POST' },
    ),
  banmuResolve: (decisionId: number, selectedValue: string) =>
    json<{ ok: boolean; all_resolved: boolean; paper_status: string }>(
      `${API}/banmu/resolve/${decisionId}`,
      { method: 'POST', body: JSON.stringify({ selected_value: selectedValue }) },
    ),
  banmuSetAccountingStandard: (value: string) =>
    json<{ ok: boolean; accounting_standard: string; refilled: string[] }>(
      `${API}/banmu/engagement/accounting-standard`,
      { method: 'POST', body: JSON.stringify({ value }) },
    ),

  donglinFillPlanning: (paperCode: string) =>
    json<{ ok: boolean; review_status: string; pending_decisions: unknown[] }>(
      `${API}/donglin/fill-planning/${encodeURIComponent(paperCode)}`,
      { method: 'POST' },
    ),
  donglinResolvePlanning: (decisionId: number, selectedValue: string) =>
    json<{ ok: boolean; resolved_value: string; paper_review_status: string }>(
      `${API}/donglin/resolve-planning-decision/${decisionId}`,
      { method: 'POST', body: JSON.stringify({ selected_value: selectedValue }) },
    ),

  // ---------- Agent fork + tool catalog ----------
  agentToolCatalog: () => json<AgentToolEntry[]>(`${API}/agent-tools/catalog`),
  forkAgent: (body: {
    source_code: string
    new_code: string
    new_name: string
    change_description?: string
  }) => json<AgentConfig>(`${API}/agents/fork`, {
    method: 'POST', body: JSON.stringify(body),
  }),
  previewEditAgent: (body: { base_code: string; change_description: string }) =>
    json<{ base: AgentConfig; edits: any }>(`${API}/agents/preview-edit`, {
      method: 'POST', body: JSON.stringify(body),
    }),
}

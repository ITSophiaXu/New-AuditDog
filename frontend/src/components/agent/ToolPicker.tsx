import { Check, Wrench, Database, Plug } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { ActionType, MCPServer, AgentToolEntry } from '@/lib/types'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type ToolRef = { kind: 'action' | 'query' | 'mcp'; ref: string }

interface Props {
  selected: ToolRef[]
  onChange: (next: ToolRef[]) => void
  actions: ActionType[]
  mcpServers: MCPServer[]
  disabled?: boolean
}

export default function ToolPicker({ selected, onChange, mcpServers, disabled }: Props) {
  const { data: catalog = [] } = useQuery({
    queryKey: ['agent-tool-catalog'],
    queryFn: api.agentToolCatalog,
  })

  const queryTools = catalog.filter((t) => t.kind === 'query')
  const actionTools = catalog.filter((t) => t.kind === 'action')

  const has = (kind: ToolRef['kind'], ref: string) =>
    selected.some((t) => t.kind === kind && t.ref === ref)
  const toggle = (kind: ToolRef['kind'], ref: string) => {
    if (disabled) return
    onChange(has(kind, ref)
      ? selected.filter((t) => !(t.kind === kind && t.ref === ref))
      : [...selected, { kind, ref }])
  }

  return (
    <div className="space-y-4">
      <Section title="它能用的查询工具" icon={Database} hint="只读 — 从本体读取上下文">
        {queryTools.map((q) => (
          <ToolRow
            key={q.ref}
            active={has('query', q.ref)}
            onClick={() => toggle('query', q.ref)}
            title={q.business_name}
            subtitle={q.description}
            raw={q.raw_name}
            disabled={disabled}
          />
        ))}
        {queryTools.length === 0 && <Empty>无可用查询工具。</Empty>}
      </Section>

      <Section title="它能做的本体操作" icon={Wrench} hint="写回 — 修改本体对象、生成异常">
        {actionTools.map((a) => (
          <ToolRow
            key={a.ref}
            active={has('action', a.ref)}
            onClick={() => toggle('action', a.ref)}
            title={a.business_name}
            subtitle={a.description}
            raw={a.raw_name}
            disabled={disabled}
          />
        ))}
        {actionTools.length === 0 && <Empty>暂无操作类型。</Empty>}
      </Section>

      <Section title="外部 MCP 工具" icon={Plug} hint="外部集成 — 文件 / Excel / 银行系统等">
        {mcpServers.flatMap((srv) =>
          (srv.tools || []).map((t) => {
            const ref = `${srv.name}::${t.name}`
            return (
              <ToolRow
                key={ref}
                active={has('mcp', ref)}
                onClick={() => srv.enabled && toggle('mcp', ref)}
                title={`${srv.name} · ${t.name}`}
                subtitle={t.description || ''}
                raw={ref}
                muted={!srv.enabled}
                disabled={disabled || !srv.enabled}
              />
            )
          }),
        )}
        {mcpServers.length === 0 && <Empty>尚未注册 MCP 服务。</Empty>}
      </Section>
    </div>
  )
}

function Section({
  title, icon: I, hint, children,
}: { title: string; icon: any; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <I size={14} className="text-slate-500" />
        <div className="text-sm font-medium text-slate-900">{title}</div>
        <div className="text-[11px] text-slate-400 ml-auto">{hint}</div>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function ToolRow({
  active, onClick, title, subtitle, raw, disabled, muted,
}: {
  active: boolean; onClick: () => void; title: string; subtitle: string;
  raw: string; disabled?: boolean; muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
        active
          ? 'border-brand-400 bg-brand-50/60 ring-1 ring-brand-200'
          : 'border-slate-200 bg-white hover:bg-slate-50',
        disabled && 'opacity-50 cursor-not-allowed',
        muted && 'opacity-60',
      )}
    >
      <span className={cn(
        'mt-0.5 h-4 w-4 rounded border grid place-items-center shrink-0',
        active ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-white',
      )}>
        {active && <Check size={12} />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900 truncate">{title}</div>
        <div className="text-xs text-slate-500 truncate">{subtitle}</div>
      </div>
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 font-mono uppercase shrink-0">
        {raw}
      </span>
    </button>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-slate-400 py-3 px-3 rounded-md border border-dashed border-slate-200 bg-slate-50/50">
      {children}
    </div>
  )
}

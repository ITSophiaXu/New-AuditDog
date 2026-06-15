import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plug, Terminal, Globe } from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export default function MCPServers() {
  const qc = useQueryClient()
  const { data: servers = [] } = useQuery({ queryKey: ['mcp-servers'], queryFn: api.listMCPServers })

  const toggle = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api.toggleMCPServer(name, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-servers'] }),
  })

  return (
    <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-widest">MCP · Model Context Protocol</div>
        <h1 className="text-2xl font-semibold text-slate-900 mt-1">外部工具与集成</h1>
        <p className="text-sm text-slate-500 mt-1">
          挂载文件系统、Excel、银行询证函系统等 MCP 服务，由智能体在工作流中按需调用。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {servers.map((s) => {
          const Icon = s.transport === 'stdio' ? Terminal : Globe
          return (
            <Card key={s.name} className="p-5">
              <div className="flex items-start gap-3">
                <div className={cn(
                  'h-10 w-10 rounded-lg grid place-items-center shrink-0',
                  s.enabled ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400',
                )}>
                  <Plug size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-slate-900">{s.name}</div>
                    <Badge tone="neutral" className="font-mono">
                      <Icon size={10} /> {s.transport}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{s.description}</div>
                </div>
                <button
                  onClick={() => toggle.mutate({ name: s.name, enabled: !s.enabled })}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors',
                    s.enabled ? 'bg-emerald-500' : 'bg-slate-300',
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    s.enabled ? 'left-5' : 'left-0.5',
                  )} />
                </button>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">提供工具</div>
                <div className="space-y-1">
                  {(s.tools || []).map((t) => (
                    <div key={t.name} className="text-xs text-slate-700 flex items-start gap-2">
                      <span className="font-mono text-slate-400 mt-0.5">›</span>
                      <div>
                        <span className="font-mono">{t.name}</span>
                        <span className="text-slate-500"> — {t.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {s.command && (
                  <div className="mt-3 text-[11px] font-mono text-slate-500 bg-slate-50 rounded p-2 overflow-x-auto">
                    <span className="text-slate-400">$</span> {s.command} {(s.args || []).join(' ')}
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="p-5 bg-slate-50/40 border-dashed">
        <div className="flex items-center gap-3">
          <Plug size={16} className="text-slate-400" />
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-700">添加自定义 MCP 服务</div>
            <div className="text-xs text-slate-500 mt-0.5">
              支持 stdio 与 HTTP 两类传输方式；后续可通过表单注册并自动发现工具列表。
            </div>
          </div>
          <Button variant="outline" disabled>即将上线</Button>
        </div>
      </Card>
    </div>
  )
}

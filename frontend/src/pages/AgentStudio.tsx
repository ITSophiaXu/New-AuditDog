import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Bot, Save, Wand2, BookOpen, Database } from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Icon } from '@/components/ui/Icon'
import ToolPicker from '@/components/agent/ToolPicker'
import ChatPanel from '@/components/agent/ChatPanel'
import { zh } from '@/locales/zh'
import { cn } from '@/lib/utils'

export default function AgentStudio() {
  const { code } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: api.listAgents })
  const { data: types = [] } = useQuery({ queryKey: ['object-types'], queryFn: api.listObjectTypes })
  const { data: actions = [] } = useQuery({ queryKey: ['action-types'], queryFn: api.listActionTypes })
  const { data: mcp = [] } = useQuery({ queryKey: ['mcp-servers'], queryFn: api.listMCPServers })

  const activeCode = code || agents[0]?.code
  const { data: agent } = useQuery({
    queryKey: ['agent', activeCode],
    queryFn: () => api.getAgent(activeCode!),
    enabled: !!activeCode,
  })

  // Auto-navigate to first agent
  useEffect(() => {
    if (!code && agents[0]) nav(`/agents/${agents[0].code}`, { replace: true })
  }, [code, agents, nav])

  const [draft, setDraft] = useState<typeof agent | null>(null)
  useEffect(() => {
    if (agent) setDraft({ ...agent })
  }, [agent])

  const save = useMutation({
    mutationFn: () => api.updateAgent(draft!.code, {
      name: draft!.name,
      description: draft!.description,
      scenario: draft!.scenario,
      avatar: draft!.avatar,
      system_prompt: draft!.system_prompt,
      tools: draft!.tools,
      retrieval_object_types: draft!.retrieval_object_types,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })

  if (!draft) return <div className="p-10 text-slate-500">{zh.common.loading}</div>

  const isStub = (agent as any)?.is_stub

  return (
    <div className="h-full flex">
      {/* Agent list */}
      <div className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-4 pt-5 pb-3 border-b border-slate-100">
          <div className="text-xs text-slate-500 mb-1">智能体工作室 · Agent Studio</div>
          <div className="text-lg font-semibold text-slate-900">我的智能体</div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {agents.map((a) => (
            <button
              key={a.code}
              onClick={() => nav(`/agents/${a.code}`)}
              className={cn(
                'w-full px-4 py-2.5 flex items-start gap-3 text-left text-sm',
                a.code === activeCode ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50',
              )}
            >
              <div className="h-7 w-7 rounded-md bg-slate-100 text-slate-600 grid place-items-center shrink-0">
                <Icon name={a.avatar} size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{a.name}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {zh.scenarios[a.scenario as keyof typeof zh.scenarios] || a.scenario}
                </div>
              </div>
              {a.is_stub && <Badge tone="neutral">即将</Badge>}
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-slate-900 text-white grid place-items-center shrink-0">
              <Icon name={draft.avatar} size={22} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <input
                  className="text-xl font-semibold text-slate-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1 -mx-1"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <span className="font-mono text-xs text-slate-500">{draft.code}</span>
                {isStub && <Badge tone="amber">stub · 待接入</Badge>}
              </div>
              <Input
                placeholder="智能体描述"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className="bg-transparent border-none px-0 text-sm text-slate-500 focus:ring-0"
              />
            </div>
            <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save size={14} /> {save.isPending ? '保存中…' : '保存配置'}
            </Button>
          </div>

          <Card>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center">
              <Wand2 size={14} className="text-slate-500 mr-2" />
              <div className="text-sm font-semibold text-slate-900">系统提示词</div>
            </div>
            <div className="p-5">
              <Textarea
                rows={6}
                value={draft.system_prompt}
                onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
                placeholder="给智能体设定角色、目标、调用工具的策略…"
                className="font-mono text-sm"
              />
            </div>
          </Card>

          <Card>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center">
              <BookOpen size={14} className="text-slate-500 mr-2" />
              <div className="text-sm font-semibold text-slate-900">检索上下文</div>
              <div className="text-xs text-slate-500 ml-auto">每次对话注入哪些对象类型</div>
            </div>
            <div className="p-5 flex flex-wrap gap-2">
              {types.map((t) => {
                const active = draft.retrieval_object_types.includes(t.code)
                return (
                  <button
                    key={t.code}
                    onClick={() => setDraft({
                      ...draft,
                      retrieval_object_types: active
                        ? draft.retrieval_object_types.filter((c) => c !== t.code)
                        : [...draft.retrieval_object_types, t.code],
                    })}
                    className={cn(
                      'flex items-center gap-1.5 h-7 px-2.5 rounded-md text-sm border transition-colors',
                      active
                        ? 'border-brand-400 bg-brand-50 text-brand-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <Icon name={t.icon} size={12} />
                    {t.display_name}
                  </button>
                )
              })}
            </div>
          </Card>

          <Card>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center">
              <Database size={14} className="text-slate-500 mr-2" />
              <div className="text-sm font-semibold text-slate-900">工具</div>
              <Badge tone="neutral" className="ml-2">{draft.tools.length}</Badge>
            </div>
            <div className="p-5">
              <ToolPicker
                selected={draft.tools}
                onChange={(next) => setDraft({ ...draft, tools: next })}
                actions={actions}
                mcpServers={mcp}
              />
            </div>
          </Card>
        </div>
      </div>

      {/* Test panel */}
      <div className="w-[420px] shrink-0 border-l border-slate-200 bg-slate-50/30 p-4">
        <ChatPanel
          agentCode={draft.code}
          suggested={
            draft.scenario === 'working_paper_fill'
              ? '请基于试算平衡表帮我完成货币资金底稿，并应用所有默认规则。'
              : `用一段中文向我介绍你能为「${zh.scenarios[draft.scenario as keyof typeof zh.scenarios] || draft.scenario}」做什么。`
          }
          placeholder="试试和这个智能体对话…"
          className="h-[calc(100vh-2rem)]"
        />
      </div>
    </div>
  )
}

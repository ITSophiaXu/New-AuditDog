import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, Copy, ArrowRight, Users, Bot, Plus, X, Wand2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input, Textarea } from '@/components/ui/Input'
import { Icon } from '@/components/ui/Icon'
import { zh } from '@/locales/zh'
import { cn } from '@/lib/utils'

// Display-only "在用人数" mock (firm-wide adoption signal — would come from telemetry in prod)
const USAGE_MOCK: Record<string, number> = {
  cash_paper_fill: 87,
  special_audit_designer: 42,
  audit_plan_generator: 19,
  anomaly_analyst: 12,
}

export default function AgentGallery() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: api.listAgents })

  const [forkSource, setForkSource] = useState<typeof agents[number] | null>(null)
  const [newName, setNewName] = useState('')
  const [changeDesc, setChangeDesc] = useState('')

  const newCode = forkSource
    ? `${forkSource.code}_v${Math.random().toString(36).slice(2, 6)}`
    : ''

  const fork = useMutation({
    mutationFn: () => api.forkAgent({
      source_code: forkSource!.code,
      new_code: newCode,
      new_name: newName,
      change_description: changeDesc,
    }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      setForkSource(null)
      nav(`/agents/${created.code}`)
    },
  })

  return (
    <div className="h-full bg-slate-50/40 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-violet-100 text-violet-700 grid place-items-center shrink-0">
            <Bot size={22} />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-slate-900">智能体工作室</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              建议从现成的智能体复制改, 改起来比从零写快得多 — 一句话告诉 AI 你想加什么。
            </p>
          </div>
          <Button variant="outline" size="md" onClick={() => nav('/agents/_new')}>
            <Plus size={14} /> 从零开始 (高级)
          </Button>
        </div>

        <div>
          <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Sparkles size={14} className="text-amber-500" />
            现成的智能体 (推荐)
          </div>
          <div className="grid grid-cols-3 gap-4">
            {agents.filter((a) => !a.is_stub).map((a) => (
              <Card key={a.code} className="p-4 flex flex-col">
                <div className="flex items-start gap-3 mb-2">
                  <div className="h-10 w-10 rounded-lg bg-slate-900 text-white grid place-items-center shrink-0">
                    <Icon name={a.avatar} size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{a.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {zh.scenarios[a.scenario as keyof typeof zh.scenarios] || a.scenario}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-slate-600 line-clamp-3 min-h-[3.5rem]">
                  {a.description}
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                  <Users size={11} />
                  <span>全所 {USAGE_MOCK[a.code] ?? Math.floor(Math.random() * 30 + 5)} 人在用</span>
                  <Badge tone="neutral" className="ml-auto">{a.tools.length} 工具</Badge>
                </div>
                <div className="mt-3 flex gap-1.5">
                  <Button
                    variant="outline" size="sm" className="flex-1"
                    onClick={() => nav(`/agents/${a.code}`)}
                  >
                    试用 / 编辑
                  </Button>
                  <Button
                    variant="primary" size="sm" className="flex-1"
                    onClick={() => { setForkSource(a); setNewName(`${a.name}·我的`); setChangeDesc('') }}
                  >
                    <Copy size={12} /> 复制改
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Stubs */}
        {agents.some((a) => a.is_stub) && (
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-3">即将上线</div>
            <div className="grid grid-cols-3 gap-4 opacity-60">
              {agents.filter((a) => a.is_stub).map((a) => (
                <Card key={a.code} className="p-4">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg bg-slate-100 text-slate-500 grid place-items-center shrink-0">
                      <Icon name={a.avatar} size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-700">{a.name}</div>
                      <Badge tone="amber" className="mt-1">敬请期待</Badge>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">{a.description}</div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fork modal */}
      {forkSource && (
        <div
          onClick={() => setForkSource(null)}
          className="fixed inset-0 z-[80] bg-slate-900/30 backdrop-blur-sm grid place-items-center px-4"
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[560px]">
            <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-brand-100 text-brand-700 grid place-items-center shrink-0">
                <Copy size={18} />
              </div>
              <div className="flex-1">
                <div className="text-sm text-slate-500">复制智能体</div>
                <div className="text-base font-semibold text-slate-900">
                  从「{forkSource.name}」开始
                </div>
              </div>
              <button onClick={() => setForkSource(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div>
                <div className="text-[11px] text-slate-500 mb-1">新名字</div>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                <div className="text-[10px] text-slate-400 font-mono mt-1">{newCode}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 mb-1 flex items-center gap-1">
                  <Wand2 size={11} />
                  一句话说说你想怎么改它? (可选)
                </div>
                <Textarea
                  rows={3}
                  placeholder="比如：甲公司有外币账户, 要额外比汇率折算"
                  value={changeDesc}
                  onChange={(e) => setChangeDesc(e.target.value)}
                />
                <div className="text-[10px] text-slate-400 mt-1">
                  AI 会根据描述预改提示词和工具集 — 创建后还能继续在编辑器里调整。
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2 justify-end">
              <Button variant="outline" onClick={() => setForkSource(null)}>取消</Button>
              <Button
                variant="primary"
                disabled={!newName.trim() || fork.isPending}
                onClick={() => fork.mutate()}
              >
                {fork.isPending ? '复制中…' : <>开始改造 <ArrowRight size={14} /></>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

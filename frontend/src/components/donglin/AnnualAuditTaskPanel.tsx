import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Circle,
  FileArchive, FileSpreadsheet, ListTodo, Loader2, MessageSquare, ShieldCheck,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { QuoteRef } from '@/components/agent/ChatPanel'

interface Props {
  engagementCode: string
  paperIndex?: string
  onAskInChat?: (quote: QuoteRef) => void
  className?: string
}

type TaskData = {
  task_key: string
  paper_index?: string
  stage?: string
  priority?: 'high' | 'medium' | 'low'
  kind?: string
  title: string
  detail: string
  required_action: string
  recommendation?: string
  evidence_refs?: Array<{ file: string; location: string; quote?: string }>
  status: 'open' | 'completed'
  resolution?: string
  resolved_by?: string
  resolved_at?: string
}

function baseIndex(index?: string) {
  return (index || '').split('.')[0]
}

function matchesPaper(taskIndex: string | undefined, paperIndex: string | undefined) {
  if (!taskIndex || !paperIndex) return false
  const current = baseIndex(paperIndex)
  return taskIndex.split('/').some((item) => baseIndex(item.trim()) === current)
}

export default function AnnualAuditTaskPanel({
  engagementCode, paperIndex, onAskInChat, className,
}: Props) {
  const qc = useQueryClient()
  const [scope, setScope] = useState<'paper' | 'project'>('paper')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [resolutionMap, setResolutionMap] = useState<Record<number, string>>({})
  const [resolvingId, setResolvingId] = useState<number | null>(null)
  const [taskError, setTaskError] = useState('')

  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: ['annual-audit-project', engagementCode],
    queryFn: () => api.getAnnualAuditProject(engagementCode),
  })

  const allTasks = snapshot?.tasks || []
  const visibleTasks = useMemo(() => {
    if (scope === 'project') return allTasks
    const matched = allTasks.filter((task) => matchesPaper((task.data as TaskData).paper_index, paperIndex))
    return matched.length > 0 ? matched : allTasks.filter((task) => (task.data as TaskData).priority === 'high')
  }, [allTasks, scope, paperIndex])
  const openTasks = visibleTasks.filter((task) => (task.data as TaskData).status !== 'completed')
  const completedTasks = visibleTasks.filter((task) => (task.data as TaskData).status === 'completed')

  function toggle(id: number) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function resolveTask(id: number) {
    setResolvingId(id)
    setTaskError('')
    try {
      await api.resolveAnnualAuditTask(engagementCode, id, {
        status: 'completed',
        resolution: resolutionMap[id] || '已按要求完成并由审计师确认。',
        resolved_by: '审计师',
      })
      await qc.invalidateQueries({ queryKey: ['annual-audit-project', engagementCode] })
    } catch (error: any) {
      setTaskError(error?.message || '任务处理失败')
    } finally {
      setResolvingId(null)
    }
  }

  if (isLoading) {
    return <div className={cn('h-full grid place-items-center text-xs text-slate-500', className)}><Loader2 size={15} className="animate-spin mr-1" />载入项目任务…</div>
  }
  if (error || !snapshot) {
    return <div className={cn('p-4 text-xs text-rose-600', className)}>项目任务加载失败</div>
  }

  const projectData = snapshot.project.data as any
  const steps = (projectData.workflow_steps || []) as Array<{ code: string; name: string; status: string }>

  return (
    <div className={cn('h-full flex flex-col bg-slate-50/50', className)}>
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
        <div className="flex items-start gap-2">
          <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 grid place-items-center">
            <ListTodo size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-slate-900 truncate">
              {projectData.client_name || snapshot.project.display_name}
            </div>
            <div className="text-[10px] text-slate-500">
              {projectData.workflow_status || '待执行'} · {snapshot.metrics.open_tasks} 项待处理
            </div>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            {paperIndex || '项目'}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1">
          {snapshot.requirements.map((item) => (
            <div
              key={item.key}
              className={cn(
                'rounded border px-1.5 py-1 text-[9.5px] truncate',
                item.status === 'ready'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700',
              )}
              title={item.label}
            >
              {item.status === 'ready' ? '✓' : '!'} {item.label}
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-1">
          {steps.map((item, index) => {
            const complete = item.status === 'completed'
            const active = item.status === 'in_progress'
            return (
              <div key={item.code} className="flex items-center gap-1 min-w-0">
                <div
                  className={cn(
                    'h-5 w-5 rounded-full grid place-items-center border shrink-0',
                    complete && 'bg-emerald-500 border-emerald-500 text-white',
                    active && 'bg-brand-600 border-brand-600 text-white',
                    !complete && !active && 'bg-white border-slate-200 text-slate-400',
                  )}
                  title={`${item.name}：${item.status}`}
                >
                  {complete ? <Check size={10} /> : active ? <Loader2 size={9} className="animate-spin" /> : <Circle size={8} />}
                </div>
                {index < steps.length - 1 && <div className="w-3 h-px bg-slate-200" />}
              </div>
            )
          })}
          <span className="ml-auto text-[9.5px] text-slate-400">年审流程</span>
        </div>
      </div>

      <div className="shrink-0 flex border-b border-slate-200 bg-white">
        <button
          onClick={() => setScope('paper')}
          className={cn(
            'flex-1 py-2 text-[11px] font-medium border-b-2',
            scope === 'paper' ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500',
          )}
        >
          当前底稿
        </button>
        <button
          onClick={() => setScope('project')}
          className={cn(
            'flex-1 py-2 text-[11px] font-medium border-b-2',
            scope === 'project' ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500',
          )}
        >
          全项目 <span className="ml-1 text-[9px] rounded bg-slate-100 px-1">{snapshot.metrics.open_tasks}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {taskError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[10.5px] text-rose-700">
            {taskError}
          </div>
        )}
        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-2.5 py-2 border-b border-slate-100 flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-amber-600" />
            <span className="text-[11.5px] font-semibold text-slate-800">需要审计师处理</span>
            <span className="ml-auto text-[10px] text-amber-700">{openTasks.length} 项</span>
          </div>
          <div className="divide-y divide-slate-100">
            {openTasks.map((task) => {
              const data = task.data as TaskData
              const isOpen = expanded.has(task.id)
              const isBusy = resolvingId === task.id
              return (
                <div key={task.id}>
                  <button
                    onClick={() => toggle(task.id)}
                    className="w-full px-2.5 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="flex items-start gap-2">
                      {isOpen ? <ChevronDown size={12} className="mt-0.5 text-slate-400" /> : <ChevronRight size={12} className="mt-0.5 text-slate-400" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            'rounded border px-1 py-px text-[9px] font-semibold',
                            data.priority === 'high' ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700',
                          )}>
                            {data.priority === 'high' ? '高优先级' : '待处理'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">{data.paper_index || '项目'}</span>
                        </div>
                        <div className="text-[11.5px] font-medium text-slate-800 mt-1 leading-snug">{data.title}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{data.required_action}</div>
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pl-7 space-y-2">
                      <div className="rounded bg-slate-50 px-2 py-1.5 text-[10.5px] text-slate-600 leading-relaxed">
                        <strong className="text-slate-700">异常/判断：</strong>{data.detail}
                      </div>
                      {data.recommendation && (
                        <div className="rounded border border-brand-100 bg-brand-50 px-2 py-1.5 text-[10.5px] text-brand-800 leading-relaxed">
                          <strong>Agent建议：</strong>{data.recommendation}
                        </div>
                      )}
                      {(data.evidence_refs || []).map((ref, index) => (
                        <div key={`${ref.file}-${index}`} className="rounded border border-sky-100 bg-sky-50 px-2 py-1.5 text-[10px] text-sky-800">
                          <div className="flex items-center gap-1 font-medium"><FileSpreadsheet size={10} /> {ref.file}</div>
                          <div className="mt-0.5">定位：{ref.location}</div>
                          {ref.quote && <div className="mt-0.5 text-sky-700">证据：{ref.quote}</div>}
                        </div>
                      ))}
                      <textarea
                        rows={2}
                        value={resolutionMap[task.id] || ''}
                        onChange={(event) => setResolutionMap((current) => ({ ...current, [task.id]: event.target.value }))}
                        placeholder="填写处理结果或确认理由"
                        className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[10.5px] outline-none focus:border-brand-300"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => resolveTask(task.id)}
                          disabled={isBusy}
                          className="flex-1 h-7 rounded border border-emerald-300 bg-emerald-50 text-[10.5px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {isBusy ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />} 标记已处理
                        </button>
                        <button
                          onClick={() => onAskInChat?.({
                            label: data.title,
                            detail: `${data.detail}\n需要处理：${data.required_action}`,
                            color: data.priority === 'high' ? 'rose' : 'amber',
                          })}
                          className="flex-1 h-7 rounded border border-brand-200 bg-white text-[10.5px] font-medium text-brand-700 hover:bg-brand-50 flex items-center justify-center gap-1"
                        >
                          <MessageSquare size={10} /> 询问Agent
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {openTasks.length === 0 && (
              <div className="px-3 py-6 text-center text-[11px] text-emerald-600">
                <ShieldCheck size={18} className="mx-auto mb-1" /> 当前范围没有未处理事项
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-2.5 py-2 border-b border-slate-100 flex items-center gap-1.5">
            <FileArchive size={12} className="text-sky-600" />
            <span className="text-[11.5px] font-semibold text-slate-800">项目资料</span>
            <span className="ml-auto text-[10px] text-slate-400">{snapshot.materials.length} 个文件</span>
          </div>
          <div className="p-2 space-y-1">
            {snapshot.materials.slice(0, 8).map((item) => (
              <div key={item.id} className="flex items-center gap-1.5 rounded bg-slate-50 px-2 py-1.5 text-[10px] text-slate-600">
                {(item.data as any)?.category === 'account_set'
                  ? <FileSpreadsheet size={10} className="text-brand-500" />
                  : <FileArchive size={10} className="text-sky-500" />}
                <span className="truncate flex-1">{String((item.data as any)?.filename || item.display_name)}</span>
                <span className="text-emerald-600">{String((item.data as any)?.status || 'uploaded')}</span>
              </div>
            ))}
          </div>
        </section>

        {completedTasks.length > 0 && (
          <details className="rounded-lg border border-emerald-200 bg-white">
            <summary className="px-2.5 py-2 cursor-pointer text-[11px] font-medium text-emerald-700">
              已完成 {completedTasks.length} 项
            </summary>
            <div className="border-t border-emerald-100 divide-y divide-slate-100">
              {completedTasks.map((task) => {
                const data = task.data as TaskData
                return (
                  <div key={task.id} className="px-3 py-2 text-[10px] text-slate-600">
                    <div className="flex items-center gap-1 text-emerald-700 font-medium"><CheckCircle2 size={10} /> {data.title}</div>
                    {data.resolution && <div className="mt-0.5 pl-4">{data.resolution}</div>}
                  </div>
                )
              })}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

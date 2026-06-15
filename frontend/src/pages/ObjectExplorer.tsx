import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Search, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { cn, formatMoney } from '@/lib/utils'

export default function ObjectExplorer() {
  const { code } = useParams()
  const nav = useNavigate()

  const { data: types = [] } = useQuery({ queryKey: ['object-types'], queryFn: api.listObjectTypes })
  const activeCode = code || types[0]?.code
  const activeType = types.find((t) => t.code === activeCode)
  const { data: objects = [] } = useQuery({
    queryKey: ['objects', activeCode],
    queryFn: () => api.listObjects(activeCode),
    enabled: !!activeCode,
  })

  return (
    <div className="h-full flex">
      <div className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-4 pt-5 pb-3 border-b border-slate-100">
          <div className="text-xs text-slate-500 mb-1">数据浏览 · Object Explorer</div>
          <div className="text-lg font-semibold text-slate-900">浏览实例</div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {types.map((t) => (
            <button
              key={t.code}
              onClick={() => nav(`/explorer/${t.code}`)}
              className={cn(
                'w-full px-4 py-2 flex items-center gap-3 text-left text-sm',
                t.code === activeCode ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50 text-slate-700',
              )}
            >
              <div className="h-6 w-6 rounded grid place-items-center text-white" style={{ background: t.color }}>
                <Icon name={t.icon} size={12} />
              </div>
              <span className="flex-1 truncate">{t.display_name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-6">
          {activeType && (
            <div className="mb-4 flex items-end gap-3">
              <h1 className="text-xl font-semibold text-slate-900">{activeType.display_name}</h1>
              <span className="text-sm text-slate-500">{objects.length} 条记录</span>
              <Link to={`/ontology/${activeType.code}`} className="ml-auto text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
                <ExternalLink size={12} /> 查看类型定义
              </Link>
            </div>
          )}

          <Card>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  placeholder="搜索…"
                  className="w-full h-8 pl-8 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            {objects.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/60 text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">#</th>
                      <th className="text-left px-4 py-2 font-medium">显示名</th>
                      {activeType?.properties_schema.slice(0, 4).map((p) => (
                        <th key={p.code} className="text-left px-4 py-2 font-medium">{p.label}</th>
                      ))}
                      <th className="text-left px-4 py-2 font-medium">更新时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {objects.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">#{o.id}</td>
                        <td className="px-4 py-2.5 text-slate-900 font-medium">
                          {activeType?.code === 'WorkingPaper' ? (
                            <Link to={`/workbench/${o.id}`} className="text-brand-700 hover:underline">{o.display_name}</Link>
                          ) : o.display_name}
                        </td>
                        {activeType?.properties_schema.slice(0, 4).map((p) => (
                          <td key={p.code} className="px-4 py-2.5 text-slate-700">
                            {formatCell(o.data?.[p.code], p.type)}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-slate-500 text-xs">
                          {new Date(o.updated_at).toLocaleString('zh-CN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-10 py-16 text-center text-sm text-slate-500">
                <Search className="mx-auto mb-2 text-slate-300" size={24} />
                还没有 {activeType?.display_name} 实例
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function formatCell(value: any, type: string): React.ReactNode {
  if (value === null || value === undefined || value === '') return <span className="text-slate-300">—</span>
  if (type === 'money' || type === 'number') return formatMoney(value)
  if (typeof value === 'object') {
    if (Array.isArray(value)) return <Badge tone="neutral">列表 · {value.length}</Badge>
    return <span className="font-mono text-xs text-slate-500">{JSON.stringify(value).slice(0, 40)}…</span>
  }
  return String(value)
}

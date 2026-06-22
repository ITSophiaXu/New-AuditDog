import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { Search, Plus, Eye, Database } from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Icon } from '@/components/ui/Icon'
import LinkGraph from '@/components/ontology/LinkGraph'
import { cn } from '@/lib/utils'

// 解析描述里的 [L1/L2/L3] + [甲所·簇] 双前缀
function parseDescMeta(desc: string | undefined): {
  layer: string | null
  cluster: string | null
  body: string
} {
  if (!desc) return { layer: null, cluster: null, body: '' }
  let work = desc
  // 先尝试匹配 [L1] / [L2] / [L3:firm] / [L0] / [L4:xxx]
  const layerM = work.match(/^\[(L[0-9](?::[^\]]+)?)\]\s*(.*)$/)
  let layer: string | null = null
  if (layerM) {
    layer = layerM[1]
    work = layerM[2]
  }
  // 再匹配 [甲所·簇]
  const clusterM = work.match(/^\[甲所·([^\]]+)\]\s*(.*)$/)
  let cluster: string | null = null
  if (clusterM) {
    cluster = clusterM[1]
    work = clusterM[2]
  }
  return { layer, cluster, body: work }
}

// 层级显示标签 (审计师反馈：合并 L1+L2 为通用准则层)
// L0 客户事实 / L1 通用准则 / L2 事务所专有 / L3 审计师经验
const LAYER_LABELS: Record<string, { short: string; full: string; tone: string }> = {
  L1:           { short: 'L1 通用', full: 'L1 通用准则 (ISA/IFRS/CSA/CAS/法律)', tone: 'teal' },
  'L2:donglin': { short: 'L2 甲所', full: 'L2 甲会计师事务所专有', tone: 'amber' },
  'L2:firm':    { short: 'L2 所有', full: 'L2 事务所内规', tone: 'amber' },
  'L3:auditor': { short: 'L3 经验', full: 'L3 审计师个人经验 (待捕获)', tone: 'sky' },
  L0:           { short: 'L0 客户', full: 'L0 客户事实', tone: 'gray' },
}

export default function OntologyManager() {
  const { code } = useParams()
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [clusterFilter, setClusterFilter] = useState<string>('')
  const [layerFilter, setLayerFilter] = useState<string>('')

  const { data: types = [] } = useQuery({ queryKey: ['object-types'], queryFn: api.listObjectTypes })
  const { data: linkTypes = [] } = useQuery({ queryKey: ['link-types'], queryFn: api.listLinkTypes })
  const { data: actionTypes = [] } = useQuery({ queryKey: ['action-types'], queryFn: api.listActionTypes })

  // 给每个 type 算 layer + cluster
  const typesWithCluster = useMemo(
    () => types.map((t) => {
      const { layer, cluster, body } = parseDescMeta(t.description)
      return { ...t, _layer: layer, _cluster: cluster, _cleanDesc: body, _isDonglin: !!cluster }
    }),
    [types],
  )

  // 簇统计
  const clusterStats = useMemo(() => {
    const c = new Map<string, number>()
    c.set('全部', typesWithCluster.length)
    typesWithCluster.forEach((t) => {
      if (t._cluster) c.set(t._cluster, (c.get(t._cluster) || 0) + 1)
    })
    return c
  }, [typesWithCluster])

  // 层级统计
  const layerStats = useMemo(() => {
    const m = new Map<string, number>()
    typesWithCluster.forEach((t) => {
      const key = t._layer || '(未标层级)'
      m.set(key, (m.get(key) || 0) + 1)
    })
    return m
  }, [typesWithCluster])

  // 过滤
  const filteredTypes = useMemo(() => {
    let list = typesWithCluster
    if (layerFilter) {
      list = list.filter((t) => t._layer === layerFilter)
    }
    if (clusterFilter) {
      list = list.filter((t) => t._cluster === clusterFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((t) =>
        t.code.toLowerCase().includes(q) ||
        t.display_name.toLowerCase().includes(q) ||
        (t._cleanDesc || '').toLowerCase().includes(q),
      )
    }
    return list
  }, [typesWithCluster, clusterFilter, layerFilter, search])

  const active = code ? typesWithCluster.find((t) => t.code === code) : filteredTypes[0]
  const relatedLinks = active
    ? linkTypes.filter((l) => l.source_type_code === active.code || l.target_type_code === active.code)
    : []
  const relatedActions = active
    ? actionTypes.filter((a) => a.target_type_code === active.code || a.target_type_code === '*')
    : []

  return (
    <div className="h-full flex">
      {/* Type list */}
      <div className="w-80 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-4 pt-5 pb-4 border-b border-slate-100">
          <div className="text-xs text-slate-500 mb-1">本体管理 · Ontology Manager</div>
          <div className="text-lg font-semibold text-slate-900">对象类型</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            共 <b>{types.length}</b> 类 · 甲会计师事务所 (甲公司 2025)
          </div>
          <div className="relative mt-3">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索对象类型…"
              className="w-full h-8 pl-8 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-brand-500"
            />
          </div>
          {/* Layer filter chips (L1 / L2 / L3) */}
          <div className="mt-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">按层级</div>
            <div className="flex flex-wrap gap-1">
              <FilterChip label="全部层级" count={typesWithCluster.length}
                active={layerFilter === ''} onClick={() => setLayerFilter('')} />
              {Array.from(layerStats.entries())
                .sort((a, b) => {
                  const order: any = { 'L1': 1, 'L2:donglin': 2, 'L3:auditor': 3, 'L0': 4, '(未标层级)': 9 }
                  return (order[a[0]] || 9) - (order[b[0]] || 9)
                })
                .map(([k, v]) => {
                  const meta = LAYER_LABELS[k]
                  return (
                    <FilterChip
                      key={k}
                      label={meta?.short || k}
                      count={v}
                      active={layerFilter === k}
                      tone={meta?.tone}
                      onClick={() => setLayerFilter(k === layerFilter ? '' : k)}
                    />
                  )
                })}
            </div>
          </div>
          {/* Cluster filter chips */}
          <div className="mt-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">按业务簇</div>
            <div className="flex flex-wrap gap-1">
              <FilterChip label="全部簇" count={clusterStats.get('全部') || 0}
                active={clusterFilter === ''} onClick={() => setClusterFilter('')} />
              {Array.from(clusterStats.entries())
                .filter(([k]) => k !== '全部')
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <FilterChip key={k} label={k} count={v}
                    active={clusterFilter === k}
                    onClick={() => setClusterFilter(k === clusterFilter ? '' : k)} />
                ))}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {filteredTypes.map((t) => {
            const sel = active?.code === t.code
            return (
              <button
                key={t.code}
                onClick={() => nav(`/ontology/${t.code}`)}
                className={cn(
                  'w-full px-4 py-2 flex items-center gap-3 text-left text-sm transition-colors',
                  sel ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50 text-slate-700',
                )}
              >
                <div
                  className="h-7 w-7 rounded-md grid place-items-center text-white shrink-0"
                  style={{ background: t.color }}
                >
                  <Icon name={t.icon} size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-1.5">
                    <span className="truncate">{t.display_name}</span>
                    {t._layer && LAYER_LABELS[t._layer] && (
                      <span className={cn(
                        'inline-block px-1.5 py-0 rounded text-[9px] font-bold shrink-0',
                        t._layer === 'L1' && 'bg-teal-100 text-teal-700',
                        t._layer === 'L2:donglin' && 'bg-amber-100 text-amber-700',
                        t._layer === 'L3:auditor' && 'bg-sky-100 text-sky-700',
                        t._layer === 'L0' && 'bg-slate-100 text-slate-600',
                      )}>
                        {LAYER_LABELS[t._layer].short}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate font-mono flex items-center gap-1">
                    {t.code}
                    {t._cluster && (
                      <span className="text-[10px] text-slate-400">· {t._cluster}</span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
          {filteredTypes.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">无匹配类型</div>
          )}
        </div>
        <div className="p-3 border-t border-slate-100">
          <Button variant="outline" className="w-full" size="sm">
            <Plus size={14} /> 新建对象类型
          </Button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto">
        {active ? (
          <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">
            <div className="flex items-start gap-4">
              <div
                className="h-12 w-12 rounded-xl grid place-items-center text-white shrink-0"
                style={{ background: active.color }}
              >
                <Icon name={active.icon} size={22} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-semibold text-slate-900">{active.display_name}</h1>
                  <span className="font-mono text-xs text-slate-500">{active.code}</span>
                  {active._cluster && (
                    <Badge tone="amber">{active._cluster}</Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-1">{active._cleanDesc || '无描述'}</p>
              </div>
              <Link to={`/explorer/${active.code}`}>
                <Button variant="outline" size="sm"><Eye size={14} /> 浏览实例</Button>
              </Link>
            </div>

            <Tabs defaultValue="properties">
              <TabsList>
                <TabsTrigger value="properties">属性 ({active.properties_schema.length})</TabsTrigger>
                <TabsTrigger value="links">链接 ({relatedLinks.length})</TabsTrigger>
                <TabsTrigger value="actions">操作 ({relatedActions.length})</TabsTrigger>
                <TabsTrigger value="graph">图谱</TabsTrigger>
              </TabsList>

              <TabsContent value="properties" className="mt-4">
                <Card>
                  <div className="grid grid-cols-12 px-5 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100 bg-slate-50/60">
                    <div className="col-span-3">编码</div>
                    <div className="col-span-3">显示名</div>
                    <div className="col-span-2">类型</div>
                    <div className="col-span-1">必填</div>
                    <div className="col-span-3">枚举 / 说明</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {active.properties_schema.map((p) => (
                      <div key={p.code} className="grid grid-cols-12 px-5 py-3 text-sm">
                        <div className="col-span-3 font-mono text-slate-700">{p.code}</div>
                        <div className="col-span-3 text-slate-900">{p.label}</div>
                        <div className="col-span-2">
                          <Badge tone="neutral" className="font-mono">{p.type}</Badge>
                        </div>
                        <div className="col-span-1">{p.required ? '是' : '否'}</div>
                        <div className="col-span-3 text-xs text-slate-500">
                          {p.enum ? p.enum.join(' / ') : p.help || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="links" className="mt-4 space-y-2">
                {relatedLinks.map((l) => (
                  <Card key={l.code} className="px-5 py-3.5 flex items-center gap-3">
                    <Badge tone={l.source_type_code === active.code ? 'brand' : 'sky'}>
                      {l.source_type_code === active.code ? '出向' : '入向'}
                    </Badge>
                    <div className="text-sm font-medium">{l.display_name}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      {l.source_type_code} → {l.target_type_code} ({l.cardinality})
                    </div>
                  </Card>
                ))}
                {relatedLinks.length === 0 && <Empty label="无相关链接类型" />}
              </TabsContent>

              <TabsContent value="actions" className="mt-4 space-y-2">
                {relatedActions.map((a) => (
                  <Card key={a.code} className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">{a.display_name}</div>
                      <span className="font-mono text-xs text-slate-500">{a.code}</span>
                      <Badge tone="brand" className="ml-auto">{a.kind}</Badge>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{a.description}</div>
                    {a.parameters_schema.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.parameters_schema.map((p) => (
                          <span key={p.code} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                            {p.code}: {p.type}
                          </span>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
                {relatedActions.length === 0 && <Empty label="无操作类型" />}
              </TabsContent>

              <TabsContent value="graph" className="mt-4">
                <LinkGraph objectTypes={types} linkTypes={linkTypes} focusCode={active.code} />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="h-full grid place-items-center text-slate-500">
            <div className="text-center">
              <Database size={32} className="mx-auto mb-2 text-slate-300" />
              请在左侧选择一个对象类型
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const TONE_CLASSES: Record<string, { active: string; inactive: string }> = {
  sky:    { active: 'bg-sky-600 text-white border-sky-600',       inactive: 'border-sky-300 text-sky-700 hover:bg-sky-50' },
  teal:   { active: 'bg-teal-600 text-white border-teal-600',     inactive: 'border-teal-300 text-teal-700 hover:bg-teal-50' },
  amber:  { active: 'bg-amber-600 text-white border-amber-600',   inactive: 'border-amber-300 text-amber-700 hover:bg-amber-50' },
  gray:   { active: 'bg-slate-500 text-white border-slate-500',   inactive: 'border-slate-300 text-slate-600 hover:bg-slate-50' },
  brand:  { active: 'bg-brand-500 text-white border-brand-500',   inactive: 'border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700' },
}

function FilterChip({ label, count, active, tone, onClick }: {
  label: string; count: number; active: boolean; tone?: string; onClick: () => void
}) {
  const t = TONE_CLASSES[tone || 'brand'] || TONE_CLASSES.brand
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition-colors bg-white',
        active ? t.active : t.inactive,
      )}
    >
      <span>{label}</span>
      <span className={cn('text-[10px]', active ? 'opacity-80' : 'opacity-60')}>{count}</span>
    </button>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="text-center py-10 text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
      {label}
    </div>
  )
}

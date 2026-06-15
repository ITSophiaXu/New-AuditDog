/**
 * 项目档案 — 左侧项目列表 + 右侧材料管理 + 底稿增量更新入口
 *
 * 技术：File System Access API (Chrome/Edge)
 * 状态持久化：localStorage（记录已使用的文件 lastModified，用于变更检测）
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  FolderOpen, FolderSync, FileText, FileSpreadsheet, Image,
  RefreshCw, Sparkles, CheckCircle2, AlertCircle, Clock,
  ChevronRight, Lock, Info, Folder, Upload, Search,
  PlusCircle, Building2, CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

// ─── Backend types ────────────────────────────────────────────────────────────
type EngagementEntry = {
  id: number
  display_name: string
  code: string
  short_name: string
  company_name: string
  status: string
  year: string
  industry: string
  partner: string
}

// ─── 材料类型定义 ─────────────────────────────────────────────────────────────
type MaterialTypeId =
  | 'tb' | 'prior-tb' | 'ledger' | 'stock-chart'
  | 'business-reg' | 'bank-stmt' | 'fixed-assets'
  | 'contract' | 'other'

type MaterialType = {
  id: MaterialTypeId
  label: string
  affects: string[]
  color: string
}

const MATERIAL_TYPES: Record<MaterialTypeId, MaterialType> = {
  'tb':           { id: 'tb',           label: '试算平衡表',     affects: ['Y5', 'X1', 'A1', 'A6', 'A9', 'A24'], color: 'bg-blue-100 text-blue-700' },
  'prior-tb':     { id: 'prior-tb',     label: '前期试算平衡表', affects: ['Y5', 'A1', 'A6', 'A24'],              color: 'bg-indigo-100 text-indigo-700' },
  'ledger':       { id: 'ledger',       label: '明细账',         affects: ['A1', 'A6', 'A9', 'A24'],              color: 'bg-cyan-100 text-cyan-700' },
  'stock-chart':  { id: 'stock-chart',  label: '股权结构图',     affects: ['X1'],                                  color: 'bg-violet-100 text-violet-700' },
  'business-reg': { id: 'business-reg', label: '工商登记',       affects: ['X1', 'Y5'],                           color: 'bg-purple-100 text-purple-700' },
  'bank-stmt':    { id: 'bank-stmt',    label: '银行对账单',     affects: ['A1'],                                  color: 'bg-emerald-100 text-emerald-700' },
  'fixed-assets': { id: 'fixed-assets', label: '固定资产台账',   affects: ['A24'],                                 color: 'bg-orange-100 text-orange-700' },
  'contract':     { id: 'contract',     label: '合同 / 协议',    affects: ['A9', 'D1'],                           color: 'bg-yellow-100 text-yellow-700' },
  'other':        { id: 'other',        label: '其他',            affects: [],                                      color: 'bg-slate-100 text-slate-600' },
}

// 文件名 → 材料类型
const FILE_PATTERNS: Array<{ regex: RegExp; type: MaterialTypeId }> = [
  { regex: /前期.*TB|前期.*试算|上年.*TB|上期.*TB|prior.*TB/i,               type: 'prior-tb' },
  { regex: /试算平衡|(?:^|[-_\s])TB(?:[-_.\s]|$)/i,                         type: 'tb' },
  { regex: /明细账|科目余额/i,                                                type: 'ledger' },
  { regex: /股权结构|股权图|架构图|shareholding/i,                           type: 'stock-chart' },
  { regex: /工商登记|营业执照|工商信息|business.*reg/i,                      type: 'business-reg' },
  { regex: /银行对账|银行流水|银行存款明细|bank.*stmt|bank.*reconcil/i,      type: 'bank-stmt' },
  { regex: /固定资产台账|资产台账|固定资产明细|fixed.*asset/i,               type: 'fixed-assets' },
  { regex: /合同|协议|contract|agreement/i,                                  type: 'contract' },
]

const ALLOWED_EXTS = new Set(['.xlsx', '.xls', '.csv', '.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg'])

function detectType(filename: string): MaterialTypeId {
  const lower = filename.toLowerCase()
  const ext = lower.substring(lower.lastIndexOf('.'))
  if (!ALLOWED_EXTS.has(ext)) return 'other'
  for (const { regex, type } of FILE_PATTERNS) {
    if (regex.test(filename)) return type
  }
  return 'other'
}

// ─── 文件条目类型 ──────────────────────────────────────────────────────────────
type FileEntry = {
  name: string
  path: string
  lastModified: number
  size: number
  materialType: MaterialTypeId
  isNew: boolean
  isChanged: boolean
}

// ─── localStorage 工具 ────────────────────────────────────────────────────────
type KnownFile = { path: string; lastModified: number }
const lsKey = (engCode: string, tab: string) => `archive-${engCode}-${tab}-known`

function loadKnown(engCode: string, tab: string): Map<string, number> {
  try {
    const raw = localStorage.getItem(lsKey(engCode, tab))
    if (!raw) return new Map()
    const arr: KnownFile[] = JSON.parse(raw)
    return new Map(arr.map(f => [f.path, f.lastModified]))
  } catch { return new Map() }
}

function saveKnown(engCode: string, tab: string, files: FileEntry[]) {
  try {
    const arr: KnownFile[] = files.map(f => ({ path: f.path, lastModified: f.lastModified }))
    localStorage.setItem(lsKey(engCode, tab), JSON.stringify(arr))
  } catch {}
}

// ─── 底稿状态工具 ─────────────────────────────────────────────────────────────
const UPDATABLE_STATUSES = new Set(['unfilled', 'AI 初稿', 'ai_draft', ''])
function isUpdatable(status: string | null | undefined): boolean {
  if (!status) return true
  return UPDATABLE_STATUSES.has(status)
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: any }> = {
  'unfilled':      { label: '未填',     color: 'text-slate-400', icon: Clock },
  'AI 初稿':       { label: 'AI 初稿',  color: 'text-blue-500',  icon: Sparkles },
  '待人工确认':    { label: '待确认',   color: 'text-amber-500', icon: AlertCircle },
  '已审核':        { label: '已审核',   color: 'text-emerald-600', icon: CheckCircle2 },
  '已签字':        { label: '已签字',   color: 'text-emerald-700', icon: Lock },
}

function PaperStatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status || '未填', color: 'text-slate-400', icon: Clock }
  const Icon = s.icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', s.color)}>
      <Icon size={11} />
      {s.label}
    </span>
  )
}

// 文件扩展名 → 图标
function FileIcon({ name, size = 14 }: { name: string; size?: number }) {
  const ext = name.toLowerCase().split('.').pop()
  if (['xlsx', 'xls', 'csv'].includes(ext ?? '')) return <FileSpreadsheet size={size} className="text-emerald-600" />
  if (['pdf'].includes(ext ?? ''))                  return <FileText size={size} className="text-red-500" />
  if (['png', 'jpg', 'jpeg'].includes(ext ?? ''))   return <Image size={size} className="text-purple-500" />
  return <FileText size={size} className="text-slate-400" />
}

// ─── API ──────────────────────────────────────────────────────────────────────
type PaperStatusEntry = { id: number; index: string; name: string; review_status: string }

async function fetchEngagements(): Promise<EngagementEntry[]> {
  const r = await fetch('/api/archive/engagements')
  if (!r.ok) return []
  return r.json()
}

async function fetchPaperStatuses(engCode: string): Promise<PaperStatusEntry[]> {
  const r = await fetch(`/api/archive/papers?eng_code=${encodeURIComponent(engCode)}`)
  if (!r.ok) return []
  return r.json()
}

async function triggerFill(engCode: string, paperIndex: string): Promise<boolean> {
  try {
    if (engCode === 'ENG-BANMU-2024') {
      const r = await fetch(`/api/banmu/fill/${encodeURIComponent(paperIndex)}`, { method: 'POST' })
      return r.ok
    } else {
      const r = await fetch(`/api/donglin/fill-planning/${encodeURIComponent(paperIndex)}`, { method: 'POST' })
      return r.ok
    }
  } catch { return false }
}

// ─── Project avatar color ─────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
]
function avatarColor(code: string) {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  '进行中': { label: '进行中', dot: 'bg-emerald-400' },
  '已完成': { label: '已完成', dot: 'bg-slate-400' },
  '':       { label: '未知',   dot: 'bg-slate-300' },
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export default function ProjectArchive() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [searchQ, setSearchQ] = useState('')
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current')

  const { data: engagements = [], isLoading: loadingEng } = useQuery<EngagementEntry[]>({
    queryKey: ['archive-engagements'],
    queryFn: fetchEngagements,
  })

  // Auto-select first engagement
  useEffect(() => {
    if (!selectedCode && engagements.length > 0) {
      setSelectedCode(engagements[0].code)
    }
  }, [engagements, selectedCode])

  const filtered = useMemo(() => {
    if (!searchQ.trim()) return engagements
    const q = searchQ.toLowerCase()
    return engagements.filter(e =>
      e.short_name.toLowerCase().includes(q) ||
      e.company_name.toLowerCase().includes(q) ||
      e.code.toLowerCase().includes(q) ||
      e.year.includes(q)
    )
  }, [engagements, searchQ])

  const selectedEng = engagements.find(e => e.code === selectedCode) ?? null

  // ── Per-project archive state ──────────────────────────────────────────────
  const [currentDirHandle, setCurrentDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [historyDirHandle, setHistoryDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [currentFiles, setCurrentFiles] = useState<FileEntry[]>([])
  const [historyFiles, setHistoryFiles] = useState<FileEntry[]>([])
  const [scanning, setScanning] = useState(false)
  const [updatingPapers, setUpdatingPapers] = useState<string[]>([])
  const [updateResult, setUpdateResult] = useState<{ ok: number; skipped: number } | null>(null)

  const { data: paperStatuses = [] } = useQuery<PaperStatusEntry[]>({
    queryKey: ['archive-papers', selectedCode],
    queryFn: () => fetchPaperStatuses(selectedCode!),
    enabled: !!selectedCode,
  })

  useEffect(() => {
    setCurrentDirHandle(null)
    setHistoryDirHandle(null)
    setCurrentFiles([])
    setHistoryFiles([])
    setUpdateResult(null)
    setActiveTab('current')
  }, [selectedCode])

  const tabFiles     = activeTab === 'current' ? currentFiles : historyFiles
  const tabDirHandle = activeTab === 'current' ? currentDirHandle : historyDirHandle

  // ── Scan ──────────────────────────────────────────────────────────────────
  const scanDir = useCallback(async (
    handle: FileSystemDirectoryHandle, prefix: string, out: FileEntry[], depth = 0,
  ) => {
    for await (const [name, entry] of handle as any) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const path = prefix ? `${prefix}/${name}` : name
      if ((entry as any).kind === 'file') {
        const ext = name.toLowerCase().substring(name.lastIndexOf('.'))
        if (!ALLOWED_EXTS.has(ext)) continue
        const file = await (entry as any).getFile() as File
        out.push({ name, path, lastModified: file.lastModified, size: file.size,
          materialType: detectType(name), isNew: false, isChanged: false })
      } else if ((entry as any).kind === 'directory' && depth < 1) {
        await scanDir(entry as FileSystemDirectoryHandle, path, out, depth + 1)
      }
    }
  }, [])

  const doScan = useCallback(async (handle: FileSystemDirectoryHandle, tab: 'current' | 'history') => {
    if (!selectedCode) return
    setScanning(true); setUpdateResult(null)
    const out: FileEntry[] = []
    await scanDir(handle, '', out)
    const known = loadKnown(selectedCode, tab)
    for (const f of out) {
      const prev = known.get(f.path)
      if (prev === undefined) f.isNew = true
      else if (prev !== f.lastModified) f.isChanged = true
    }
    if (tab === 'current') setCurrentFiles(out)
    else setHistoryFiles(out)
    setScanning(false)
  }, [selectedCode, scanDir])

  const connectFolder = useCallback(async (tab: 'current' | 'history') => {
    if (!('showDirectoryPicker' in window)) {
      alert('请使用 Chrome 或 Edge 浏览器以连接本地文件夹。'); return
    }
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' })
      if (tab === 'current') setCurrentDirHandle(handle)
      else setHistoryDirHandle(handle)
      await doScan(handle, tab)
    } catch (e: any) { if (e?.name !== 'AbortError') console.error(e) }
  }, [doScan])

  const rescan = useCallback(async () => {
    const handle = activeTab === 'current' ? currentDirHandle : historyDirHandle
    if (handle) await doScan(handle, activeTab)
  }, [activeTab, currentDirHandle, historyDirHandle, doScan])

  // ── Impact analysis ────────────────────────────────────────────────────────
  const affected = useMemo(() => {
    const changedOrNew = tabFiles.filter(f => f.isNew || f.isChanged)
    if (changedOrNew.length === 0) return []
    const affectedSet = new Map<string, string[]>()
    for (const f of changedOrNew) {
      const mt = MATERIAL_TYPES[f.materialType]
      for (const idx of mt.affects) {
        const cur = affectedSet.get(idx) ?? []
        cur.push(`${mt.label}（${f.isNew ? '新增' : '已更新'}）`)
        affectedSet.set(idx, cur)
      }
    }
    return Array.from(affectedSet.entries()).map(([index, reasons]) => {
      const paper = paperStatuses.find(p => p.index === index)
      return {
        index, name: paper?.name ?? index,
        review_status: paper?.review_status ?? 'unfilled',
        reasons: [...new Set(reasons)],
        canUpdate: !paper || isUpdatable(paper.review_status),
      }
    }).sort((a, b) => a.index.localeCompare(b.index))
  }, [tabFiles, paperStatuses])

  const changedCount    = tabFiles.filter(f => f.isNew || f.isChanged).length
  const updatableCount  = affected.filter(p => p.canUpdate).length

  // ── Update ────────────────────────────────────────────────────────────────
  const handleUpdate = useCallback(async () => {
    if (!selectedCode) return
    const toUpdate = affected.filter(p => p.canUpdate)
    if (toUpdate.length === 0) return
    setUpdatingPapers(toUpdate.map(p => p.index))
    let ok = 0, skipped = 0
    for (const paper of toUpdate) {
      const success = await triggerFill(selectedCode, paper.index)
      if (success) ok++; else skipped++
      setUpdatingPapers(prev => prev.filter(i => i !== paper.index))
    }
    saveKnown(selectedCode, activeTab, tabFiles)
    const updated = tabFiles.map(f => ({ ...f, isNew: false, isChanged: false }))
    if (activeTab === 'current') setCurrentFiles(updated)
    else setHistoryFiles(updated)
    setUpdateResult({ ok, skipped })
    qc.invalidateQueries({ queryKey: ['archive-papers', selectedCode] })
  }, [affected, selectedCode, activeTab, tabFiles, qc])

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* ── Top header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3 shrink-0">
        <Folder size={20} className="text-brand-500" />
        <div>
          <h1 className="text-base font-semibold text-slate-800">项目档案</h1>
          <p className="text-xs text-slate-400">管理审计材料 · 材料更新后可一键同步底稿</p>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: Project list ── */}
        <aside className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-slate-100">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
              <Search size={13} className="text-slate-400 shrink-0" />
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="搜索项目…"
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto py-2">
            {loadingEng && (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-400">
                <RefreshCw size={12} className="animate-spin" /> 加载中…
              </div>
            )}
            {!loadingEng && filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-slate-400">无匹配项目</div>
            )}
            {filtered.map(eng => {
              const isActive = eng.code === selectedCode
              const sc = STATUS_CONFIG[eng.status] ?? STATUS_CONFIG['']
              const initials = (eng.short_name || eng.company_name || '?').slice(0, 2)
              return (
                <button
                  key={eng.code}
                  onClick={() => setSelectedCode(eng.code)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 mx-1 rounded-lg text-left transition-colors',
                    'hover:bg-slate-50',
                    isActive ? 'bg-brand-50 border border-brand-200' : 'border border-transparent',
                  )}
                  style={{ width: 'calc(100% - 8px)' }}
                >
                  {/* Avatar */}
                  <div className={cn(
                    'h-9 w-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0',
                    avatarColor(eng.code),
                  )}>
                    {initials}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      'text-sm font-medium truncate',
                      isActive ? 'text-brand-700' : 'text-slate-700',
                    )}>
                      {eng.short_name || eng.company_name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', sc.dot)} />
                      <span className="text-xs text-slate-400">{eng.year} · {sc.label}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* New project button */}
          <div className="p-3 border-t border-slate-100">
            <button
              onClick={() => navigate('/knowledge/intake')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-50 hover:text-brand-600 transition-colors border border-dashed border-slate-200"
            >
              <PlusCircle size={13} />
              新建项目
            </button>
          </div>
        </aside>

        {/* ── RIGHT: Archive content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedEng ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-slate-400">
                <Folder size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">从左侧选择一个项目</p>
              </div>
            </div>
          ) : (
            <>
              {/* Project header */}
              <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 shrink-0">
                <div className={cn(
                  'h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0',
                  avatarColor(selectedEng.code),
                )}>
                  {(selectedEng.short_name || selectedEng.company_name || '?').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 text-sm truncate">{selectedEng.company_name || selectedEng.short_name}</div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                    <span className="font-mono">{selectedEng.code}</span>
                    {selectedEng.industry && (
                      <><span>·</span><span>{selectedEng.industry}</span></>
                    )}
                    {selectedEng.partner && (
                      <><span>·</span><span>{selectedEng.partner}</span></>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => navigate('/workbench')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors border border-slate-200"
                >
                  底稿工作台 <ChevronRight size={12} />
                </button>
              </div>

              {/* Sub-tabs */}
              <div className="flex border-b border-slate-200 bg-white shrink-0">
                {(['current', 'history'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      'px-6 py-2.5 text-sm font-medium transition-colors',
                      activeTab === tab
                        ? 'text-brand-600 border-b-2 border-brand-600'
                        : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {tab === 'current' ? '📂 当期档案' : '🗄 历史档案（前期）'}
                  </button>
                ))}
              </div>

              {/* Scrollable content area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <FolderSection
                  tab={activeTab}
                  engCode={selectedEng.code}
                  projectLabel={selectedEng.company_name || selectedEng.short_name}
                  dirHandle={tabDirHandle}
                  files={tabFiles}
                  scanning={scanning}
                  onConnect={() => connectFolder(activeTab)}
                  onRescan={rescan}
                />

                {tabFiles.length > 0 && (
                  <ImpactPanel
                    affected={affected}
                    changedCount={changedCount}
                    updatableCount={updatableCount}
                    updatingPapers={updatingPapers}
                    updateResult={updateResult}
                    onUpdate={handleUpdate}
                    onGoToWorkbench={() => navigate('/workbench')}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── FolderSection ────────────────────────────────────────────────────────────
function FolderSection({
  tab, engCode, projectLabel, dirHandle, files, scanning,
  onConnect, onRescan,
}: {
  tab: 'current' | 'history'
  engCode: string
  projectLabel: string
  dirHandle: FileSystemDirectoryHandle | null
  files: FileEntry[]
  scanning: boolean
  onConnect: () => void
  onRescan: () => void
}) {
  const connected = dirHandle !== null
  const tabLabel = tab === 'current' ? '当期' : '历史'

  // Group by type
  const grouped = files.reduce<Record<MaterialTypeId, FileEntry[]>>((acc, f) => {
    ;(acc[f.materialType] ??= []).push(f)
    return acc
  }, {} as any)

  return (
    <div className="space-y-4">
      {/* Folder connection bar */}
      <div className={cn(
        'flex items-center gap-4 p-4 rounded-lg border',
        connected
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-slate-50 border-slate-200 border-dashed',
      )}>
        {connected ? (
          <>
            <div className="p-2 bg-emerald-100 rounded-lg">
              <FolderOpen size={18} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-800">
                📂 {dirHandle!.name}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {scanning ? '扫描中…' : `${files.length} 个文件`}
                {!scanning && files.filter(f => f.isNew).length > 0 && (
                  <span className="ml-2 text-emerald-600 font-medium">
                    +{files.filter(f => f.isNew).length} 新增
                  </span>
                )}
                {!scanning && files.filter(f => f.isChanged).length > 0 && (
                  <span className="ml-2 text-amber-600 font-medium">
                    {files.filter(f => f.isChanged).length} 已更新
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onRescan}
              disabled={scanning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={cn(scanning && 'animate-spin')} />
              重新扫描
            </button>
            <button
              onClick={onConnect}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
            >
              <FolderSync size={12} />
              换文件夹
            </button>
          </>
        ) : (
          <>
            <div className="p-2 bg-slate-100 rounded-lg">
              <Upload size={18} className="text-slate-400" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-700">
                连接{tabLabel}材料文件夹
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                选择存放 {projectLabel} {tabLabel}审计材料的本地文件夹
              </div>
            </div>
            <Button size="sm" onClick={onConnect}>
              <FolderOpen size={13} />
              连接本地文件夹
            </Button>
          </>
        )}
      </div>

      {/* File System API notice */}
      {!connected && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 rounded-lg text-xs text-blue-700">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            需要 Chrome 或 Edge 浏览器。授权后系统只读取文件名和修改时间，文件内容仅在触发"更新底稿"时上传。
          </span>
        </div>
      )}

      {/* File list */}
      {scanning && (
        <div className="flex items-center gap-2 py-8 justify-center text-slate-400 text-sm">
          <RefreshCw size={16} className="animate-spin" />
          正在扫描文件夹…
        </div>
      )}

      {!scanning && connected && files.length === 0 && (
        <div className="py-10 text-center text-slate-400 text-sm">
          未发现支持的文件（.xlsx / .pdf / .docx / .png 等）
        </div>
      )}

      {!scanning && files.length > 0 && (
        <div className="space-y-3">
          {(Object.entries(grouped) as [MaterialTypeId, FileEntry[]][])
            .sort(([a], [b]) => (a === 'other' ? 1 : b === 'other' ? -1 : a.localeCompare(b)))
            .map(([typeId, groupFiles]) => {
              const mt = MATERIAL_TYPES[typeId]
              return (
                <div key={typeId} className="border border-slate-200 rounded-lg overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
                    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', mt.color)}>
                      {mt.label}
                    </span>
                    {mt.affects.length > 0 && (
                      <span className="text-xs text-slate-400">
                        影响底稿：{mt.affects.join('、')}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-slate-400">{groupFiles.length} 个文件</span>
                  </div>
                  {/* File rows */}
                  <div className="divide-y divide-slate-100">
                    {groupFiles.map(f => (
                      <div key={f.path} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                        <FileIcon name={f.name} size={15} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-700 truncate">{f.name}</div>
                          {f.path !== f.name && (
                            <div className="text-xs text-slate-400 truncate">{f.path}</div>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 shrink-0">
                          {(f.size / 1024).toFixed(0)} KB
                        </div>
                        <div className="text-xs text-slate-400 shrink-0">
                          {new Date(f.lastModified).toLocaleDateString('zh-CN')}
                        </div>
                        {f.isNew && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                            新增
                          </span>
                        )}
                        {f.isChanged && !f.isNew && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                            已更新
                          </span>
                        )}
                        {!f.isNew && !f.isChanged && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs">
                            <CheckCircle2 size={10} />
                            已同步
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

// ─── ImpactPanel ──────────────────────────────────────────────────────────────
function ImpactPanel({
  affected, changedCount, updatableCount, updatingPapers,
  updateResult, onUpdate, onGoToWorkbench,
}: {
  affected: Array<{ index: string; name: string; review_status: string; reasons: string[]; canUpdate: boolean }>
  changedCount: number
  updatableCount: number
  updatingPapers: string[]
  updateResult: { ok: number; skipped: number } | null
  onUpdate: () => void
  onGoToWorkbench: () => void
}) {
  if (changedCount === 0 && !updateResult) return null

  const isUpdating = updatingPapers.length > 0

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 bg-brand-50/30">
        <Sparkles size={16} className="text-brand-500" />
        <div className="flex-1">
          <span className="font-medium text-slate-800 text-sm">底稿影响分析</span>
          {changedCount > 0 && (
            <span className="ml-2 text-xs text-slate-500">
              {changedCount} 个文件有变更 · {affected.length} 张底稿受影响
            </span>
          )}
        </div>
        {updateResult && (
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 size={13} className="text-emerald-500" />
            <span className="text-emerald-600 font-medium">已更新 {updateResult.ok} 张</span>
            {updateResult.skipped > 0 && (
              <span className="text-slate-400">跳过 {updateResult.skipped} 张</span>
            )}
          </div>
        )}
      </div>

      {/* Affected papers table */}
      {affected.length > 0 && (
        <div className="divide-y divide-slate-100">
          {affected.map(paper => (
            <div key={paper.index} className={cn(
              'flex items-center gap-4 px-6 py-3',
              !paper.canUpdate && 'opacity-60',
            )}>
              <div className="w-10 shrink-0 text-xs font-mono font-semibold text-slate-600">{paper.index}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-700 truncate">{paper.name || paper.index}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {paper.reasons.map((r, i) => (
                    <span key={i} className="text-xs text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{r}</span>
                  ))}
                </div>
              </div>
              <PaperStatusBadge status={paper.review_status} />
              <div className="w-24 shrink-0 text-right">
                {paper.canUpdate ? (
                  updatingPapers.includes(paper.index) ? (
                    <span className="inline-flex items-center gap-1 text-xs text-brand-500">
                      <RefreshCw size={11} className="animate-spin" />
                      更新中…
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-600 font-medium">✓ 可更新</span>
                  )
                ) : (
                  <div className="flex items-center justify-end gap-1 text-xs text-slate-400">
                    <Lock size={10} />
                    锁定
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {affected.length === 0 && changedCount === 0 && (
        <div className="py-6 text-center text-slate-400 text-sm">
          所有材料均已同步，无需更新底稿
        </div>
      )}

      {/* Action bar */}
      {(affected.length > 0 || updateResult) && (
        <div className="flex items-center justify-between gap-4 px-6 py-4 bg-slate-50 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            {updatableCount > 0
              ? `已审核 / 已签字的底稿不会被更新（共 ${affected.filter(p => !p.canUpdate).length} 张锁定）`
              : '所有受影响底稿均已锁定，无法自动更新'}
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onGoToWorkbench}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 rounded-md hover:bg-slate-200 transition-colors"
            >
              前往底稿工作台
              <ChevronRight size={12} />
            </button>
            {updatableCount > 0 && (
              <Button
                size="sm"
                onClick={onUpdate}
                disabled={isUpdating || changedCount === 0}
              >
                {isUpdating ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    更新中…
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    更新 {updatableCount} 张底稿
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useMemo, useRef, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  FileCheck2, Upload, FileText, FileSpreadsheet, FileType2, X, Play,
  AlertTriangle, AlertCircle, Info, CircleCheck, Trash2, ListChecks,
  RotateCcw, Link2, Loader2, Download, Layers3,
  FolderOpen, ChevronDown, ChevronRight, FileDigit,
  Brain, Terminal, Building2, MessageSquare,
  Clock, FileDown, Pause, BellRing,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea, Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { zh } from '@/locales/zh'
import {
  PENGSHENG_REVIEW, PENGSHENG_PROMPT, PENGSHENG_FOLDER, PENGSHENG_FOLDER_FILES,
  PENGSHENG_VERDICT, type ReviewVerdict,
} from '@/lib/pengsheng-review'
import type {
  ReportReview as TReportReview, ReviewFinding, ReviewSeverity,
  SourceRef, FindingStatus,
  ReviewProcedure, FindingGroup,
} from '@/lib/types'

// ── severity 视觉映射 ─────────────────────────────────────────
const SEV: Record<ReviewSeverity, { label: string; tone: any; icon: any; dot: string; ring: string; text: string }> = {
  high:   { label: '高', tone: 'rose',  icon: AlertTriangle, dot: 'bg-rose-500',    ring: 'border-l-rose-400',    text: 'text-rose-500' },
  medium: { label: '中', tone: 'amber', icon: AlertCircle,   dot: 'bg-amber-500',   ring: 'border-l-amber-400',   text: 'text-amber-500' },
  low:    { label: '低', tone: 'sky',   icon: Info,          dot: 'bg-sky-500',     ring: 'border-l-sky-400',     text: 'text-sky-500' },
  info:   { label: '提示', tone: 'green', icon: CircleCheck,  dot: 'bg-emerald-500', ring: 'border-l-emerald-400', text: 'text-emerald-500' },
}

function fileIcon(name: string) {
  const n = name.toLowerCase()
  if (n.endsWith('.xlsx') || n.endsWith('.xlsm') || n.endsWith('.xls')) return FileSpreadsheet
  if (n.endsWith('.md') || n.endsWith('.txt')) return FileType2
  return FileText
}
function kindLabel(kind: string) {
  return { word: 'Word', excel: 'Excel', markdown: '文本', unknown: '未知' }[kind] || kind
}

// ── 复核维度（5 个大维度）───────────────────────────────────────
const REVIEW_DIMENSIONS = [
  '数据真值与勾稽复核',
  '列报与附注披露复核',
  '合并范围与工商信息复核',
  '报告要素与执业资质复核',
  '业务合理性与重大风险复核',
]
function demoFilesForSlot(slot: MaterialSlot) {
  return PENGSHENG_FOLDER_FILES.filter((f) => f.slot === slot)
}
type DemoMaterialEntry = (typeof PENGSHENG_FOLDER_FILES)[number]
function demoSummaryForSlot(slot: MaterialSlot) {
  const items = demoFilesForSlot(slot)
  const folderCount = items.filter((x) => x.isFolder).length
  const fileCount = items.reduce((sum, x) => sum + (x.isFolder ? (x.fileCount || 0) : 1), 0)
  return { items, folderCount, fileCount }
}

type MaterialSlot = 'workingPapers' | 'tb' | 'statements' | 'notes' | 'reportPdf'
const MATERIAL_SLOTS: Array<{
  key: MaterialSlot
  title: string
  multi?: boolean
  allowFolder?: boolean
  accepts: string
  demoCount: number
}> = [
  { key: 'reportPdf', title: '审计报告（最终版 PDF）', accepts: '.pdf', demoCount: 1, allowFolder: true },
  { key: 'notes', title: '财务报表附注', accepts: '.docx,.doc,.pdf,.xlsx,.xls', demoCount: 1, allowFolder: true },
  { key: 'statements', title: '财务报表', accepts: '.xlsx,.xlsm,.xls,.pdf,.docx,.doc', demoCount: 1, allowFolder: true },
  { key: 'tb', title: '试算平衡表', accepts: '.xlsx,.xlsm,.xls,.csv,.zip', demoCount: 3, multi: true, allowFolder: true },
  { key: 'workingPapers', title: '底稿', accepts: '.xlsx,.xlsm,.xls,.docx,.doc,.pdf,.zip', demoCount: 12, multi: true, allowFolder: true },
]
const EMPTY_MATERIALS: Record<MaterialSlot, File[]> = {
  workingPapers: [],
  tb: [],
  statements: [],
  notes: [],
  reportPdf: [],
}
const PROCESS_STEPS = [
  '材料识别与校验',
  '数据清洗入库',
  '底稿一致性检查',
  '勾稽检查',
  '报告内容检查',
  '附注披露与会计政策检查',
  '工商与披露一致性检查',
  '生成复核结果与批注文件',
]
const COMPLETION_KPIS = [
  { label: '核对项', value: '508', tone: 'text-slate-800' },
  { label: '通过', value: '460', tone: 'text-emerald-600' },
  { label: '异常', value: '33', tone: 'text-rose-600' },
  { label: '待人工确认', value: '15', tone: 'text-amber-600' },
  { label: '总体结论', value: '不通过', tone: 'text-slate-800' },
]

// ── 运行中 · 实时活动流：模拟 SSE 事件序列（复核案例 丙/丁公司）──
type StreamKind = 'asst' | 'tool' | 'think' | 'qcc'
interface StreamEvent { kind: StreamKind; label: string; text: string }
interface DemoTask {
  id: string
  title: string
  status: 'running' | 'completed'
  submittedAt: string
  completedAt?: string
  unread?: boolean
}
interface ResultCenterTask {
  id: string
  type: 'report-review' | 'bank-recon' | 'detail-test'
  title: string
  subject: string
  status: 'running' | 'completed'
  submittedAt: string
  completedAt?: string
  summary: string
  metrics: Array<{ label: string; value: string }>
}

const STATIC_CENTER_TASKS: ResultCenterTask[] = [
  {
    id: 'bank-recon-demo',
    type: 'bank-recon',
    title: '银行流水双向核对',
    subject: '乙公司（服饰制造） · 2025',
    status: 'completed',
    submittedAt: '2026-07-05 16:10:22',
    completedAt: '2026-07-05 16:16:05',
    summary: '已完成银行流水与账面双向核对，生成异常清单与待人工确认事项。',
    metrics: [
      { label: '核对项', value: '184' },
      { label: '异常', value: '9' },
      { label: '待人工确认', value: '3' },
    ],
  },
  {
    id: 'detail-test-demo',
    type: 'detail-test',
    title: '细节测试',
    subject: '甲公司（母公司） · 合同抽测',
    status: 'completed',
    submittedAt: '2026-07-05 18:42:10',
    completedAt: '2026-07-05 18:55:41',
    summary: '已完成明细账到合同抽测，输出抽样结果、异常点与底稿回填文件。',
    metrics: [
      { label: '抽样笔数', value: '25' },
      { label: '异常', value: '4' },
      { label: '待确认', value: '2' },
    ],
  },
]
const STREAM_META: Record<StreamKind, { icon: any; tag: string; ring: string; chip: string; iconColor: string }> = {
  asst:  { icon: MessageSquare, tag: '回复',    ring: 'border-l-brand-400',   chip: 'bg-brand-50 text-brand-700',     iconColor: 'text-brand-500' },
  tool:  { icon: Terminal,      tag: '工具',    ring: 'border-l-slate-400',   chip: 'bg-slate-100 text-slate-700',    iconColor: 'text-slate-500' },
  think: { icon: Brain,         tag: '思考',    ring: 'border-l-violet-400',  chip: 'bg-violet-50 text-violet-700',   iconColor: 'text-violet-500' },
  qcc:   { icon: Building2,     tag: '企查查',  ring: 'border-l-emerald-400', chip: 'bg-emerald-50 text-emerald-700', iconColor: 'text-emerald-600' },
}
const CASE_STREAM: StreamEvent[] = [
  { kind: 'asst',  label: '回复',         text: '已归集审计报告、附注、财务报表、试算平衡表与底稿，开始执行甲公司 2025 一致性勾稽复核。' },
  { kind: 'tool',  label: '工具 bash',    text: 'load_review_bundle.py · 载入底稿 294 条、财报 135 条、附注 58 条及表间勾稽规则。' },
  { kind: 'think', label: '思考',         text: '先做底稿↔单体TB 全量比对：合同资产、其他收益、使用权资产等出现大额差异，优先列入 fail。' },
  { kind: 'tool',  label: '工具 bash',    text: 'tie_check.py · 按 entity_code + 归一名执行底稿↔单体TB、大合并TB↔财报、财报↔附注、表内 / 表间勾稽。' },
  { kind: 'think', label: '思考',         text: '财报↔附注 58 项全部通过；表内勾稽 14 项全部通过，主要问题集中在底稿↔单体TB 与少量待人工项。' },
  { kind: 'qcc',   label: '企查查',       text: 'industry_profile · 识别甲公司为软件信息安全类主体，关注研发资本化、收入确认与持续经营风险。' },
  { kind: 'qcc',   label: '企查查',       text: 'risk_signal_scan · 识别 ST、亏损、被执行、股权质押等公开风险信号，纳入重点复核关注。' },
  { kind: 'think', label: '思考',         text: '大合并TB↔财报存在 4 项待人工确认：负债权益类项目当前无比对源，不直接判差异。' },
  { kind: 'tool',  label: '工具 bash',    text: 'rollup_review.py · 汇总 508 个核对项：460 通过、33 异常、15 待人工确认。' },
  { kind: 'think', label: '思考',         text: '表间勾稽还有 3 项待人工：主要涉及未分配利润、现金及现金等价物桥接与上期来源缺失。' },
  { kind: 'qcc',   label: '企查查',       text: 'focus_builder · 生成持续经营、收入确认、ECL、研发资本化、合并范围、担保与诉讼等 8 项重点风险关注。' },
  { kind: 'asst',  label: '回复',         text: '复核完成：共发现 33 项异常、15 项待人工确认，当前结论为“不通过”，可查看复核结果并下载批注文件。' },
]
const STREAM_STEP_MS = 620
const STREAM_START_MS = 450

// 当前已播放事件数 → 维度执行进度（0..5），近似把活动流映射到 5 个大维度
function dimsCompletedFor(playedEvents: number): number {
  if (playedEvents <= 0) return 0
  return Math.min(REVIEW_DIMENSIONS.length, Math.round((playedEvents / CASE_STREAM.length) * REVIEW_DIMENSIONS.length))
}

// 默认展示的真实复核案例：复核案例（丙公司 / 丁公司，2024 & 2025，单体+合并）
const CASE_REVIEW: TReportReview = PENGSHENG_REVIEW

// 该案例的「复核意见书原版」HTML（A–G 七段版式，public/cases/ 下，按原样式渲染）
const PENGSHENG_OPINION_URL = '/cases/report-review-package-a/index.html'

export default function ReportReview() {
  const { reviewId } = useParams()
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()

  // —— 上传 / 复核要求 状态 ——
  const [files, setFiles] = useState<File[]>([])
  const [instruction, setInstruction] = useState(PENGSHENG_PROMPT)
  const [instructionFile, setInstructionFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const reportInputRef = useRef<HTMLInputElement>(null)
  const instrInputRef = useRef<HTMLInputElement>(null)

  // —— 文件夹地址输入（主输入方式：给一个文件夹即可复核整包报告 + TB）——
  const [folderPath, setFolderPath] = useState(PENGSHENG_FOLDER)
  const [scanned, setScanned] = useState(true) // 演示：默认已识别复核案例文件夹
  const [showUpload, setShowUpload] = useState(false) // 折叠的"或上传文件"入口

  // —— 运行流程：新建(idle) → 运行中·实时活动流(running) → 复核结果(done) ——
  const [runPhase, setRunPhase] = useState<'idle' | 'running' | 'done'>('idle')
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([])
  const [streamElapsed, setStreamElapsed] = useState(0)
  const [streamPaused, setStreamPaused] = useState(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const demoRunning = runPhase === 'running' // 兼容旧引用
  const [showResultPage, setShowResultPage] = useState(false)
  const [showDownloadPanel, setShowDownloadPanel] = useState(false)
  const [showCompletionToast, setShowCompletionToast] = useState(false)
  const [demoTask, setDemoTask] = useState<DemoTask | null>(null)
  const [selectedCenterTaskId, setSelectedCenterTaskId] = useState<string>('report-review-demo')
  const [reportTaskTab, setReportTaskTab] = useState<'task' | 'chat'>('task')
  const [uploadedMaterials, setUploadedMaterials] = useState<Record<MaterialSlot, File[]>>(EMPTY_MATERIALS)
  const [expandedMaterialDetails, setExpandedMaterialDetails] = useState<Record<MaterialSlot, boolean>>({
    reportPdf: false, notes: false, statements: false, tb: false, workingPapers: false,
  })
  const [expandedDemoFolders, setExpandedDemoFolders] = useState<Record<string, boolean>>({})
  const materialInputRefs = useRef<Record<MaterialSlot, HTMLInputElement | null>>({
    workingPapers: null, tb: null, statements: null, notes: null, reportPdf: null,
  })

  // —— 复核维度勾选（②新建：来自代理 AGENTS.md，默认全选）——
  const [selectedDims, setSelectedDims] = useState<boolean[]>(() => REVIEW_DIMENSIONS.map(() => true))
  const [reviewSubject, setReviewSubject] = useState('甲公司（母公司）')
  function toggleDim(i: number) {
    setSelectedDims((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
  }
  function setMaterialRef(slot: MaterialSlot, el: HTMLInputElement | null) {
    materialInputRefs.current[slot] = el
  }
  function addMaterialFiles(slot: MaterialSlot, list: FileList | null) {
    if (!list) return
    const incoming = Array.from(list).filter((f) => !f.name.startsWith('~$'))
    setUploadedMaterials((prev) => {
      const seen = new Set(prev[slot].map((f) => f.name + f.size))
      return { ...prev, [slot]: [...prev[slot], ...incoming.filter((f) => !seen.has(f.name + f.size))] }
    })
  }
  function openFolderPicker(slot: MaterialSlot) {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
    input.onchange = () => addMaterialFiles(slot, input.files)
    input.click()
  }
  function removeMaterialFile(slot: MaterialSlot, idx: number) {
    setUploadedMaterials((prev) => ({ ...prev, [slot]: prev[slot].filter((_, i) => i !== idx) }))
  }
  function toggleMaterialDetails(slot: MaterialSlot) {
    setExpandedMaterialDetails((prev) => ({ ...prev, [slot]: !prev[slot] }))
  }
  function toggleDemoFolder(key: string) {
    setExpandedDemoFolders((prev) => ({ ...prev, [key]: !prev[key] }))
  }
  function switchLeftNav(next: 'report-review' | 'result-center') {
    const params = new URLSearchParams(searchParams)
    if (next === 'result-center') params.set('view', 'result-center')
    else params.delete('view')
    setSearchParams(params, { replace: true })
  }
  const materialCounts = useMemo(
    () => Object.fromEntries(MATERIAL_SLOTS.map((slot) => [slot.key, uploadedMaterials[slot.key].length || slot.demoCount])) as Record<MaterialSlot, number>,
    [uploadedMaterials],
  )
  const hasMaterialReady = MATERIAL_SLOTS.every((slot) => materialCounts[slot.key] > 0)
  const totalMaterialCount = MATERIAL_SLOTS.reduce((sum, slot) => sum + materialCounts[slot.key], 0)
  function resetReviewFlow(clearMaterials = false) {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    setRunPhase('idle')
    setShowResultPage(false)
    setShowDownloadPanel(false)
    setShowCompletionToast(false)
    setStreamEvents([])
    setStreamElapsed(0)
    setStreamPaused(false)
    if (clearMaterials) setUploadedMaterials(EMPTY_MATERIALS)
  }
  function openResultCenter() {
    switchLeftNav('result-center')
    setSelectedCenterTaskId('report-review-demo')
    setShowCompletionToast(false)
    setDemoTask((prev) => (prev ? { ...prev, unread: false } : prev))
  }
  function openReportReviewResult() {
    switchLeftNav('report-review')
    setRunPhase('done')
    setShowResultPage(true)
    setDocView(true)
    setShowCompletionToast(false)
    setDemoTask((prev) => (prev ? { ...prev, unread: false } : prev))
  }
  function downloadDemoAsset(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [])
  // 启动「运行中·实时活动流」演示：逐条推送事件，结束后切到结果页
  function startCaseReview() {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    if (intervalRef.current) clearInterval(intervalRef.current)
    setActiveId(null); nav('/report-review'); setSelectedFinding(null); setDocView(true); switchLeftNav('report-review'); setSelectedCenterTaskId('report-review-demo')
    setStreamEvents([]); setStreamElapsed(0); setStreamPaused(false); setShowResultPage(false); setShowDownloadPanel(false); setShowCompletionToast(false)
    setDemoTask({
      id: `demo-${Date.now()}`,
      title: `${reviewSubject} 2025 报告复核`,
      status: 'running',
      submittedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      unread: false,
    })
    setRunPhase('running')
    const t0 = Date.now()
    const tick = setInterval(() => setStreamElapsed(Math.floor((Date.now() - t0) / 1000)), 250)
    intervalRef.current = tick
    CASE_STREAM.forEach((ev, i) => {
      const id = setTimeout(() => setStreamEvents((prev) => [...prev, ev]), STREAM_START_MS + i * STREAM_STEP_MS)
      timersRef.current.push(id)
    })
    const totalMs = STREAM_START_MS + CASE_STREAM.length * STREAM_STEP_MS + 800
    const done = setTimeout(() => {
      clearInterval(tick)
      intervalRef.current = null
      const completedAt = new Date().toLocaleString('zh-CN', { hour12: false })
      setRunPhase('done')
      setShowCompletionToast(true)
      setDemoTask((prev) => prev ? { ...prev, status: 'completed', completedAt, unread: true } : prev)
    }, totalMs)
    timersRef.current.push(done)
  }

  // —— 选中的复核 / 定位状态 ——
  const [activeId, setActiveId] = useState<number | null>(reviewId ? Number(reviewId) : null)
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null)
  // —— 案例演示：默认以「复核意见书原版」(A–G 七段 HTML) 呈现，可切换结构化视图 ——
  const [docView, setDocView] = useState(true)

  // —— 默认复核清单（预填）——
  const { data: checklistData } = useQuery({ queryKey: ['review-checklist'], queryFn: api.reviewChecklist })
  useEffect(() => {
    // 已用复核案例 Prompt 预填；仅当用户清空后端清单覆盖时才回填（保持演示稳定，不覆盖复核案例 Prompt）
    if (checklistData?.checklist && !instruction) setInstruction(checklistData.checklist)
  }, [checklistData])

  // —— 历史复核 ——
  const { data: reviews = [] } = useQuery({ queryKey: ['reviews'], queryFn: api.listReviews })

  // —— 当前复核详情 ——
  const { data: review } = useQuery({
    queryKey: ['review', activeId],
    queryFn: () => api.getReview(activeId as number),
    enabled: !!activeId,
  })

  // —— 执行复核 ——
  const run = useMutation({
    mutationFn: () => api.runReview({ files, instruction, instructionFile, title: '' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['reviews'] })
      setActiveId(res.id)
      nav(`/report-review/${res.id}`)
      setSelectedFinding(null)
    },
  })

  const del = useMutation({
    mutationFn: (id: number) => api.deleteReview(id),
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: ['reviews'] })
      if (activeId === id) { setActiveId(null); nav('/report-review') }
    },
  })

  const setStatus = useMutation({
    mutationFn: ({ fid, status }: { fid: string; status: FindingStatus }) =>
      api.setFindingStatus(activeId as number, fid, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review', activeId] }),
  })

  // —— 文件操作 ——
  function addFiles(list: FileList | null) {
    if (!list) return
    const incoming = Array.from(list).filter((f) => !f.name.startsWith('~$'))
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size))
      return [...prev, ...incoming.filter((f) => !seen.has(f.name + f.size))]
    })
  }
  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  // —— 点击某条意见 → 定位到原文 ——
  function locate(_ref: SourceRef, findingId: string) {
    setSelectedFinding(findingId)
  }

  const displayReview = review ?? CASE_REVIEW
  const isCaseDemo = displayReview === CASE_REVIEW
  const leftNav: 'report-review' | 'result-center' = searchParams.get('view') === 'result-center' ? 'result-center' : 'report-review'
  const centerTasks = useMemo<ResultCenterTask[]>(() => {
    const reportTask: ResultCenterTask = {
      id: 'report-review-demo',
      type: 'report-review',
      title: '报告复核',
      subject: `${reviewSubject} · 2025`,
      status: demoTask?.status || 'completed',
      submittedAt: demoTask?.submittedAt || '2026-07-06 10:48:12',
      completedAt: demoTask?.completedAt,
      summary: demoTask?.status === 'running'
        ? '任务已提交，正在后台复核。完成后可在结果中心进入结果页。'
        : '复核已完成，可查看复核结果并下载批注文件。',
      metrics: [
        { label: '核对项', value: '508' },
        { label: '异常', value: '33' },
        { label: '待人工确认', value: '15' },
      ],
    }
    return [reportTask, ...STATIC_CENTER_TASKS]
  }, [demoTask, reviewSubject])
  const selectedCenterTask = centerTasks.find((t) => t.id === selectedCenterTaskId) || centerTasks[0]
  return (
    <div className="h-full bg-slate-50/40">
      {leftNav === 'result-center' ? (
        <ResultCenterPanel
          tasks={centerTasks}
          selectedTaskId={selectedCenterTaskId}
          onSelectTask={(id) => {
            setSelectedCenterTaskId(id)
            if (id === 'report-review-demo') setDemoTask((prev) => (prev ? { ...prev, unread: false } : prev))
          }}
          onDownloadAnnotated={() => setShowDownloadPanel(true)}
          review={displayReview}
          selectedFinding={selectedFinding}
          onLocate={locate}
          onSetStatus={(fid, status) => { if (activeId) setStatus.mutate({ fid, status }) }}
          verdict={displayReview === CASE_REVIEW ? PENGSHENG_VERDICT : null}
          docView={docView}
          onSetDocView={setDocView}
        />
      ) : (
        <div className="h-full flex bg-slate-50/40">
          <ReportReviewSidebarPanel
            reviewSubject={reviewSubject}
            setReviewSubject={setReviewSubject}
            materialCounts={materialCounts}
            expandedMaterialDetails={expandedMaterialDetails}
            toggleMaterialDetails={toggleMaterialDetails}
            uploadedMaterials={uploadedMaterials}
            removeMaterialFile={removeMaterialFile}
            setMaterialRef={setMaterialRef}
            addMaterialFiles={addMaterialFiles}
            openFolderPicker={openFolderPicker}
            expandedDemoFolders={expandedDemoFolders}
            toggleDemoFolder={toggleDemoFolder}
            selectedDims={selectedDims}
            toggleDim={toggleDim}
            hasMaterialReady={hasMaterialReady}
            demoRunning={demoRunning}
            runError={run.isError ? (run.error as Error).message : null}
            startCaseReview={startCaseReview}
            reviews={reviews}
            activeId={activeId}
            setActiveId={setActiveId}
            del={del}
            nav={nav}
            setSelectedFinding={setSelectedFinding}
          />
          <section className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {runPhase === 'done' && showResultPage && isCaseDemo && (
              <div className="shrink-0 flex items-center gap-2 px-7 py-2 border-b border-slate-200 bg-white">
                <span className="text-[12px] text-slate-500">展示方式</span>
                <div className="flex rounded-md border border-slate-200 overflow-hidden text-[12px] font-medium">
                  <button
                    onClick={() => setDocView(true)}
                    className={cn('px-3 py-1 transition-colors', docView ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
                  >
                    复核意见书原版
                  </button>
                  <button
                    onClick={() => setDocView(false)}
                    className={cn('px-3 py-1 transition-colors border-l border-slate-200', !docView ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
                  >
                    结构化视图
                  </button>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <a
                    href={PENGSHENG_OPINION_URL}
                    download="审计报告复核意见书_复核案例.html"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50"
                    title="下载复核意见书 HTML"
                  >
                    <FileDown size={12} /> 下载 HTML
                  </a>
                  <button
                    onClick={() => window.open(PENGSHENG_OPINION_URL, '_blank')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50"
                    title="在新窗口打开后可打印 / 另存为 PDF"
                  >
                    <Download size={12} /> 导出 PDF
                  </button>
                  <button
                    onClick={() => resetReviewFlow(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50"
                    title="重新上传材料并复核"
                  >
                    <RotateCcw size={12} /> 重新复核
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {runPhase === 'running' ? (
                <ProcessingPanel
                  subject={reviewSubject}
                  events={streamEvents}
                  elapsed={streamElapsed}
                  progress={Math.min(100, Math.max(8, Math.round((streamEvents.length / CASE_STREAM.length) * 100)))}
                />
              ) : runPhase === 'done' && !showResultPage ? (
                <CompletedPanel
                  onViewResult={openResultCenter}
                  onDownloadAnnotated={() => setShowDownloadPanel(true)}
                  onDownloadReport={() => window.open(PENGSHENG_OPINION_URL, '_blank')}
                  onRestart={() => resetReviewFlow(true)}
                />
              ) : run.isPending ? (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <EmptyState hasFiles={hasMaterialReady} running={true} />
                </div>
              ) : (runPhase === 'done' && showResultPage && isCaseDemo && docView) ? (
                <iframe
                  src={PENGSHENG_OPINION_URL}
                  title="审计报告复核意见书"
                  className="w-full flex-1 border-0 bg-white"
                />
              ) : runPhase === 'done' && showResultPage ? (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <ResultPanel
                    review={displayReview}
                    selectedFinding={selectedFinding}
                    onLocate={locate}
                    onSetStatus={(fid, status) => { if (activeId) setStatus.mutate({ fid, status }) }}
                    verdict={displayReview === CASE_REVIEW ? PENGSHENG_VERDICT : null}
                  />
                </div>
              ) : (
                <UploadIntroPanel totalMaterialCount={totalMaterialCount} />
              )}
            </div>
          </section>
        </div>
      )}

      {showCompletionToast && demoTask?.status === 'completed' && (
        <div className="fixed top-5 right-5 z-40 w-[320px] rounded-xl border border-emerald-200 bg-white shadow-lg p-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-emerald-50 grid place-items-center shrink-0">
              <BellRing size={16} className="text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">复核结束</div>
              <div className="mt-1 text-[12px] text-slate-600 leading-relaxed">
                {demoTask.title} 已完成。可从左侧「结果中心」进入查看复核结果并下载批注文件。
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={openResultCenter}
                  className="inline-flex items-center gap-1 rounded-md bg-brand-600 hover:bg-brand-700 text-white px-2.5 py-1 text-[11px]"
                >
                  去结果中心查看
                </button>
                <button
                  type="button"
                  onClick={() => setShowCompletionToast(false)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  稍后再看
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDownloadPanel && (
        <DownloadPanel
          onClose={() => setShowDownloadPanel(false)}
          onDownload={(kind) => {
            const label = {
              all: '全部批注文件',
              workingPapers: '底稿批注文件',
              report: '报告批注文件',
              notes: '附注批注文件',
              html: '复核结果 HTML',
              bundle: '完整交付包',
            }[kind]
            if (kind === 'html') {
              window.open(PENGSHENG_OPINION_URL, '_blank')
              return
            }
            downloadDemoAsset(`${label}.txt`, `演示下载：${label}\n项目：${reviewSubject}\n时间：${new Date().toLocaleString('zh-CN', { hour12: false })}\n说明：当前为 UI 演示版下载占位文件。`)
          }}
        />
      )}

    </div>
  )
}

// ── 空状态 ────────────────────────────────────────────────────
function EmptyState({ hasFiles, running }: { hasFiles: boolean; running: boolean }) {
  return (
    <div className="h-full grid place-items-center p-10">
      <div className="text-center max-w-sm">
        <div className="h-14 w-14 rounded-2xl bg-slate-100 grid place-items-center mx-auto">
          {running ? <Loader2 size={26} className="text-brand-500 animate-spin" /> : <FileCheck2 size={26} className="text-slate-400" />}
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-700">
          {running ? '正在复核报告…' : '报告复核工作台'}
        </h2>
        <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
          {running
            ? '正在按复核提示词逐项核对：五方勾稽、合并范围与资质核验、业务风险分析…'
            : hasFiles
              ? '已识别文件夹/文件，点击左下「复核该文件夹」开始。'
              : '在左侧输入一个文件夹地址（内含审计报告与 TB），填写复核要求，即可一键复核。复核意见会按高/中/低分级，并附复核程序与边界。'}
        </p>
      </div>
    </div>
  )
}

// ── 页面二：复核处理中 ───────────────────────────────────────────
function ProcessingPanel({ subject, events, elapsed, progress }: {
  subject: string
  events: StreamEvent[]
  elapsed: number
  progress: number
}) {
  const currentStep = Math.min(PROCESS_STEPS.length, Math.max(1, Math.ceil((events.length / CASE_STREAM.length) * PROCESS_STEPS.length)))
  const tips = events.slice(-2)

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/40 p-8">
      <div className="max-w-3xl mx-auto rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] px-2.5 py-1">
          <Loader2 size={12} className="animate-spin" /> 正在复核，请稍候…
        </div>
        <h2 className="mt-4 text-xl font-semibold text-slate-900">{subject} · 报告复核处理中</h2>
        <div className="mt-2 text-[12px] text-slate-500 inline-flex items-center gap-1"><Clock size={12} /> 已 {elapsed}s</div>

        <div className="mt-5">
          <div className="text-[12px] font-medium text-slate-700 mb-1.5">整体进度</div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 text-[11px] text-slate-500">当前步骤：{PROCESS_STEPS[currentStep - 1]}（{progress}%）</div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-sm font-semibold text-slate-800 mb-3">处理步骤</div>
          <div className="space-y-2.5">
            {PROCESS_STEPS.map((step, i) => {
              const idx = i + 1
              const done = idx < currentStep
              const active = idx === currentStep
              return (
                <div key={step} className="flex items-start gap-3">
                  <div className={cn(
                    'h-6 w-6 rounded-full grid place-items-center text-[11px] font-semibold shrink-0',
                    done ? 'bg-emerald-500 text-white' : active ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500',
                  )}>
                    {done ? '✓' : idx}
                  </div>
                  <div className="text-[12px] text-slate-700">
                    <div className="font-medium">{step}</div>
                    {done ? <div className="text-[10px] text-slate-400">已完成</div> : active ? <div className="text-[10px] text-amber-600">进行中</div> : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-sm font-semibold text-slate-800 mb-2">系统提示</div>
          <div className="space-y-1.5">
            {tips.map((tip, i) => (
              <div key={i} className="text-[11px] text-slate-500">- {tip.text}</div>
            ))}
            {tips.length === 0 && (
              <>
                <div className="text-[11px] text-slate-500">- 正在核对大合并 TB 与财务报表</div>
                <div className="text-[11px] text-slate-500">- 正在生成待人工确认事项</div>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-[12px] text-slate-600 bg-white">
            后台运行，稍后查看结果
          </button>
        </div>
      </div>
    </div>
  )
}

function CompletedPanel({ onViewResult, onDownloadAnnotated, onDownloadReport, onRestart }: {
  onViewResult: () => void
  onDownloadAnnotated: () => void
  onDownloadReport: () => void
  onRestart: () => void
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/40 p-8">
      <div className="max-w-3xl mx-auto rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] px-2.5 py-1">
          复核结束
        </div>
        <h2 className="mt-4 text-xl font-semibold text-slate-900">可查看复核结果并下载有批注的文件</h2>
        <p className="mt-2 text-[12px] text-slate-500">结果也已同步到左侧「结果中心」。你现在可以直接进入结果页，也可以稍后从结果中心回来查看。</p>
        <div className="mt-5 grid grid-cols-2 xl:grid-cols-5 gap-3">
          {COMPLETION_KPIS.map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <div className={cn('text-xl font-semibold', kpi.tone)}>{kpi.value}</div>
              <div className="mt-1 text-[11px] text-slate-500">{kpi.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={onViewResult} className="inline-flex items-center gap-1 rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 text-[12px] font-medium">
            查看复核结果
          </button>
          <button onClick={onDownloadAnnotated} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50">
            下载有批注的文件
          </button>
          <button onClick={onDownloadReport} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50">
            下载复核报告
          </button>
          <button onClick={onRestart} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50">
            重新上传材料并复核
          </button>
        </div>
      </div>
    </div>
  )
}

function ReportReviewSidebarPanel({
  reviewSubject, setReviewSubject, materialCounts, expandedMaterialDetails, toggleMaterialDetails,
  uploadedMaterials, removeMaterialFile, setMaterialRef, addMaterialFiles, openFolderPicker,
  expandedDemoFolders, toggleDemoFolder, selectedDims, toggleDim, hasMaterialReady, demoRunning,
  runError, startCaseReview, reviews, activeId, setActiveId, del, nav, setSelectedFinding,
}: {
  reviewSubject: string
  setReviewSubject: (v: string) => void
  materialCounts: Record<MaterialSlot, number>
  expandedMaterialDetails: Record<MaterialSlot, boolean>
  toggleMaterialDetails: (slot: MaterialSlot) => void
  uploadedMaterials: Record<MaterialSlot, File[]>
  removeMaterialFile: (slot: MaterialSlot, idx: number) => void
  setMaterialRef: (slot: MaterialSlot, el: HTMLInputElement | null) => void
  addMaterialFiles: (slot: MaterialSlot, list: FileList | null) => void
  openFolderPicker: (slot: MaterialSlot) => void
  expandedDemoFolders: Record<string, boolean>
  toggleDemoFolder: (key: string) => void
  selectedDims: boolean[]
  toggleDim: (i: number) => void
  hasMaterialReady: boolean
  demoRunning: boolean
  runError: string | null
  startCaseReview: () => void
  reviews: any[]
  activeId: number | null
  setActiveId: (id: number | null) => void
  del: any
  nav: any
  setSelectedFinding: (id: string | null) => void
}) {
  return (
    <aside className="w-[340px] shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-y-auto">
      <div className="px-5 pt-5 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-brand-50 grid place-items-center">
            <FileCheck2 size={18} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">{zh.nav.reportReview}</h1>
            <p className="text-[11px] text-slate-500">上传材料 → 一键复核 → 等待结果</p>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
            <Layers3 size={13} /> 元信息
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-14 shrink-0">项目</span>
              <Input value="复核案例 2024–2025 报告复核" readOnly className="text-[11px]" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-14 shrink-0">被审计单位</span>
              <Input value={reviewSubject} onChange={(e) => setReviewSubject(e.target.value)} className="text-[11px]" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-14 shrink-0">报告年度</span>
              <Badge tone="neutral" className="!h-5">2025</Badge>
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
            <Upload size={13} /> 上传复核材料
          </div>
          <div className="space-y-2">
            {MATERIAL_SLOTS.map((slot) => {
              const demo = demoSummaryForSlot(slot.key)
              const detailOpen = expandedMaterialDetails[slot.key]
              const showingUploaded = uploadedMaterials[slot.key].length > 0
              return (
                <div key={slot.key} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <div className="text-[12px] font-medium text-slate-800">{slot.title}</div>
                      <div className="text-[10px] text-slate-400">
                        {slot.key === 'workingPapers' && !showingUploaded
                          ? `已上传：${demo.folderCount} 个文件夹 / ${demo.fileCount} 个文件`
                          : `已上传：${materialCounts[slot.key]} 个文件`}
                      </div>
                    </div>
                    {(showingUploaded || demo.items.length > 0) && (
                      <button type="button" onClick={() => toggleMaterialDetails(slot.key)} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800">
                        {detailOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {detailOpen ? '收起明细' : '查看明细'}
                      </button>
                    )}
                  </div>
                  <input
                    id={`report-material-${slot.key}`}
                    ref={(el) => setMaterialRef(slot.key, el)}
                    type="file"
                    multiple={slot.multi ?? false}
                    accept={slot.accepts}
                    className="hidden"
                    onChange={(e) => addMaterialFiles(slot.key, e.target.files)}
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => document.getElementById(`report-material-${slot.key}`)?.click()} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
                      <Upload size={12} /> 选择文件
                    </button>
                    {slot.allowFolder && (
                      <button type="button" onClick={() => openFolderPicker(slot.key)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
                        <FolderOpen size={12} /> 选择文件夹
                      </button>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">支持多次追加上传；文件夹模式会自动带上子文件夹内文件。</div>
                  {showingUploaded && detailOpen && (
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto pr-1">
                      {uploadedMaterials[slot.key].map((f, i) => {
                        const Ic = fileIcon(f.name)
                        return (
                          <div key={f.name + i} className="flex items-center gap-2 px-2 py-1 rounded-md bg-white border border-slate-100 text-[11px]">
                            <Ic size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate flex-1 text-slate-700">{f.name}</span>
                            <button onClick={() => removeMaterialFile(slot.key, i)} className="text-slate-400 hover:text-rose-500 shrink-0"><X size={12} /></button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {!showingUploaded && detailOpen && demo.items.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
                      {demo.items.map((f, i) => {
                        const Ic = f.kind === 'excel' ? FileSpreadsheet : f.kind === 'pdf' ? FileDigit : FileText
                        if (f.isFolder) {
                          const folderOpen = !!expandedDemoFolders[`${slot.key}:${f.name}`]
                          const previewChildren = folderOpen ? (f.children || []) : (f.children || []).slice(0, 5)
                          return (
                            <div key={f.name + i} className="rounded-md bg-white border border-slate-100 text-[10.5px]">
                              <button type="button" onClick={() => toggleDemoFolder(`${slot.key}:${f.name}`)} className="w-full flex items-start gap-2 px-2 py-1.5 text-left">
                                {folderOpen ? <ChevronDown size={12} className="text-slate-400 shrink-0 mt-0.5" /> : <ChevronRight size={12} className="text-slate-400 shrink-0 mt-0.5" />}
                                <FolderOpen size={12} className="text-slate-400 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-slate-700">{f.name}</div>
                                  <div className="text-[9px] text-slate-400">{f.note}</div>
                                </div>
                              </button>
                              {folderOpen && (
                                <div className="px-7 pb-2 space-y-1">
                                  {previewChildren.map((child: string) => <div key={child} className="truncate text-[10px] text-slate-500">• {child}</div>)}
                                  {(f.children?.length || 0) > previewChildren.length && <div className="text-[9px] text-slate-400">还有 {(f.children?.length || 0) - previewChildren.length} 个文件…</div>}
                                </div>
                              )}
                            </div>
                          )
                        }
                        return (
                          <div key={f.name + i} className="flex items-start gap-2 px-2 py-1 rounded-md bg-white border border-slate-100 text-[10.5px]">
                            <Ic size={12} className="text-slate-400 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-slate-700">{f.name}</div>
                              <div className="text-[9px] text-slate-400">{f.note}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="text-xs font-medium text-slate-700 mb-2">材料预检查</div>
          <div className="space-y-1.5 text-[11px]">
            {MATERIAL_SLOTS.map((slot) => (
              <div key={slot.key} className="flex items-center gap-2 text-slate-600">
                <span className={cn('h-4 w-4 rounded-full grid place-items-center text-white text-[9px]', materialCounts[slot.key] > 0 ? 'bg-emerald-500' : 'bg-slate-300')}>
                  {materialCounts[slot.key] > 0 ? '✓' : ''}
                </span>
                <span>{slot.title}{materialCounts[slot.key] > 0 ? ' 已识别' : ' 待上传'}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
            <ListChecks size={13} /> 复核维度
          </div>
          <div className="grid grid-cols-2 gap-1">
            {REVIEW_DIMENSIONS.map((d, i) => (
              <button key={i} onClick={() => toggleDim(i)} className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10.5px] text-left transition-colors', selectedDims[i] ? 'border-brand-200 bg-brand-50/60 text-slate-700' : 'border-slate-200 bg-white text-slate-400')}>
                <span className={cn('h-3.5 w-3.5 rounded grid place-items-center shrink-0 text-[9px] text-white', selectedDims[i] ? 'bg-brand-500' : 'bg-slate-200')}>{selectedDims[i] ? '✓' : ''}</span>
                <span className="truncate">{d}</span>
              </button>
            ))}
          </div>
        </div>

        <Button variant="primary" className="w-full" disabled={!hasMaterialReady || demoRunning} onClick={startCaseReview}>
          {demoRunning ? <><Loader2 size={14} className="animate-spin" /> 复核中…</> : <><Play size={14} /> 开始复核</>}
        </Button>
        {runError && <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2 py-1.5">复核失败：{runError}</div>}
      </div>

      <div className="px-4 pb-4 mt-1">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 px-1">历史复核</div>
        {reviews.length === 0 ? (
          <div className="text-[11px] text-slate-500 px-2 py-2 rounded-md bg-amber-50 border border-amber-100">
            当前展示「复核案例」演示结果。上传新的材料后会在结果中心里形成新的任务结果。
          </div>
        ) : (
          <div className="space-y-1">
            {reviews.map((r) => (
              <button
                key={r.id}
                onClick={() => { setActiveId(r.id); nav(`/report-review/${r.id}`); setSelectedFinding(null) }}
                className={cn('w-full text-left px-2.5 py-2 rounded-md border text-xs transition-colors group', activeId === r.id ? 'border-brand-300 bg-brand-50/50' : 'border-slate-100 hover:bg-slate-50')}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-700 truncate flex-1">{r.title}</span>
                  <Trash2 size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-500 shrink-0" onClick={(e) => { e.stopPropagation(); del.mutate(r.id) }} />
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                  <span>{r.file_count} 文件</span>
                  <span>·</span>
                  <span>{r.finding_count} 条意见</span>
                  {r.high_count > 0 && <Badge tone="rose" className="!h-4 !text-[9px] !px-1.5">{r.high_count} 高</Badge>}
                  {r.demo && <span className="ml-auto text-amber-500">演示</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function UploadIntroPanel({ totalMaterialCount }: { totalMaterialCount: number }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/40 p-8">
      <div className="max-w-3xl mx-auto rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <h2 className="text-xl font-semibold text-slate-900">上传材料后，一键复核</h2>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          按左侧分类上传需要被复核的材料。系统会先做材料预检查，再开始复核；复核结束后会提示你查看结果，并下载有批注的文件。
        </p>
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] text-slate-400">材料分类</div>
            <div className="mt-1 text-lg font-semibold text-slate-800">{MATERIAL_SLOTS.length}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] text-slate-400">当前识别文件</div>
            <div className="mt-1 text-lg font-semibold text-slate-800">{totalMaterialCount}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] text-slate-400">下一步</div>
            <div className="mt-1 text-lg font-semibold text-slate-800">开始复核</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResultCenterPanel({ tasks, selectedTaskId, onSelectTask, onDownloadAnnotated, review, selectedFinding, onLocate, onSetStatus, verdict, docView, onSetDocView }: {
  tasks: ResultCenterTask[]
  selectedTaskId: string
  onSelectTask: (id: string) => void
  onDownloadAnnotated: () => void
  review: TReportReview
  selectedFinding: string | null
  onLocate: (ref: SourceRef, findingId: string) => void
  onSetStatus: (fid: string, status: FindingStatus) => void
  verdict?: ReviewVerdict | null
  docView: boolean
  onSetDocView: (v: boolean) => void
}) {
  const selected = tasks.find((t) => t.id === selectedTaskId) || tasks[0]
  return (
    <div className="flex-1 min-h-0 grid grid-cols-[320px_minmax(0,1fr)]">
      <div className="border-r border-slate-200 bg-white overflow-y-auto p-4">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">结果中心</div>
        <div className="space-y-2">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onSelectTask(task.id)}
              className={cn(
                'w-full rounded-lg border px-3 py-2.5 text-left',
                selectedTaskId === task.id ? 'border-brand-300 bg-brand-50/60' : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', task.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500')} />
                <span className="text-[12px] font-medium text-slate-800">{task.title}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">{task.subject}</div>
              <div className="mt-1 text-[10px] text-slate-400">
                {task.status === 'completed' ? `已完成 · ${task.completedAt || task.submittedAt}` : `运行中 · ${task.submittedAt}`}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-y-auto p-6 bg-slate-50/40">
        <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] border',
              selected.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200',
            )}>
              {selected.status === 'completed' ? '已完成' : '运行中'}
            </span>
            <span className="text-[12px] text-slate-500">{selected.subject}</span>
          </div>
          <h2 className="mt-4 text-xl font-semibold text-slate-900">{selected.title}</h2>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">{selected.summary}</p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {selected.metrics.map((m) => (
              <div key={m.label} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="text-lg font-semibold text-slate-800">{m.value}</div>
                <div className="mt-1 text-[11px] text-slate-500">{m.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {selected.type === 'report-review' ? (
              <>
                <button onClick={() => onSetDocView(true)} className={cn('inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] border', docView ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
                  复核意见书原版
                </button>
                <button onClick={() => onSetDocView(false)} className={cn('inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] border', !docView ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
                  结构化结果
                </button>
                {selected.status === 'completed' && (
                  <button onClick={onDownloadAnnotated} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50">
                    下载批注文件
                  </button>
                )}
              </>
            ) : (
              <button type="button" className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600">
                查看任务摘要
              </button>
            )}
          </div>
          {selected.type === 'report-review' && selected.status === 'completed' && (
            <div className="mt-6 pt-5 border-t border-slate-200">
              {docView ? (
                <iframe
                  src={PENGSHENG_OPINION_URL}
                  title="结果中心 · 审计报告复核意见书"
                  className="w-full h-[820px] border border-slate-200 rounded-xl bg-white"
                />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <ResultPanel
                    review={review}
                    selectedFinding={selectedFinding}
                    onLocate={onLocate}
                    onSetStatus={onSetStatus}
                    verdict={verdict}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DownloadPanel({ onClose, onDownload }: {
  onClose: () => void
  onDownload: (kind: 'all' | 'workingPapers' | 'report' | 'notes' | 'html' | 'bundle') => void
}) {
  const items: Array<{ kind: Parameters<typeof onDownload>[0]; label: string }> = [
    { kind: 'all', label: '下载全部批注文件' },
    { kind: 'workingPapers', label: '下载底稿批注文件' },
    { kind: 'report', label: '下载报告批注文件' },
    { kind: 'notes', label: '下载附注批注文件' },
    { kind: 'html', label: '下载复核结果 HTML' },
    { kind: 'bundle', label: '下载完整交付包' },
  ]
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/35 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">下载文件</div>
            <div className="text-[12px] text-slate-500 mt-1">请选择要下载的内容：</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="mt-4 grid gap-2">
          {items.map((item) => (
            <button
              key={item.kind}
              onClick={() => onDownload(item.kind)}
              className="text-left rounded-lg border border-slate-200 px-3 py-2.5 text-[12px] text-slate-700 hover:bg-slate-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 中栏结果面板 ──────────────────────────────────────────────
function ResultPanel({
  review, selectedFinding, onLocate, onSetStatus, verdict,
}: {
  review: TReportReview
  selectedFinding: string | null
  onLocate: (ref: SourceRef, findingId: string) => void
  onSetStatus: (fid: string, status: FindingStatus) => void
  verdict?: ReviewVerdict | null
}) {
  const findings = review.findings || []
  const procedures = review.review_procedures || []
  const rawGroups = review.finding_groups || []
  const groups = rawGroups.length > 0 ? rawGroups : buildGroupsFromFindings(findings)
  const artifacts = review.artifacts || []
  const canUpdateStatus = review.id !== 0
  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0, info: 0 } as Record<ReviewSeverity, number>
    findings.forEach((f) => { c[f.severity] = (c[f.severity] || 0) + 1 })
    return c
  }, [findings])
  const fileById = useMemo(
    () => Object.fromEntries((review.files || []).map((f) => [f.file_id, f.filename])),
    [review.files],
  )

  return (
    <div className="max-w-5xl mx-auto px-7 py-6 space-y-5">
      {/* 标题 + 概览 */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <div>
            <div className="text-[11px] text-slate-400">被复核单位</div>
            <h1 className="text-xl font-semibold text-slate-900">{review.title}</h1>
          </div>
          {review.case_study
            ? <Badge tone="brand">真实案例</Badge>
            : review.demo
              ? <Badge tone="amber">演示模式</Badge>
              : <Badge tone="green">AI 复核</Badge>}
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          {review.created_at?.replace('T', ' ').slice(0, 16)} · 报告复核结果
        </div>
      </div>

      {/* 总体结论 */}
      {verdict ? (
        <VerdictCard verdict={verdict} counts={counts} groups={groups} />
      ) : (
        <Card className="p-4 bg-gradient-to-br from-brand-50/60 to-white border-brand-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-brand-700 mb-1.5">
            <ListChecks size={13} /> 复核结论
          </div>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{review.summary}</p>
          <div className="mt-3 flex items-center gap-3 pt-3 border-t border-brand-100/70">
            {(['high', 'medium', 'low', 'info'] as ReviewSeverity[]).map((sv) => (
              counts[sv] > 0 && (
                <div key={sv} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className={cn('h-2 w-2 rounded-full', SEV[sv].dot)} />
                  {SEV[sv].label} <span className="font-semibold">{counts[sv]}</span>
                </div>
              )
            ))}
          </div>
        </Card>
      )}

      {/* 附件与质量说明 */}
      {(artifacts.length > 0 || review.quality_note) && (
        <Card className="p-4 bg-slate-900 text-white border-slate-800">
          <div className="flex items-center gap-1.5 text-sm font-semibold mb-2">
            <Download size={15} /> 结果文件与质量提示
          </div>
          {review.quality_note && <p className="text-[13px] text-slate-200 leading-relaxed">{review.quality_note}</p>}
          {artifacts.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {artifacts.map((a) => (
                <a key={a.href} href={a.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-xs text-white border border-white/10">
                  <Download size={12} /> {a.label}
                </a>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 分类后的意见列表 */}
      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-700">分类型复核结果（{findings.length}）</div>
        {findings.length === 0 && (
          <div className="text-sm text-slate-400 py-4">未产生意见。</div>
        )}
        {groups.map((g) => {
          const items = findings.filter((f) => f.category === g.category)
          if (items.length === 0) return null
          return (
            <FindingGroupSection
              key={g.category}
              group={g}
              findings={items}
              fileById={fileById}
              selectedFinding={selectedFinding}
              onLocate={onLocate}
              onSetStatus={onSetStatus}
              canUpdateStatus={canUpdateStatus}
            />
          )
        })}
      </div>

      {/* 局限事项 */}
      {review.limitations && review.limitations.length > 0 && (
        <Card className="p-4 bg-amber-50 border-amber-100">
          <div className="text-sm font-semibold text-amber-900 mb-2">复核边界</div>
          <ul className="space-y-1.5 text-[13px] text-amber-800 leading-relaxed">
            {review.limitations.map((x, i) => <li key={i}>• {x}</li>)}
          </ul>
        </Card>
      )}

      {/* 复核程序 */}
      {procedures.length > 0 && (
        <Card className="p-4 bg-white">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Layers3 size={15} className="text-brand-500" /> 本次执行的复核程序
            </div>
            <span className="text-[11px] text-slate-400">共 {procedures.length} 类程序</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {procedures.map((p, i) => (
              <ProcedureCard key={p.code} p={p} index={i + 1} />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function ReportReviewFlowPanel({
        reviewSubject, setReviewSubject, materialCounts, expandedMaterialDetails, toggleMaterialDetails,
        uploadedMaterials, removeMaterialFile, setMaterialRef, addMaterialFiles, openFolderPicker,
        expandedDemoFolders, toggleDemoFolder, selectedDims, toggleDim, hasMaterialReady, demoRunning,
        runError, startCaseReview, runPhase, events, elapsed, progress, onViewResult, onDownloadAnnotated,
        onDownloadReport, onRestart, docView, onSetDocView, review, selectedFinding, onLocate, onSetStatus,
        verdict, reportTaskTab, onSetReportTaskTab,
      }: {
        reviewSubject: string
        setReviewSubject: (v: string) => void
        materialCounts: Record<MaterialSlot, number>
        expandedMaterialDetails: Record<MaterialSlot, boolean>
        toggleMaterialDetails: (slot: MaterialSlot) => void
        uploadedMaterials: Record<MaterialSlot, File[]>
        removeMaterialFile: (slot: MaterialSlot, idx: number) => void
        setMaterialRef: (slot: MaterialSlot, el: HTMLInputElement | null) => void
        addMaterialFiles: (slot: MaterialSlot, list: FileList | null) => void
        openFolderPicker: (slot: MaterialSlot) => void
        expandedDemoFolders: Record<string, boolean>
        toggleDemoFolder: (key: string) => void
        selectedDims: boolean[]
        toggleDim: (i: number) => void
        hasMaterialReady: boolean
        demoRunning: boolean
        runError: string | null
        startCaseReview: () => void
        runPhase: 'idle' | 'running' | 'done'
        events: StreamEvent[]
        elapsed: number
        progress: number
        onViewResult: () => void
        onDownloadAnnotated: () => void
        onDownloadReport: () => void
        onRestart: () => void
        docView: boolean
        onSetDocView: (v: boolean) => void
        review: TReportReview
        selectedFinding: string | null
        onLocate: (ref: SourceRef, findingId: string) => void
        onSetStatus: (fid: string, status: FindingStatus) => void
        verdict?: ReviewVerdict | null
        reportTaskTab: 'task' | 'chat'
        onSetReportTaskTab: (v: 'task' | 'chat') => void
      }) {
        const findings = review.findings || []
        const sidebarItems = findings.slice(0, 8)
        return (
          <div className="max-w-[1600px] mx-auto px-8 py-6 space-y-5">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-xs text-slate-500 mb-1">{zh.nav.reportReview} · 智能复核工作台</div>
                <h1 className="text-2xl font-semibold text-slate-900">报告复核</h1>
              </div>
              <Badge tone="brand" className="ml-2">演示</Badge>
            </div>

            <div className="flex items-center gap-3 text-[13px]">
              {[1, 2, 3].map((n) => {
                const step = runPhase === 'idle' ? 1 : runPhase === 'running' ? 2 : 3
                return (
                  <div key={n} className="flex items-center gap-3">
                    <div className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1.5 border',
                      step === n ? 'border-brand-300 bg-brand-50 text-brand-700' : step > n ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500')}>
                      <span className={cn('h-5 w-5 rounded-full grid place-items-center text-[11px] font-semibold',
                        step === n ? 'bg-brand-600 text-white' : step > n ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600')}>{n}</span>
                      {n === 1 ? '上传复核材料' : n === 2 ? '运行复核' : '复核结果与人工待办'}
                    </div>
                    {n < 3 && <span className="text-slate-300">›</span>}
                  </div>
                )
              })}
            </div>

            {runPhase === 'idle' && (
              <div className="space-y-4">
                <Card className="p-5">
                  <div className="text-sm font-semibold text-slate-900 mb-3">① 基本信息</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-[12px] text-slate-500 mb-1.5">项目名称</div>
                      <Input value="甲公司 2025 报告复核" readOnly />
                    </div>
                    <div>
                      <div className="text-[12px] text-slate-500 mb-1.5">被审计单位（脱敏）</div>
                      <Input value={reviewSubject} onChange={(e) => setReviewSubject(e.target.value)} />
                    </div>
                    <div>
                      <div className="text-[12px] text-slate-500 mb-1.5">报告年度</div>
                      <Input value="2025" readOnly />
                    </div>
                  </div>
                </Card>

                <Card className="p-5">
                  <div className="text-sm font-semibold text-slate-900 mb-3">② 上传复核材料</div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {MATERIAL_SLOTS.map((slot) => {
                      const demo = demoSummaryForSlot(slot.key)
                      const detailOpen = expandedMaterialDetails[slot.key]
                      const showingUploaded = uploadedMaterials[slot.key].length > 0
                      return (
                        <div key={slot.key} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div>
                              <div className="text-[12px] font-medium text-slate-800">{slot.title}</div>
                              <div className="text-[10px] text-slate-400">
                                {slot.key === 'workingPapers' && !showingUploaded
                                  ? `已上传：${demo.folderCount} 个文件夹 / ${demo.fileCount} 个文件`
                                  : `已上传：${materialCounts[slot.key]} 个文件`}
                              </div>
                            </div>
                            {(showingUploaded || demo.items.length > 0) && (
                              <button type="button" onClick={() => toggleMaterialDetails(slot.key)} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800">
                                {detailOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                {detailOpen ? '收起明细' : '查看明细'}
                              </button>
                            )}
                          </div>
                          <input
                            id={`report-material-${slot.key}`}
                            ref={(el) => setMaterialRef(slot.key, el)}
                            type="file"
                            multiple={slot.multi ?? false}
                            accept={slot.accepts}
                            className="hidden"
                            onChange={(e) => addMaterialFiles(slot.key, e.target.files)}
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => document.getElementById(`report-material-${slot.key}`)?.click()}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                            >
                              <Upload size={12} /> 选择文件
                            </button>
                            {slot.allowFolder && (
                              <button
                                type="button"
                                onClick={() => openFolderPicker(slot.key)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                              >
                                <FolderOpen size={12} /> 选择文件夹
                              </button>
                            )}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">支持多次追加上传；文件夹模式会自动带上子文件夹内文件。</div>
                          {showingUploaded && detailOpen && (
                            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto pr-1">
                              {uploadedMaterials[slot.key].map((f, i) => {
                                const Ic = fileIcon(f.name)
                                return (
                                  <div key={f.name + i} className="flex items-center gap-2 px-2 py-1 rounded-md bg-white border border-slate-100 text-[11px]">
                                    <Ic size={12} className="text-slate-400 shrink-0" />
                                    <span className="truncate flex-1 text-slate-700">{f.name}</span>
                                    <button onClick={() => removeMaterialFile(slot.key, i)} className="text-slate-400 hover:text-rose-500 shrink-0"><X size={12} /></button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {!showingUploaded && detailOpen && demo.items.length > 0 && (
                            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
                              {demo.items.map((f, i) => {
                                const Ic = f.kind === 'excel' ? FileSpreadsheet : f.kind === 'pdf' ? FileDigit : FileText
                                if (f.isFolder) {
                                  const folderOpen = !!expandedDemoFolders[`${slot.key}:${f.name}`]
                                  const previewChildren = folderOpen ? (f.children || []) : (f.children || []).slice(0, 5)
                                  return (
                                    <div key={f.name + i} className="rounded-md bg-white border border-slate-100 text-[10.5px]">
                                      <button type="button" onClick={() => toggleDemoFolder(`${slot.key}:${f.name}`)} className="w-full flex items-start gap-2 px-2 py-1.5 text-left">
                                        {folderOpen ? <ChevronDown size={12} className="text-slate-400 shrink-0 mt-0.5" /> : <ChevronRight size={12} className="text-slate-400 shrink-0 mt-0.5" />}
                                        <FolderOpen size={12} className="text-slate-400 shrink-0 mt-0.5" />
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-slate-700">{f.name}</div>
                                          <div className="text-[9px] text-slate-400">{f.note}</div>
                                        </div>
                                      </button>
                                      {folderOpen && (
                                        <div className="px-7 pb-2 space-y-1">
                                          {previewChildren.map((child: string) => <div key={child} className="truncate text-[10px] text-slate-500">• {child}</div>)}
                                          {(f.children?.length || 0) > previewChildren.length && <div className="text-[9px] text-slate-400">还有 {(f.children?.length || 0) - previewChildren.length} 个文件…</div>}
                                        </div>
                                      )}
                                    </div>
                                  )
                                }
                                return (
                                  <div key={f.name + i} className="flex items-start gap-2 px-2 py-1 rounded-md bg-white border border-slate-100 text-[10.5px]">
                                    <Ic size={12} className="text-slate-400 shrink-0 mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-slate-700">{f.name}</div>
                                      <div className="text-[9px] text-slate-400">{f.note}</div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Card>

                <Card className="p-5">
                  <div className="text-sm font-semibold text-slate-900 mb-3">③ 复核维度与预检查</div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <div>
                      <div className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                        <ListChecks size={13} /> 复核维度
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {REVIEW_DIMENSIONS.map((d, i) => (
                          <button key={i} onClick={() => toggleDim(i)} className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10.5px] text-left transition-colors', selectedDims[i] ? 'border-brand-200 bg-brand-50/60 text-slate-700' : 'border-slate-200 bg-white text-slate-400')}>
                            <span className={cn('h-3.5 w-3.5 rounded grid place-items-center shrink-0 text-[9px] text-white', selectedDims[i] ? 'bg-brand-500' : 'bg-slate-200')}>{selectedDims[i] ? '✓' : ''}</span>
                            <span className="truncate">{d}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-600 mb-2">材料预检查</div>
                      <div className="space-y-1.5 text-[11px]">
                        {MATERIAL_SLOTS.map((slot) => (
                          <div key={slot.key} className="flex items-center gap-2 text-slate-600">
                            <span className={cn('h-4 w-4 rounded-full grid place-items-center text-white text-[9px]', materialCounts[slot.key] > 0 ? 'bg-emerald-500' : 'bg-slate-300')}>
                              {materialCounts[slot.key] > 0 ? '✓' : ''}
                            </span>
                            <span>{slot.title}{materialCounts[slot.key] > 0 ? ' 已识别' : ' 待上传'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex justify-end gap-2">
                    <Button variant="primary" onClick={startCaseReview} disabled={!hasMaterialReady || demoRunning}>
                      {demoRunning ? <><Loader2 size={14} className="animate-spin" /> 复核中…</> : <><Play size={14} /> 开始复核</>}
                    </Button>
                  </div>
                  {runError && <div className="mt-3 text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2 py-1.5">复核失败：{runError}</div>}
                </Card>
              </div>
            )}

            {runPhase === 'running' && (
              <ProcessingPanel subject={reviewSubject} events={events} elapsed={elapsed} progress={progress} />
            )}

            {runPhase === 'done' && (
              <div className="space-y-5">
                <CompletedPanel
                  onViewResult={onViewResult}
                  onDownloadAnnotated={onDownloadAnnotated}
                  onDownloadReport={onDownloadReport}
                  onRestart={onRestart}
                />
                <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
                  <div className="space-y-4 min-w-0">
                    <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
                      {[
                        ['核对项', '508'],
                        ['通过', '460'],
                        ['异常', '33'],
                        ['待人工确认', '15'],
                        ['总体结论', '不通过'],
                      ].map(([label, value], i) => (
                        <Card key={label} className={cn('p-4', i === 2 ? 'border-rose-200 bg-rose-50/40' : i === 3 ? 'border-amber-200 bg-amber-50/40' : '')}>
                          <div className={cn('text-xl font-semibold', i === 2 ? 'text-rose-600' : i === 3 ? 'text-amber-600' : 'text-slate-900')}>{value}</div>
                          <div className="mt-1 text-[11px] text-slate-500">{label}</div>
                        </Card>
                      ))}
                    </div>

                    <Card className="overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
                        <span className="text-sm font-medium text-slate-800">复核结果</span>
                        <div className="ml-auto flex items-center gap-2">
                          <button onClick={() => onSetDocView(true)} className={cn('px-3 py-1 rounded-md text-[12px] border', docView ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>复核意见书原版</button>
                          <button onClick={() => onSetDocView(false)} className={cn('px-3 py-1 rounded-md text-[12px] border', !docView ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>结构化视图</button>
                          <Button variant="outline" size="sm" onClick={onDownloadReport}><Download size={13} /> 下载报告</Button>
                        </div>
                      </div>
                      {docView ? (
                        <iframe src={PENGSHENG_OPINION_URL} title="审计报告复核意见书" className="w-full h-[980px] border-0 bg-white" />
                      ) : (
                        <div className="max-h-[980px] overflow-y-auto">
                          <ResultPanel
                            review={review}
                            selectedFinding={selectedFinding}
                            onLocate={onLocate}
                            onSetStatus={onSetStatus}
                            verdict={verdict}
                          />
                        </div>
                      )}
                    </Card>
                  </div>

                  <aside className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="flex border-b border-slate-200 bg-slate-50">
                      <button onClick={() => onSetReportTaskTab('task')} className={cn('flex-1 px-4 py-3 text-sm font-medium', reportTaskTab === 'task' ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-500' : 'text-slate-500 hover:bg-slate-100')}>异常点 <span className="ml-1 text-xs text-brand-600">{sidebarItems.length}</span></button>
                      <button onClick={() => onSetReportTaskTab('chat')} className={cn('flex-1 px-4 py-3 text-sm font-medium', reportTaskTab === 'chat' ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-500' : 'text-slate-500 hover:bg-slate-100')}>对话</button>
                    </div>
                    {reportTaskTab === 'task' ? (
                      <div className="p-4 space-y-3 max-h-[980px] overflow-y-auto">
                        {sidebarItems.map((f) => (
                          <div key={f.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                            <div className="flex items-center gap-2">
                              <Badge tone={f.severity === 'high' ? 'rose' : f.severity === 'medium' ? 'amber' : f.severity === 'low' ? 'sky' : 'green'}>
                                {f.severity === 'high' ? '高' : f.severity === 'medium' ? '中' : f.severity === 'low' ? '低' : '提示'}
                              </Badge>
                              <span className="text-sm font-medium text-slate-800">{f.title}</span>
                            </div>
                            <div className="mt-2 text-[12px] text-slate-600 leading-relaxed line-clamp-5">{f.detail}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="max-h-[980px] overflow-y-auto">
                        <div className="px-4 py-3 border-b border-slate-200 bg-white">
                          <div className="flex items-center gap-2">
                            <MessageSquare size={15} className="text-brand-600" />
                            <div className="text-sm font-semibold text-slate-900">复核助手</div>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1">可以就异常点、证据来源、整改建议继续追问。</div>
                        </div>
                        <div className="p-4 space-y-4 bg-slate-50/40">
                          <div className="rounded-2xl rounded-tl-md bg-white border border-slate-200 px-3 py-2 text-[12px] text-slate-700 leading-6 shadow-sm">
                            我已经把本次报告复核的异常点、待人工确认项和结果文件串起来了。你可以让我解释某个异常的依据、优先级，或者让我总结要发给客户/项目组的整改清单。
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="text-[11px] font-medium text-slate-500 mb-2">快捷提问</div>
                            <div className="flex flex-wrap gap-2">
                              {[
                                '把高风险异常按优先级列出来',
                                '哪些项目需要人工确认？',
                                '生成一版给项目组的整改清单',
                              ].map((q) => (
                                <button key={q} type="button" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600 hover:bg-slate-100">{q}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="border-t border-slate-200 bg-white p-3">
                          <div className="flex gap-2 items-center">
                            <Input className="flex-1 h-10 text-[12px]" placeholder="输入问题，例如：哪些异常会直接影响签发结论？" />
                            <Button variant="primary" size="sm" className="shrink-0 whitespace-nowrap min-w-[72px]">发送</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </aside>
                </div>
              </div>
            )}
          </div>
        )
      }

function VerdictCard({ verdict, counts, groups }: { verdict: ReviewVerdict; counts: Record<ReviewSeverity, number>; groups: FindingGroup[] }) {
  const LEVEL: Record<ReviewVerdict['level'], { wrap: string; badge: string; icon: any; dotText: string }> = {
    pass:  { wrap: 'from-emerald-50 to-white border-emerald-200', badge: 'bg-emerald-600 text-white', icon: CircleCheck, dotText: 'text-emerald-700' },
    minor: { wrap: 'from-sky-50 to-white border-sky-200',         badge: 'bg-sky-600 text-white',     icon: Info,        dotText: 'text-sky-700' },
    major: { wrap: 'from-rose-50 to-white border-rose-200',       badge: 'bg-rose-600 text-white',    icon: AlertTriangle, dotText: 'text-rose-700' },
    fail:  { wrap: 'from-rose-100 to-white border-rose-300',      badge: 'bg-rose-700 text-white',    icon: AlertTriangle, dotText: 'text-rose-800' },
  }
  const Ic = LEVEL[verdict.level].icon
  const lv = LEVEL[verdict.level]

  // 「问题集中在」直接由分类分组生成：有高风险的类别优先，其次有中风险的类别，按 高→中 数量排序，与下方分类结果完全一致
  const focusGroups = useMemo(() => {
    return [...groups]
      .filter((g) => g.high_count > 0 || g.medium_count > 0)
      .sort((a, b) => (b.high_count - a.high_count) || (b.medium_count - a.medium_count))
  }, [groups])

  return (
    <Card className={cn('p-5 bg-gradient-to-br border', lv.wrap)}>
      {/* 判定徽章 + 计数 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold', lv.badge)}>
          <Ic size={14} /> {verdict.levelLabel}
        </span>
        <div className="flex items-center gap-3">
          {(['high', 'medium', 'low', 'info'] as ReviewSeverity[]).map((sv) => (
            counts[sv] > 0 && (
              <div key={sv} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className={cn('h-2 w-2 rounded-full', SEV[sv].dot)} />
                {SEV[sv].label} <span className="font-semibold">{counts[sv]}</span>
              </div>
            )
          ))}
        </div>
      </div>

      {/* 一句话定性 */}
      <h2 className={cn('mt-3 text-lg font-bold leading-snug', lv.dotText)}>{verdict.headline}</h2>

      {/* 问题集中在（按分类，高风险优先） */}
      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-500 mb-2">问题集中在（按类别）</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {focusGroups.map((g) => (
            <div key={g.category} className="flex items-start gap-2.5 rounded-lg bg-white/70 border border-slate-100 px-3 py-2">
              <span className={cn('mt-1 h-1.5 w-1.5 rounded-full shrink-0', g.high_count > 0 ? 'bg-rose-500' : 'bg-amber-500')} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12.5px] font-semibold text-slate-800">{g.label || g.category}</span>
                  {g.high_count > 0 && <Badge tone="rose" className="!text-[10px] !px-1.5">高 {g.high_count}</Badge>}
                  {g.medium_count > 0 && <Badge tone="amber" className="!text-[10px] !px-1.5">中 {g.medium_count}</Badge>}
                  {g.low_count > 0 && <Badge tone="sky" className="!text-[10px] !px-1.5">低 {g.low_count}</Badge>}
                </div>
                {g.description && <p className="mt-0.5 text-[11.5px] text-slate-500 leading-relaxed">{g.description}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 复核确认可靠 */}
      {verdict.reliable?.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-200/70">
          <div className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
            <CircleCheck size={13} className="text-emerald-500" /> 复核确认可靠
          </div>
          <ul className="space-y-1">
            {verdict.reliable.map((x, i) => (
              <li key={i} className="text-[12px] text-slate-500 leading-relaxed flex items-start gap-1.5">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-emerald-400 shrink-0" /> {x}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function ProcedureCard({ p, index }: { p: ReviewProcedure; index: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center gap-2">
        <span className="h-6 w-6 rounded-full bg-brand-600 text-white text-[11px] font-semibold grid place-items-center">{index}</span>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-800 truncate">{p.name}</div>
          <div className="text-[10px] text-brand-600">{p.category}</div>
        </div>
      </div>
      <p className="mt-2 text-[12px] text-slate-600 leading-relaxed">{p.description}</p>
      {p.outputs?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.outputs.map((o) => <span key={o} className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] text-slate-500">{o}</span>)}
        </div>
      )}
    </div>
  )
}

function buildGroupsFromFindings(findings: ReviewFinding[]): FindingGroup[] {
  return Array.from(new Set(findings.map((f) => f.category))).map((category) => {
    const items = findings.filter((f) => f.category === category)
    return {
      category,
      label: category,
      description: '',
      count: items.length,
      high_count: items.filter((f) => f.severity === 'high').length,
      medium_count: items.filter((f) => f.severity === 'medium').length,
      low_count: items.filter((f) => f.severity === 'low').length,
      info_count: items.filter((f) => f.severity === 'info').length,
      finding_ids: items.map((f) => f.id),
    }
  })
}

function FindingGroupSection({
  group, findings, fileById, selectedFinding, onLocate, onSetStatus, canUpdateStatus,
}: {
  group: FindingGroup
  findings: ReviewFinding[]
  fileById: Record<string, string>
  selectedFinding: string | null
  onLocate: (ref: SourceRef, findingId: string) => void
  onSetStatus: (fid: string, status: FindingStatus) => void
  canUpdateStatus: boolean
}) {
  return (
    <Card className="p-4 bg-white">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">{group.label || group.category}</h2>
            <Badge tone="neutral" className="!text-[10px]">{findings.length} 项</Badge>
          </div>
          {group.description && <p className="mt-1 text-xs text-slate-500">{group.description}</p>}
        </div>
        <div className="flex gap-1.5 text-[10px] text-slate-500 shrink-0">
          {group.high_count > 0 && <Badge tone="rose" className="!text-[10px]">高 {group.high_count}</Badge>}
          {group.medium_count > 0 && <Badge tone="amber" className="!text-[10px]">中 {group.medium_count}</Badge>}
          {group.low_count > 0 && <Badge tone="sky" className="!text-[10px]">低 {group.low_count}</Badge>}
          {group.info_count > 0 && <Badge tone="green" className="!text-[10px]">通过/提示 {group.info_count}</Badge>}
        </div>
      </div>
      <div className="space-y-2.5">
        {findings.map((f) => (
          <FindingCard
            key={f.id}
            f={f}
            fileById={fileById}
            selected={selectedFinding === f.id}
            onLocate={onLocate}
            onSetStatus={onSetStatus}
            canUpdateStatus={canUpdateStatus}
          />
        ))}
      </div>
    </Card>
  )
}

// ── 单条意见卡片 ──────────────────────────────────────────────
function FindingCard({
  f, fileById, selected, onLocate, onSetStatus, canUpdateStatus = true,
}: {
  f: ReviewFinding
  fileById: Record<string, string>
  selected: boolean
  onLocate: (ref: SourceRef, findingId: string) => void
  onSetStatus: (fid: string, status: FindingStatus) => void
  canUpdateStatus?: boolean
}) {
  const sv = SEV[f.severity] ?? SEV.info
  const Ic = sv.icon
  const resolved = f.status === 'resolved'
  const dismissed = f.status === 'dismissed'

  return (
    <Card className={cn(
      'p-3.5 border-l-4 transition-all',
      sv.ring,
      selected && 'ring-2 ring-brand-300',
      (resolved || dismissed) && 'opacity-60',
    )}>
      <div className="flex items-start gap-2.5">
        <Ic size={16} className={cn('mt-0.5 shrink-0', sv.text)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={sv.tone} className="!text-[10px]">{sv.label}</Badge>
            <Badge tone="neutral" className="!text-[10px]">{f.category}</Badge>
            <span className={cn('text-sm font-medium text-slate-800', resolved && 'line-through')}>{f.title}</span>
            {resolved && <Badge tone="green" className="!text-[10px]"><CircleCheck size={10} /> 已处理</Badge>}
            {dismissed && <Badge tone="neutral" className="!text-[10px]">已忽略</Badge>}
          </div>
          <p className="mt-1.5 text-[13px] text-slate-600 leading-relaxed">{f.detail}</p>

          {/* 证据摘要：原文定位降级为可选入口 */}
          {f.source_refs?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {f.source_refs.map((r, i) => (
                <button
                  key={i}
                  onClick={() => onLocate(r, f.id)}
                  className="group inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-md bg-slate-50 hover:bg-brand-50 border border-slate-200 hover:border-brand-200 text-[11px] text-slate-600 hover:text-brand-700 transition-colors"
                  title={r.quote}
                >
                  <Link2 size={11} className="shrink-0 text-slate-400 group-hover:text-brand-500" />
                  <span className="font-medium shrink-0">查看证据</span>
                  <span className="text-slate-400 shrink-0">{fileById[r.file_id]?.slice(0, 14) || '文件'} @{r.anchor}</span>
                  {r.quote && <span className="truncate text-slate-400">— {r.quote}</span>}
                </button>
              ))}
            </div>
          )}

          {/* 状态操作 */}
          {canUpdateStatus && <div className="mt-2.5 flex items-center gap-2">
            {!resolved ? (
              <button onClick={() => onSetStatus(f.id, 'resolved')} className="text-[11px] text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                <CircleCheck size={12} /> 标记已处理
              </button>
            ) : (
              <button onClick={() => onSetStatus(f.id, 'open')} className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1">
                <RotateCcw size={12} /> 恢复
              </button>
            )}
            {!dismissed && !resolved && (
              <button onClick={() => onSetStatus(f.id, 'dismissed')} className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1">
                <X size={12} /> 忽略
              </button>
            )}
          </div>}
        </div>
      </div>
    </Card>
  )
}

import { useMemo, useRef, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FileCheck2, Upload, FileText, FileSpreadsheet, FileType2, X, Play,
  AlertTriangle, AlertCircle, Info, CircleCheck, Trash2, ListChecks,
  RotateCcw, Link2, Loader2, Download, Layers3,
  FolderOpen, ChevronDown, FileDigit,
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

// 默认展示的真实复核案例：复核案例（丙公司 / 丁公司，2024 & 2025，单体+合并）
const CASE_REVIEW: TReportReview = PENGSHENG_REVIEW

// 该案例的「复核意见书原版」HTML（A–G 七段版式，public/cases/ 下，按原样式渲染）
const PENGSHENG_OPINION_URL = '/cases/pengsheng-opinion.html'

export default function ReportReview() {
  const { reviewId } = useParams()
  const nav = useNavigate()
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
  const [demoRunning, setDemoRunning] = useState(false) // 文件夹模式的复核中动画

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
  return (
    <div className="h-full flex bg-slate-50/40">
      {/* ───────── 左栏：上传 + 复核要求 + 历史 ───────── */}
      <aside className="w-[340px] shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-y-auto">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-brand-50 grid place-items-center">
              <FileCheck2 size={18} className="text-brand-600" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-900">{zh.nav.reportReview}</h1>
              <p className="text-[11px] text-slate-500">输入文件夹地址 → 复核报告 + TB</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* 文件夹地址（主输入方式） */}
          <div>
            <div className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
              <FolderOpen size={13} /> 待复核文件夹
              <span className="text-slate-400 font-normal">（报告 + TB 整包，自动归集）</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                value={folderPath}
                onChange={(e) => { setFolderPath(e.target.value); setScanned(false) }}
                placeholder="粘贴一个文件夹地址，如 /Users/.../报告+Tb复核"
                className="text-[11px] font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={!folderPath.trim()}
                onClick={() => setScanned(true)}
                title="扫描文件夹，识别报告与 TB"
              >
                <FolderOpen size={13} /> 识别
              </Button>
            </div>

            {/* 识别到的文件清单 */}
            {scanned && folderPath.trim() && (
              <div className="mt-2">
                <div className="text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                  <FileDigit size={11} /> 识别到 {PENGSHENG_FOLDER_FILES.length} 组文件（报告 4 套 · TB 6 个 · 定稿 PDF 1 份）
                </div>
                <div className="space-y-1 max-h-44 overflow-y-auto pr-0.5">
                  {PENGSHENG_FOLDER_FILES.map((f, i) => {
                    const Ic = f.kind === 'excel' ? FileSpreadsheet : f.kind === 'pdf' ? FileDigit : FileText
                    return (
                      <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-slate-50 border border-slate-100 text-[11px]">
                        <Ic size={14} className="text-slate-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-slate-700" title={f.name}>{f.name}</div>
                          <div className="text-[9px] text-slate-400">{f.note}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 或上传文件（折叠次要入口） */}
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="mt-2 text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              <ChevronDown size={12} className={cn('transition-transform', showUpload && 'rotate-180')} />
              {showUpload ? '收起' : '或改用上传文件'}
            </button>
            {showUpload && (
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
                className={cn(
                  'mt-2 block border-2 border-dashed rounded-xl px-3 py-4 text-center cursor-pointer transition-colors',
                  dragOver ? 'border-brand-400 bg-brand-50/50' : 'border-slate-300 hover:border-brand-400 hover:bg-brand-50/30',
                )}
              >
                <input
                  ref={reportInputRef}
                  type="file"
                  multiple
                  accept=".docx,.xlsx,.xlsm,.xls,.md,.txt,.pdf"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <Upload size={18} className="mx-auto text-slate-400" />
                <div className="mt-1 text-[11px] text-slate-600">拖拽或点击上传</div>
                <div className="text-[10px] text-slate-400 mt-0.5">支持 Word / Excel / PDF / Markdown</div>
              </label>
            )}

            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((f, i) => {
                  const Ic = fileIcon(f.name)
                  return (
                    <div key={f.name + i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-slate-50 border border-slate-100 text-xs">
                      <Ic size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate flex-1 text-slate-700" title={f.name}>{f.name}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{(f.size / 1024).toFixed(0)}KB</span>
                      <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-rose-500 shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 复核要求 */}
          <div>
            <div className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
              <ListChecks size={13} /> 复核要求
              <span className="text-slate-400 font-normal">（默认已预填，可修改）</span>
            </div>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={7}
              className="text-[11px] leading-relaxed font-mono resize-y"
              placeholder="输入复核要求，或上传 .md 文档…"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <input
                ref={instrInputRef}
                type="file"
                accept=".md,.markdown,.txt,.docx"
                className="hidden"
                onChange={(e) => setInstructionFile(e.target.files?.[0] ?? null)}
              />
              <Button variant="outline" size="sm" onClick={() => instrInputRef.current?.click()}>
                <Upload size={12} /> 上传要求文档
              </Button>
              {instructionFile && (
                <span className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
                  <FileType2 size={12} /> {instructionFile.name}
                  <button onClick={() => setInstructionFile(null)} className="text-slate-400 hover:text-rose-500">
                    <X size={12} />
                  </button>
                </span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 leading-relaxed">
            <div className="font-medium text-slate-700 mb-1">复核信息如何确定？</div>
            <p>公司名称、报告期间、企业类型通常从审计报告正文、财务报表封面和附注自动识别。</p>
            <p className="mt-1">这些信息会影响报告文本一致性和披露适用性；如文件中缺失或识别失败，后续再由审计师补充确认即可，不必作为上传前必填项。</p>
          </div>

          {/* 执行 */}
          <Button
            variant="primary"
            className="w-full"
            disabled={(files.length === 0 && !(scanned && folderPath.trim())) || run.isPending || demoRunning}
            onClick={() => {
              if (files.length > 0) { run.mutate(); return }
              // 文件夹模式：演示展示复核案例复核结果
              setDemoRunning(true)
              setActiveId(null)
              nav('/report-review')
              setSelectedFinding(null)
              setTimeout(() => setDemoRunning(false), 1100)
            }}
          >
            {(run.isPending || demoRunning)
              ? (<><Loader2 size={14} className="animate-spin" /> 复核中…</>)
              : files.length > 0
                ? (<><Play size={14} /> 执行复核 ({files.length} 个文件)</>)
                : (<><Play size={14} /> 复核该文件夹</>)}
          </Button>
          {run.isError && (
            <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2 py-1.5">
              复核失败：{(run.error as Error).message}
            </div>
          )}
        </div>

        {/* 历史复核 */}
        <div className="px-4 pb-4 mt-1">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 px-1">历史复核</div>
          {reviews.length === 0 ? (
            <div className="text-[11px] text-slate-500 px-2 py-2 rounded-md bg-amber-50 border border-amber-100">
              当前展示「复核案例 · 丙公司 / 丁公司」真实复核案例（含企查查工商核验）。更换文件夹地址或上传文件后会生成新的复核记录。
            </div>
          ) : (
            <div className="space-y-1">
              {reviews.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setActiveId(r.id); nav(`/report-review/${r.id}`); setSelectedFinding(null) }}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-md border text-xs transition-colors group',
                    activeId === r.id ? 'border-brand-300 bg-brand-50/50' : 'border-slate-100 hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-700 truncate flex-1">{r.title}</span>
                    <Trash2
                      size={12}
                      className="text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-500 shrink-0"
                      onClick={(e) => { e.stopPropagation(); del.mutate(r.id) }}
                    />
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

      {/* ───────── 中栏：复核结果 ───────── */}
      <section className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!(run.isPending || demoRunning) && isCaseDemo && (
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
            <a
              href={PENGSHENG_OPINION_URL}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-[12px] text-brand-600 hover:underline"
            >
              <Download size={12} /> 新窗口打开
            </a>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {(run.isPending || demoRunning) ? (
            <EmptyState hasFiles={files.length > 0 || (scanned && !!folderPath.trim())} running={true} />
          ) : (isCaseDemo && docView) ? (
            <iframe
              src={PENGSHENG_OPINION_URL}
              title="审计报告复核意见书"
              className="w-full h-full border-0 bg-white"
            />
          ) : (
            <ResultPanel
              review={displayReview}
              selectedFinding={selectedFinding}
              onLocate={locate}
              onSetStatus={(fid, status) => { if (activeId) setStatus.mutate({ fid, status }) }}
              verdict={displayReview === CASE_REVIEW ? PENGSHENG_VERDICT : null}
            />
          )}
        </div>
      </section>

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

/** 穿行测试底稿视图 — 中间区域.
 *
 * 中栏呈现穿行测试「流程 + 结果」底稿：
 *  - 顶部：一句话结论 + 范围/样本计数 + 下载
 *  - Tab：穿行测试过程说明（原版 HTML，iframe）+ 细节测试底稿（双向，Excel 网格）
 * 需人工处理的事项（3 笔需复核 / 勾稽发现 / 人工门轨迹）见右侧「任务」面板。
 */
import { useMemo, useState } from 'react'
import { FileSpreadsheet, FileText, ExternalLink, CheckCircle2, Search, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import FreeformGridView from './FreeformGridView'

interface Props {
  paperData: any
}

type Sheet = { grid: any[][]; ncols?: number; total_rows?: number; note?: string; styles?: Record<string, { b?: number; f?: string }> }

const DOC_TAB = '__doc__'

export default function WalkthroughPaperView({ paperData }: Props) {
  const meta = paperData?.walkthrough_meta || {}
  const c = meta.counts || {}
  const sheetData: Record<string, Sheet> = paperData?.sheet_data || {}
  const sheetCodes = useMemo(() => Object.keys(sheetData), [sheetData])

  const [tab, setTab] = useState<string>(DOC_TAB)
  const [rowLimit, setRowLimit] = useState(120)

  const cur = tab !== DOC_TAB ? sheetData[tab] : null

  return (
    <div className="space-y-3">
      {/* —— 工具栏 —— */}
      <div className="flex items-center gap-2 px-1 flex-wrap">
        <Badge tone="brand">穿行测试</Badge>
        <span className="text-sm font-medium text-slate-700">{meta.cycle || '销售循环'} · {meta.engagement}</span>
        <Badge tone="amber" className="!h-5">认定：{meta.assertion || '发生/存在'}</Badge>
        <Badge tone="neutral" className="!h-5">{meta.direction || '从合同到明细账'}</Badge>
        <div className="ml-auto flex items-center gap-2">
          {meta.detail_xlsx && (
            <a href={meta.detail_xlsx} download className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white" title="下载细节测试底稿 (.xlsx)">
              <FileSpreadsheet size={13} /> 下载底稿 (.xlsx)
            </a>
          )}
          {meta.process_html && (
            <a href={meta.process_html} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-brand-600 hover:underline" title="新窗口打开过程说明">
              <ExternalLink size={12} /> 过程说明
            </a>
          )}
        </div>
      </div>

      {/* —— 一句话结论 + 计数 —— */}
      {meta.headline && (
        <div className="rounded-lg border-l-4 border-l-brand-500 bg-white border border-slate-200 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-brand-700 font-semibold mb-1">一句话结论</div>
          <p className="text-[13px] leading-relaxed text-slate-700">{meta.headline}</p>
          <div className="mt-2 flex items-center gap-2 flex-wrap text-[12px]">
            <Chip>合同 {c.contracts ?? '—'}</Chip>
            <Chip>出库 {c.outbounds ?? '—'}</Chip>
            <Chip>样本 {c.samples ?? '—'}</Chip>
            <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} /> 通过 {c.pass ?? 0}</span>
            <span className="inline-flex items-center gap-1 text-amber-700"><Search size={13} /> 需复核 {c.review ?? 0}</span>
            <span className="inline-flex items-center gap-1 text-rose-700"><AlertTriangle size={13} /> 异常 {c.anomaly ?? 0}</span>
          </div>
        </div>
      )}

      {/* —— Tab 栏 —— */}
      <div className="flex items-center gap-1 border-b border-slate-200 flex-wrap">
        <Tab active={tab === DOC_TAB} onClick={() => setTab(DOC_TAB)} icon={FileText}>穿行测试过程说明</Tab>
        {sheetCodes.map((sc) => (
          <Tab key={sc} active={tab === sc} onClick={() => { setTab(sc); setRowLimit(120) }} icon={FileSpreadsheet}>
            {sc}
            {sheetData[sc]?.total_rows ? <Badge tone="neutral" className="!h-4 !text-[10px] ml-1">{sheetData[sc].total_rows}</Badge> : null}
          </Tab>
        ))}
      </div>

      {/* —— 内容 —— */}
      {tab === DOC_TAB ? (
        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
          <iframe
            src={meta.process_html}
            title="穿行测试过程说明"
            className="w-full border-0 bg-white"
            style={{ height: '82vh' }}
          />
        </div>
      ) : cur ? (
        <FreeformGridView
          grid={cur.grid}
          ncols={cur.ncols}
          totalRows={cur.total_rows}
          note={cur.note}
          styles={cur.styles}
          sheetCode={tab}
          rowLimit={rowLimit}
          onLoadMore={() => setRowLimit((n) => n + 100)}
        />
      ) : null}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]">{children}</span>
}

function Tab({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: any; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-[12px] border-b-2 -mb-px flex items-center gap-1.5',
        active ? 'border-amber-500 text-amber-700 font-medium' : 'border-transparent text-slate-600 hover:text-slate-900',
      )}
    >
      <Icon size={13} />
      {children}
    </button>
  )
}

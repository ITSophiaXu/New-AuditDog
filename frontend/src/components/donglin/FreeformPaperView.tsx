/** 自由底稿 — 中间区域（以底稿 Excel 为主 + 数据源/方法/规则 + 审计说明/审计调整）.
 *
 * 中栏：精简工具栏 + 一行口径 + Tab（数据源·方法·规则 / 12 张子表）+ 底稿下方的
 *   「审计说明」(AuditNotesPanel) 与「审计调整」(AdjustmentEntriesPanel)。
 * 需人工处理的发现（findings）仍在右侧「任务」面板。
 */
import { useMemo, useState } from 'react'
import { FileSpreadsheet, Database, FlaskConical, Sigma } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import FreeformGridView from './FreeformGridView'
import AuditNotesPanel from './AuditNotesPanel'
import AdjustmentEntriesPanel from './AdjustmentEntriesPanel'

interface Props {
  paperData: any
  paperId: number
}

type Sheet = { grid: any[][]; ncols?: number; total_rows?: number; note?: string; styles?: Record<string, { b?: number; f?: string }> }

const DATA_TAB = '__data__'

export default function FreeformPaperView({ paperData, paperId }: Props) {
  const meta = paperData?.freeform_meta || {}
  const paperCode = (paperData?.index as string) || 'A1F'
  const sheetData: Record<string, Sheet> = paperData?.sheet_data || {}
  const sheetCodes = useMemo(() => Object.keys(sheetData), [sheetData])
  const dataSources: any[] = paperData?.data_sources || []
  const methods: any[] = paperData?.methods || []
  const formulas: any[] = paperData?.formulas || []
  const hasMethodTab = dataSources.length > 0 || methods.length > 0 || formulas.length > 0

  const [activeSheet, setActiveSheet] = useState<string>(hasMethodTab ? DATA_TAB : (sheetCodes[0] || ''))
  const [rowLimit, setRowLimit] = useState(80)

  const cur = activeSheet !== DATA_TAB ? sheetData[activeSheet] : null

  return (
    <div className="space-y-3">
      {/* —— 工具栏 —— */}
      <div className="flex items-center gap-2 px-1">
        <Badge tone="brand">A1F</Badge>
        <span className="text-sm font-medium text-slate-700">货币资金 · 自由底稿</span>
        <Badge tone="amber" className="!h-5">不套母版 · Agent 自拟结构</Badge>
        <div className="ml-auto flex items-center gap-2">
          <a
            href="/api/donglin/freeform-xlsx"
            download="货币资金A1_自由底稿_甲公司2025.xlsx"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
            title="下载 Agent 自由生成的 A1 底稿 (.xlsx)"
          >
            <FileSpreadsheet size={13} /> 下载底稿 (.xlsx)
          </a>
        </div>
      </div>

      {/* —— 一行项目口径 —— */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 px-1">
        <span><span className="text-slate-400">被审计单位</span> <span className="text-slate-700 font-medium">{meta.engagement || '—'}</span></span>
        <span><span className="text-slate-400">期间</span> <span className="text-slate-700">{meta.period || '—'}</span></span>
        <span><span className="text-slate-400">科目</span> <span className="text-slate-700">{meta.subject || '货币资金 (A1)'}</span></span>
        {meta.note && <span className="text-amber-600">{meta.note}</span>}
      </div>

      {/* —— Tab 栏 —— */}
      <div className="flex items-center gap-1 border-b border-slate-200 flex-wrap mb-2">
        {hasMethodTab && (
          <button
            onClick={() => setActiveSheet(DATA_TAB)}
            className={cn('px-2.5 py-1.5 text-[12px] border-b-2 -mb-px flex items-center gap-1.5',
              activeSheet === DATA_TAB ? 'border-violet-500 text-violet-700 font-medium' : 'border-transparent text-slate-600 hover:text-slate-900')}
          >
            <Database size={12} /> 数据源 · 方法 · 规则
          </button>
        )}
        {sheetCodes.map((sc) => (
          <button
            key={sc}
            onClick={() => { setActiveSheet(sc); setRowLimit(80) }}
            className={cn('px-2.5 py-1.5 text-[12px] border-b-2 -mb-px flex items-center gap-1.5',
              activeSheet === sc ? 'border-amber-500 text-amber-700 font-medium' : 'border-transparent text-slate-600 hover:text-slate-900')}
          >
            <FileSpreadsheet size={12} />
            {sheetLabel(sc)}
            {sheetData[sc]?.total_rows ? <Badge tone="neutral" className="!h-4 !text-[10px]">{sheetData[sc].total_rows}</Badge> : null}
          </button>
        ))}
      </div>

      {/* —— Tab 内容 —— */}
      {activeSheet === DATA_TAB ? (
        <MethodsView dataSources={dataSources} methods={methods} formulas={formulas} />
      ) : cur ? (
        <FreeformGridView
          grid={cur.grid}
          ncols={cur.ncols}
          totalRows={cur.total_rows}
          note={cur.note}
          styles={cur.styles}
          sheetCode={activeSheet}
          rowLimit={rowLimit}
          onLoadMore={() => setRowLimit((n) => n + 100)}
        />
      ) : null}

      {/* —— 底稿表下方：随当前底稿表(sheet)变化的 审计说明 + 审计调整 —— */}
      {activeSheet !== DATA_TAB && (
        <>
          <AuditNotesPanel
            paperId={paperId}
            paperCode={paperCode}
            paperData={paperData}
            sheetCode={activeSheet}
            sheetLabel={sheetLabel(activeSheet)}
          />
          <AdjustmentEntriesPanel
            paperId={paperId}
            paperCode={paperCode}
            paperData={paperData}
            sheetCode={activeSheet}
            sheetLabel={sheetLabel(activeSheet)}
          />
        </>
      )}
    </div>
  )
}

function MethodsView({ dataSources, methods, formulas }: { dataSources: any[]; methods: any[]; formulas: any[] }) {
  return (
    <div className="space-y-4">
      {/* 数据源 */}
      {dataSources.length > 0 && (
        <Section icon={Database} title="数据源（数据分层）" tone="text-sky-600">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{['数据分层', '内容', '条数', '作用'].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {dataSources.map((d, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-medium text-slate-700 whitespace-nowrap">{d.layer}</td>
                    <td className="px-2 py-1.5 text-slate-600">{d.content}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{d.rows}</td>
                    <td className="px-2 py-1.5 text-slate-500">{d.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* 审计程序与方法 */}
      {methods.length > 0 && (
        <Section icon={FlaskConical} title={`审计程序与方法（${methods.length} 项 · 材料 → 方法 → 结果）`} tone="text-emerald-600">
          <div className="space-y-2">
            {methods.map((m, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] font-bold text-slate-700">{m.code}</span>
                  <span className="text-[13px] font-medium text-slate-800">{m.name}</span>
                  <Badge tone="sky" className="!h-5">{m.assertion}</Badge>
                  <span className="text-[10.5px] text-slate-400">范围：{m.scope}</span>
                  {m.result && <Badge tone="neutral" className="!h-5 ml-auto">{m.result}</Badge>}
                </div>
                <div className="mt-1.5 grid gap-1 text-[12px]">
                  {m.materials && <KV k="📥 读取材料" v={m.materials} />}
                  {m.method && <KV k="🔍 信息·方法" v={m.method} />}
                  {m.conclusion && <KV k="⚠ 关键结论" v={m.conclusion} accent />}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 公式/阈值 */}
      {formulas.length > 0 && (
        <Section icon={Sigma} title="关键公式 / 阈值 / 判定规则" tone="text-violet-600">
          <div className="space-y-1.5">
            {formulas.map((f, i) => (
              <div key={i} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                <div className="text-[12px] font-medium text-slate-700">{f.name}</div>
                <div className="text-[12px] font-mono text-violet-800 bg-violet-50/60 rounded px-2 py-1 mt-0.5 inline-block">{f.expr}</div>
                {f.use && <div className="text-[11px] text-slate-500 mt-0.5">用途：{f.use}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ icon: Icon, title, tone, children }: { icon: any; title: string; tone: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 text-[12px] font-semibold text-slate-700">
        <Icon size={14} className={tone} /> {title}
      </div>
      {children}
    </div>
  )
}

function KV({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-slate-400 whitespace-nowrap shrink-0">{k}</span>
      <span className={cn('leading-relaxed', accent ? 'text-rose-700' : 'text-slate-700')}>{v}</span>
    </div>
  )
}

function sheetLabel(code: string): string {
  return code.replace(/^\d+_/, '')
}

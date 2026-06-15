/** Excel-like grid view for filled donglin papers.
 *
 * Renders sheet_data as a true Excel-style grid:
 *  - Row numbers (1..N) on left, sticky column
 *  - Column letters (A..Z) on top, sticky row
 *  - Cell borders, header band, sticky position
 *  - Color-coded by source_kind (TB/Aux/Voucher/Computed/RuleDerived/Knowledge/TemplateConst)
 *  - Click cell → provenance drawer
 *  - Supports both field-mode (summary sheet) and rows-mode (table sheet)
 */
import { useMemo } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProvenanceCell, SOURCE_KIND_TONE } from '@/lib/donglin'

type Props = {
  sheetCode: string
  sheetData: any  // either { rows: [...] } or { field1: val, field2: val, ... }
  cellMap: Record<string, ProvenanceCell>  // keyed by `${sheetCode}.${field}` or `${sheetCode}.rows[i].col`
  onCellClick: (key: string) => void
  rowLimit?: number
  onLoadMore?: () => void
}

const COL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const colLetter = (i: number): string => {
  if (i < 26) return COL_LETTERS[i]
  return COL_LETTERS[Math.floor(i / 26) - 1] + COL_LETTERS[i % 26]
}

const KIND_BG_CLASS: Record<string, string> = {
  TB:            'bg-sky-50 text-sky-900',
  Aux:           'bg-emerald-50 text-emerald-900',
  Voucher:       'bg-amber-50 text-amber-900',
  Computed:      'bg-slate-100 text-slate-700',
  RuleDerived:   'bg-rose-100 text-rose-900 font-semibold ring-2 ring-inset ring-rose-300',
  Knowledge:     'bg-violet-50 text-violet-900',
  TemplateConst: 'bg-orange-50 text-orange-800 italic',
}

export default function ExcelGridView({
  sheetCode, sheetData, cellMap, onCellClick, rowLimit = 100, onLoadMore,
}: Props) {
  // Detect mode
  const isTable = Array.isArray(sheetData?.rows) && sheetData.rows.length > 0
  const isSummary = !isTable && sheetData && Object.keys(sheetData).some(
    (k) => typeof sheetData[k] !== 'object' || sheetData[k] === null,
  )

  if (!sheetData || (!isTable && !isSummary)) {
    return (
      <div className="p-8 text-sm text-slate-500 text-center bg-white border border-slate-200 rounded">
        此 sheet 尚未填稿
      </div>
    )
  }

  // ── Mode: 表格 (rows) ──
  if (isTable) {
    const rows = sheetData.rows as any[]
    const cols = useMemo(() => Object.keys(rows[0] || {}), [rows])
    const showRows = rows.slice(0, rowLimit)
    return (
      <div className="excel-grid-wrap border border-slate-300 rounded bg-white overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: 600 }}>
          <table className="excel-grid border-collapse text-[12px] font-sans w-full">
            <thead>
              {/* Column-letter row */}
              <tr>
                <th className="excel-corner sticky top-0 left-0 z-30 bg-slate-200 border border-slate-300 px-1 text-center text-[10px] text-slate-500 w-9 h-6"></th>
                {cols.map((_, i) => (
                  <th key={i} className="sticky top-0 z-20 bg-slate-200 border border-slate-300 text-[10px] text-slate-500 font-normal text-center h-6">
                    {colLetter(i)}
                  </th>
                ))}
              </tr>
              {/* Header row (column names from data) */}
              <tr>
                <th className="sticky left-0 z-20 bg-slate-100 border border-slate-300 text-[10px] text-slate-500 text-center w-9">
                  1
                </th>
                {cols.map((c) => (
                  <th key={c} className="sticky top-6 z-10 bg-slate-100 border border-slate-300 px-2 py-1 font-semibold text-slate-700 whitespace-nowrap text-left">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {showRows.map((row, ri) => {
                const excelRow = ri + 2  // header is row 1
                // Highlight whole row if any cell has rule_code
                const ruleHit = cols.some((c) => {
                  const cell = cellMap[`${sheetCode}.rows[${ri}].${c}`]
                  return cell?.trace.some((t) => t.rule_code)
                })
                return (
                  <tr key={ri} className={cn(ruleHit && 'bg-rose-50/30')}>
                    <td className="sticky left-0 z-10 bg-slate-100 border border-slate-300 text-[10px] text-slate-500 text-center font-mono w-9">
                      {excelRow}
                    </td>
                    {cols.map((c) => {
                      const cellKey = `${sheetCode}.rows[${ri}].${c}`
                      const cell = cellMap[cellKey]
                      const kind = cell?.trace[0]?.source_kind
                      const ruleCellHit = !!cell?.trace.some((t) => t.rule_code)
                      const v = row[c]
                      return (
                        <td
                          key={c}
                          onClick={() => cell && onCellClick(cellKey)}
                          title={cell ? `点击查看 ${cellKey} 的本体追溯` : undefined}
                          className={cn(
                            'border border-slate-300 px-2 py-1 whitespace-nowrap font-mono text-[11.5px]',
                            cell && 'cursor-pointer hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-[-2px]',
                            ruleCellHit ? KIND_BG_CLASS.RuleDerived
                              : kind ? (KIND_BG_CLASS[kind] || '')
                              : '',
                            typeof v === 'number' && 'text-right tabular-nums',
                            typeof v === 'boolean' && 'text-center',
                          )}
                        >
                          {formatVal(v)}
                          {ruleCellHit && (
                            <span className="ml-1 text-[9px] text-rose-700">📜</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* Footer: row counts + load more + sheet meta */}
        <div className="border-t border-slate-300 px-3 py-1.5 bg-slate-50 flex items-center text-[11px] text-slate-600">
          <span>共 {rows.length} 行 · 显示 {showRows.length} 行</span>
          {rows.length > rowLimit && onLoadMore && (
            <button onClick={onLoadMore} className="ml-3 text-brand-700 hover:underline">
              再加载 100 行 →
            </button>
          )}
          <span className="ml-auto text-slate-400 font-mono">
            sheet: {sheetCode}
          </span>
        </div>
        <SheetMetaPanel sheetCode={sheetCode} sheetData={sheetData} cellMap={cellMap} onCellClick={onCellClick} />
        <SourceLegend />
      </div>
    )
  }

  // ── Mode: 字段 (summary) ──
  const entries = Object.entries(sheetData).filter(
    ([, v]) => typeof v !== 'object' || v === null,
  ) as Array<[string, any]>
  return (
    <div className="excel-grid-wrap border border-slate-300 rounded bg-white overflow-hidden">
      <div className="overflow-auto" style={{ maxHeight: 600 }}>
        <table className="excel-grid border-collapse text-[12px] font-sans w-full">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 bg-slate-200 border border-slate-300 px-1 text-center text-[10px] text-slate-500 w-9 h-6"></th>
              <th className="sticky top-0 z-20 bg-slate-200 border border-slate-300 text-[10px] text-slate-500 font-normal text-center h-6">A</th>
              <th className="sticky top-0 z-20 bg-slate-200 border border-slate-300 text-[10px] text-slate-500 font-normal text-center h-6">B</th>
            </tr>
            <tr>
              <th className="sticky left-0 z-20 bg-slate-100 border border-slate-300 text-[10px] text-slate-500 text-center w-9">1</th>
              <th className="sticky top-6 z-10 bg-slate-100 border border-slate-300 px-2 py-1 font-semibold text-slate-700 w-1/3 text-left">
                字段
              </th>
              <th className="sticky top-6 z-10 bg-slate-100 border border-slate-300 px-2 py-1 font-semibold text-slate-700 text-left">
                数值
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([k, v], i) => {
              const excelRow = i + 2
              const cellKey = `${sheetCode}.${k}`
              const cell = cellMap[cellKey]
              const kind = cell?.trace[0]?.source_kind
              const ruleHit = !!cell?.trace.some((t) => t.rule_code)
              return (
                <tr key={k}>
                  <td className="sticky left-0 z-10 bg-slate-100 border border-slate-300 text-[10px] text-slate-500 text-center font-mono w-9">
                    {excelRow}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-slate-700 font-mono">{k}</td>
                  <td
                    onClick={() => cell && onCellClick(cellKey)}
                    title={cell ? `点击查看 ${cellKey} 的本体追溯` : undefined}
                    className={cn(
                      'border border-slate-300 px-2 py-1 font-mono whitespace-nowrap',
                      cell && 'cursor-pointer hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-[-2px]',
                      ruleHit ? KIND_BG_CLASS.RuleDerived
                        : kind ? (KIND_BG_CLASS[kind] || '')
                        : '',
                      typeof v === 'number' && 'text-right tabular-nums',
                    )}
                  >
                    {formatVal(v)}
                    {ruleHit && <span className="ml-1 text-[9px] text-rose-700">📜</span>}
                    {cell && !ruleHit && <Info size={9} className="inline ml-1 opacity-40" />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <SheetMetaPanel sheetCode={sheetCode} sheetData={sheetData} cellMap={cellMap} onCellClick={onCellClick} />
      <SourceLegend />
    </div>
  )
}

function SheetMetaPanel({
  sheetCode, sheetData, cellMap, onCellClick,
}: {
  sheetCode: string; sheetData: any; cellMap: Record<string, ProvenanceCell>;
  onCellClick: (key: string) => void
}) {
  const extras = Object.entries(sheetData).filter(
    ([k, v]) => k !== 'rows' && typeof v === 'object' && v !== null && !Array.isArray(v),
  )
  if (extras.length === 0) return null
  return (
    <div className="border-t border-slate-300 px-3 py-2 bg-amber-50/30 space-y-1.5">
      <div className="text-[10px] text-amber-900 uppercase tracking-wider font-semibold">
        Sheet 元数据 / 汇总信息
      </div>
      {extras.map(([k, v]) => (
        <div key={k}>
          <div className="text-[11px] font-semibold text-amber-900 mb-0.5">{k}</div>
          <pre className="text-[10px] text-slate-700 font-mono whitespace-pre-wrap break-all bg-white border border-amber-200 rounded p-1.5 max-h-32 overflow-y-auto">
            {JSON.stringify(v, null, 1).slice(0, 800)}
          </pre>
        </div>
      ))}
    </div>
  )
}

function SourceLegend() {
  return (
    <div className="border-t border-slate-300 bg-slate-50/60 px-3 py-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
      <span className="text-slate-500 font-medium">数据来源色：</span>
      {Object.entries(SOURCE_KIND_TONE).map(([kind, meta]) => (
        <span
          key={kind}
          className={cn(
            'px-1.5 py-0.5 rounded border border-slate-200',
            KIND_BG_CLASS[kind] || 'bg-slate-50',
          )}
        >
          {meta.emoji} {meta.label}
        </span>
      ))}
    </div>
  )
}

function formatVal(v: any): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') {
    if (Number.isInteger(v) && Math.abs(v) < 1e6) return String(v)
    return v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  }
  if (typeof v === 'boolean') return v ? '✓' : '✗'
  return String(v)
}

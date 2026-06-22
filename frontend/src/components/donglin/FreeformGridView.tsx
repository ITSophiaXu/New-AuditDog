/** Excel-like renderer for a RAW 2D grid (freeform working paper sheet).
 *
 * Renders an arbitrary `any[][]` grid faithfully — exactly as the agent authored it
 * in the .xlsx — with row numbers, column letters, number alignment, and the original
 * cell styling (bold + fill captured from the workbook: dark-blue header bands, colored
 * status cells, etc.). Rows with a single leading cell render as full-width section titles.
 */
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

type CellStyle = { b?: number; f?: string }

type Props = {
  grid: any[][]
  ncols?: number
  totalRows?: number
  sheetCode?: string
  rowLimit?: number
  onLoadMore?: () => void
  note?: string
  styles?: Record<string, CellStyle>
}

const COL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const colLetter = (i: number): string => {
  if (i < 26) return COL_LETTERS[i]
  return COL_LETTERS[Math.floor(i / 26) - 1] + COL_LETTERS[i % 26]
}

function isBlank(v: any): boolean {
  return v === null || v === undefined || String(v).trim() === ''
}

function isDark(hex: string): boolean {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b < 140
}

function styleOf(s?: CellStyle): React.CSSProperties | undefined {
  if (!s) return undefined
  const out: React.CSSProperties = {}
  if (s.f) {
    out.backgroundColor = `#${s.f}`
    out.color = isDark(s.f) ? '#fff' : '#1f2937'
  }
  if (s.b) out.fontWeight = 600
  return out
}

function fmt(v: any): string {
  if (isBlank(v)) return ''
  if (typeof v === 'number') {
    if (Number.isInteger(v) && Math.abs(v) < 1e6) return String(v)
    return v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  }
  if (typeof v === 'boolean') return v ? '✓' : '✗'
  return String(v)
}

export default function FreeformGridView({
  grid, ncols, totalRows, sheetCode, rowLimit = 80, onLoadMore, note, styles,
}: Props) {
  const colCount = useMemo(
    () => Math.max(ncols || 0, ...grid.map((r) => r.length), 1),
    [grid, ncols],
  )
  const total = totalRows ?? grid.length
  const showRows = grid.slice(0, rowLimit)
  const st = (ri: number, ci: number) => styleOf(styles?.[`${ri},${ci}`])

  if (!grid || grid.length === 0) {
    return (
      <div className="p-8 text-sm text-slate-500 text-center bg-white border border-slate-200 rounded">
        此表暂无数据
      </div>
    )
  }

  return (
    <div className="excel-grid-wrap border border-slate-300 rounded bg-white overflow-hidden shadow-sm">
      <div className="overflow-auto" style={{ maxHeight: 620 }}>
        <table className="excel-grid border-collapse text-[12px] font-sans">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 bg-slate-200 border border-slate-300 px-1 text-center text-[10px] text-slate-500 w-10 h-6" />
              {Array.from({ length: colCount }).map((_, i) => (
                <th
                  key={i}
                  className="sticky top-0 z-20 bg-slate-200 border border-slate-300 text-[10px] text-slate-500 font-normal text-center h-6 min-w-[92px]"
                >
                  {colLetter(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showRows.map((row, ri) => {
              const excelRow = ri + 1
              const nonBlank = row.filter((c) => !isBlank(c))
              // 单格行（仅首列有值）→ 整行作为分节标题（用原始 fill/bold；无则回退）
              const isSection = nonBlank.length === 1 && !isBlank(row[0])
              const isFirst = ri === 0
              if (isSection) {
                const s0 = st(ri, 0)
                return (
                  <tr key={ri}>
                    <td className="sticky left-0 z-10 bg-slate-100 border border-slate-300 text-[10px] text-slate-400 text-center font-mono w-10">
                      {excelRow}
                    </td>
                    <td
                      colSpan={colCount}
                      style={s0}
                      className={cn(
                        'border border-slate-300 px-2 py-1.5 text-left',
                        !s0 && (isFirst
                          ? 'bg-amber-50 text-amber-900 font-semibold text-[13px]'
                          : 'bg-slate-50 text-slate-700 font-medium'),
                        s0 && 'font-semibold',
                      )}
                    >
                      {fmt(row[0])}
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={ri} className="hover:bg-sky-50/40">
                  <td className="sticky left-0 z-10 bg-slate-100 border border-slate-300 text-[10px] text-slate-400 text-center font-mono w-10">
                    {excelRow}
                  </td>
                  {Array.from({ length: colCount }).map((_, ci) => {
                    const v = row[ci]
                    const num = typeof v === 'number'
                    return (
                      <td
                        key={ci}
                        title={!isBlank(v) ? String(v) : undefined}
                        style={st(ri, ci)}
                        className={cn(
                          'border border-slate-200 px-2 py-1 align-top',
                          'max-w-[320px] truncate',
                          num && 'text-right tabular-nums font-mono text-[11.5px]',
                          typeof v === 'boolean' && 'text-center',
                        )}
                      >
                        {fmt(v)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-300 px-3 py-1.5 bg-slate-50 flex items-center text-[11px] text-slate-600">
        <span>共 {total} 行 · 显示 {Math.min(showRows.length, total)} 行</span>
        {total > rowLimit && onLoadMore && (
          <button onClick={onLoadMore} className="ml-3 text-brand-700 hover:underline">
            再加载 100 行 →
          </button>
        )}
        {note && <span className="ml-3 text-amber-600">· {note}</span>}
        {sheetCode && <span className="ml-auto text-slate-400 font-mono">sheet: {sheetCode}</span>}
      </div>
    </div>
  )
}

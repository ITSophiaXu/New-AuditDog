import { AlertTriangle, CheckCircle2, Plus, Sparkles, Trash2, AlertOctagon } from 'lucide-react'
import type { Sheet, SheetColumn } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { cn, formatMoney } from '@/lib/utils'
import { computeTableCell, sheetAnomalyCount } from './sheet-utils'
import { useCorrection, aiPathSet } from '@/lib/correction-store'

interface Props {
  sheet: Sheet
  rows: Record<string, any>[]
  onChangeRows: (rows: Record<string, any>[]) => void
  paperId?: number
  paperData?: any
}

export function TableSheet({ sheet, rows, onChangeRows, paperId, paperData }: Props) {
  const cols = sheet.columns || []
  const anomalies = sheetAnomalyCount(sheet.code, { rows })
  const isFilled = rows.length > 0
  const totalWidth = cols.reduce((a, c) => a + (c.width || 120), 0) + 60
  const aiPaths = aiPathSet(paperData)

  function setCell(rowIdx: number, colCode: string, value: any) {
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [colCode]: value } : r))
    onChangeRows(next)
  }
  function addRow() {
    const empty: Record<string, any> = {}
    for (const c of cols) {
      if (c.type === 'boolean') empty[c.code] = false
    }
    onChangeRows([...rows, empty])
  }
  function deleteRow(idx: number) {
    onChangeRows(rows.filter((_, i) => i !== idx))
  }

  function openCorrection(rowIdx: number, col: SheetColumn, currentValue: any) {
    if (!paperId) return
    useCorrection.getState().openModal({
      paperId,
      fieldPath: `${sheet.code}.rows[${rowIdx}].${col.code}`,
      fieldLabel: `${sheet.name} · 第 ${rowIdx + 1} 行 · ${col.label}`,
      oldValue: currentValue,
    })
  }

  return (
    <div className="space-y-3">
      {sheet.description && (
        <div className="text-xs text-slate-500 italic flex items-center gap-3">
          <span>{sheet.description}</span>
          <span className="ml-auto flex items-center gap-3 not-italic">
            {isFilled && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
                <Sparkles size={11} /> AI 已填 {rows.length} 行 · 待复核
              </span>
            )}
            {anomalies > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-rose-600">
                <AlertTriangle size={11} /> 待复核 {anomalies}
              </span>
            ) : isFilled ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                <CheckCircle2 size={11} /> 全部正常
              </span>
            ) : null}
          </span>
        </div>
      )}

      <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
        <table className="text-xs" style={{ minWidth: totalWidth }}>
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur border-b border-slate-200">
            <tr>
              <th className="w-10 text-center text-[10px] text-slate-400 font-normal py-2 border-r border-slate-100">
                #
              </th>
              {cols.map((c) => (
                <th
                  key={c.code}
                  style={{ width: c.width }}
                  className={cn(
                    'text-left px-3 py-2 font-medium text-slate-600 border-r border-slate-100 last:border-r-0',
                    c.type === 'money' && 'text-right',
                  )}
                >
                  <div className="flex items-center gap-1">
                    {c.label}
                    {c.computed && <span className="text-[9px] text-slate-400 font-mono">ƒ</span>}
                  </div>
                </th>
              ))}
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const isAnomaly =
                (sheet.code === 'bank_detail' && row.is_anomaly) ||
                (sheet.code === 'cutoff_test' && row.is_proper === false) ||
                (sheet.code === 'cash_count' &&
                  (Number(row.book_amount) || 0) !== (Number(row.physical_amount) || 0))
              return (
                <tr
                  key={ri}
                  className={cn(
                    'group border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40',
                    isAnomaly && 'bg-rose-50/40 hover:bg-rose-50/60',
                  )}
                >
                  <td className="text-center text-[10px] text-slate-400 py-1 border-r border-slate-100">
                    {ri + 1}
                  </td>
                  {cols.map((c) => (
                    <Cell
                      key={c.code}
                      col={c}
                      sheetCode={sheet.code}
                      row={row}
                      aiWritten={aiPaths.has(`${sheet.code}.rows[${ri}].${c.code}`)}
                      onChange={(v) => setCell(ri, c.code, v)}
                      onMarkWrong={() => openCorrection(ri, c, row[c.code])}
                    />
                  ))}
                  <td className="text-center">
                    <button
                      onClick={() => deleteRow(ri)}
                      className="invisible group-hover:visible text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols.length + 2} className="text-center py-10 text-sm text-slate-400">
                  暂无数据 — 让 AI 填写，或手动添加一行
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && hasNumericTotals(sheet) && (
            <tfoot className="bg-slate-50 border-t-2 border-slate-200 sticky bottom-0">
              <tr>
                <td className="text-center text-[10px] text-slate-500 font-medium py-2 border-r border-slate-100">
                  Σ
                </td>
                {cols.map((c) => (
                  <td
                    key={c.code}
                    className={cn(
                      'px-3 py-2 text-slate-700 font-semibold border-r border-slate-100',
                      c.type === 'money' && 'text-right tabular-nums',
                    )}
                  >
                    {c.type === 'money' ? formatMoney(totalForColumn(rows, c, sheet.code)) : ''}
                  </td>
                ))}
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div>
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus size={12} /> 添加行
        </Button>
      </div>
    </div>
  )
}

function Cell({
  col, sheetCode, row, aiWritten, onChange, onMarkWrong,
}: {
  col: SheetColumn
  sheetCode: string
  row: Record<string, any>
  aiWritten?: boolean
  onChange: (v: any) => void
  onMarkWrong?: () => void
}) {
  const raw = row[col.code]
  const aiCellTint = aiWritten ? 'bg-amber-50/40 ring-amber-200/60' : ''

  if (col.computed) {
    const v = computeTableCell(sheetCode, col.code, row)
    const num = typeof v === 'number' ? v : null
    const hot = num != null && Math.abs(num) > 0.01
    return (
      <td className={cn(
        'px-3 py-1.5 text-right tabular-nums border-r border-slate-100',
        hot ? 'text-amber-700 font-medium' : 'text-slate-500',
      )}>
        {num != null ? formatMoney(num) : '—'}
      </td>
    )
  }

  if (col.type === 'boolean') {
    return (
      <td className={cn('px-3 py-1.5 text-center border-r border-slate-100', aiCellTint)}>
        <input
          type="checkbox"
          checked={!!raw}
          onChange={(e) => onChange(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
        />
      </td>
    )
  }

  if (col.type === 'enum' && col.enum) {
    return (
      <td className={cn('px-1 py-0.5 border-r border-slate-100', aiCellTint)}>
        <select
          value={raw ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-7 px-2 text-xs bg-transparent border-0 focus:outline-none focus:bg-white focus:ring-1 focus:ring-brand-500 rounded"
        >
          <option value=""></option>
          {col.enum.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>
    )
  }

  if (col.type === 'money' || col.type === 'number') {
    return (
      <td className={cn('px-1 py-0.5 border-r border-slate-100 text-right group/cell relative', aiCellTint)}>
        <input
          type="number" step="0.01"
          defaultValue={raw ?? ''}
          onBlur={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          className="w-full h-7 px-2 text-xs text-right tabular-nums bg-transparent border-0 focus:outline-none focus:bg-white focus:ring-1 focus:ring-brand-500 rounded"
        />
        {aiWritten && onMarkWrong && (
          <button
            onClick={onMarkWrong}
            className="absolute right-1 top-1/2 -translate-y-1/2 invisible group-hover/cell:visible text-rose-500 hover:bg-rose-50 rounded p-0.5"
            title="这不对"
          >
            <AlertOctagon size={11} />
          </button>
        )}
      </td>
    )
  }

  return (
    <td className={cn('px-1 py-0.5 border-r border-slate-100 group/cell relative', aiCellTint)}>
      <input
        type={col.type === 'date' ? 'date' : 'text'}
        defaultValue={raw ?? ''}
        onBlur={(e) => onChange(e.target.value)}
        className="w-full h-7 px-2 text-xs bg-transparent border-0 focus:outline-none focus:bg-white focus:ring-1 focus:ring-brand-500 rounded"
      />
      {aiWritten && onMarkWrong && (
        <button
          onClick={onMarkWrong}
          className="absolute right-1 top-1/2 -translate-y-1/2 invisible group-hover/cell:visible text-rose-500 hover:bg-rose-50 rounded p-0.5"
          title="这不对"
        >
          <AlertOctagon size={11} />
        </button>
      )}
    </td>
  )
}

function hasNumericTotals(sheet: Sheet): boolean {
  return (sheet.columns || []).some((c) => c.type === 'money' && !c.computed)
}

function totalForColumn(
  rows: Record<string, any>[],
  col: SheetColumn,
  sheetCode: string,
): number {
  if (col.computed) {
    return rows.reduce((sum, r) => sum + (computeTableCell(sheetCode, col.code, r) || 0), 0)
  }
  return rows.reduce((sum, r) => sum + (Number(r[col.code]) || 0), 0)
}

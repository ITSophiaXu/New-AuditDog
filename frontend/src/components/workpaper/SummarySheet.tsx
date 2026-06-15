import { Calculator, CheckCircle2, AlertTriangle, Sparkles, AlertOctagon } from 'lucide-react'
import type { Sheet, SheetField } from '@/lib/types'
import { Input, Textarea } from '@/components/ui/Input'
import { cn, formatMoney } from '@/lib/utils'
import { computeSummaryField } from './sheet-utils'
import { useCorrection, aiPathSet } from '@/lib/correction-store'

interface Props {
  sheet: Sheet
  allSheetData: Record<string, any>
  onChangeField: (fieldCode: string, value: any) => void
  paperId?: number
  paperData?: any
}

export function SummarySheet({ sheet, allSheetData, onChangeField, paperId, paperData }: Props) {
  const sd = allSheetData?.[sheet.code] || {}
  const fields = sheet.fields || []
  const aiPaths = aiPathSet(paperData)

  const computed = fields.filter((f) => f.computed)
  const free = fields.filter((f) => !f.computed)

  return (
    <div className="space-y-4">
      {sheet.description && (
        <div className="text-xs text-slate-500 italic">{sheet.description}</div>
      )}

      {computed.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 bg-slate-50/80 flex items-center gap-2">
            <Calculator size={12} className="text-slate-500" />
            <span className="text-xs font-semibold text-slate-700">自动计算</span>
            <span className="text-[10px] text-slate-400 ml-auto">公式从其他子表汇总</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-px bg-slate-100">
            {computed.map((f) => (
              <ComputedCell key={f.code} field={f} allSheetData={allSheetData} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {free.map((f) => (
          <FreeField
            key={f.code}
            field={f}
            value={sd[f.code]}
            wide={f.type === 'text'}
            aiWritten={aiPaths.has(`${sheet.code}.${f.code}`)}
            onSave={(v) => onChangeField(f.code, v)}
            onMarkWrong={paperId ? () => useCorrection.getState().openModal({
              paperId,
              fieldPath: `${sheet.code}.${f.code}`,
              fieldLabel: f.label,
              oldValue: sd[f.code],
            }) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

function ComputedCell({
  field, allSheetData,
}: { field: SheetField; allSheetData: Record<string, any> }) {
  const v = computeSummaryField(field, allSheetData)
  const num = typeof v === 'number' ? v : null
  let tone: 'ok' | 'warn' | 'neutral' = 'neutral'
  if (field.code === 'bank_diff' || field.code === 'tb_diff') {
    tone = num != null && Math.abs(num) < 0.01 ? 'ok' : Math.abs(num ?? 0) > 1 ? 'warn' : 'neutral'
  }
  return (
    <div className="p-3 bg-white">
      <div className="text-[10px] text-slate-500 flex items-center gap-1">
        {field.label}
        {tone === 'ok' && <CheckCircle2 size={10} className="text-emerald-500" />}
        {tone === 'warn' && <AlertTriangle size={10} className="text-amber-500" />}
      </div>
      <div className={cn(
        'text-base font-semibold tabular-nums mt-0.5',
        tone === 'ok' && 'text-emerald-700',
        tone === 'warn' && 'text-amber-700',
        tone === 'neutral' && 'text-slate-900',
      )}>
        {num != null ? formatMoney(num) : '—'}
      </div>
      {field.formula && (
        <div className="text-[10px] text-slate-400 font-mono mt-1 truncate" title={field.formula}>
          ƒ {field.formula}
        </div>
      )}
    </div>
  )
}

function FreeField({
  field, value, wide, aiWritten, onSave, onMarkWrong,
}: {
  field: SheetField
  value: any
  wide?: boolean
  aiWritten?: boolean
  onSave: (v: any) => void
  onMarkWrong?: () => void
}) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className={cn(wide && 'col-span-2')}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-xs font-medium text-slate-700">{field.label}</label>
        {aiWritten && !empty && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
            <Sparkles size={9} /> AI 写的 · 待复核
          </span>
        )}
        {!aiWritten && !empty && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={9} /> 已确认
          </span>
        )}
        {aiWritten && onMarkWrong && (
          <button
            onClick={onMarkWrong}
            className="ml-auto inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded text-rose-700 hover:bg-rose-50"
            title="把这个标记为不对"
          >
            <AlertOctagon size={9} /> 这不对
          </button>
        )}
      </div>
      {field.type === 'text' ? (
        <Textarea
          defaultValue={value ?? ''}
          rows={3}
          onBlur={(e) => onSave(e.target.value)}
        />
      ) : field.type === 'money' || field.type === 'number' ? (
        <Input
          type="number" step="0.01"
          defaultValue={value ?? ''}
          onBlur={(e) => onSave(e.target.value ? Number(e.target.value) : null)}
        />
      ) : (
        <Input
          defaultValue={value ?? ''}
          onBlur={(e) => onSave(e.target.value)}
        />
      )}
      {field.type === 'money' && !empty && (
        <div className="text-[11px] text-slate-500 mt-1">{formatMoney(Number(value))}</div>
      )}
    </div>
  )
}

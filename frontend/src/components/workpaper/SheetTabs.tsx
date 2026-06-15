import { FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { Sheet } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  sheets: Sheet[]
  active: string
  onSelect: (code: string) => void
  rowCount: Record<string, number>
  anomalyCount: Record<string, number>
  filledMap: Record<string, boolean>
}

export function SheetTabs({ sheets, active, onSelect, rowCount, anomalyCount, filledMap }: Props) {
  return (
    <div className="flex items-stretch gap-px bg-slate-200/60 px-1 pt-1 rounded-t-lg overflow-x-auto">
      {sheets.map((s) => {
        const isActive = s.code === active
        const rows = rowCount[s.code] ?? 0
        const anoms = anomalyCount[s.code] ?? 0
        const filled = filledMap[s.code]
        return (
          <button
            key={s.code}
            onClick={() => onSelect(s.code)}
            className={cn(
              'group inline-flex items-center gap-2 px-3.5 h-9 text-xs whitespace-nowrap',
              'border-x border-t rounded-t-md transition-colors',
              isActive
                ? 'bg-white border-slate-300 text-slate-900 font-medium relative -mb-px'
                : 'bg-slate-50/80 border-transparent text-slate-600 hover:bg-white/70',
            )}
          >
            <FileSpreadsheet size={11} className={isActive ? 'text-brand-600' : 'text-slate-400'} />
            <span>{s.name}</span>
            {s.kind === 'table' && (
              <span className={cn(
                'text-[10px] px-1 rounded',
                isActive ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/60 text-slate-500',
              )}>
                {rows}
              </span>
            )}
            {anoms > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-rose-600">
                <AlertTriangle size={9} /> {anoms}
              </span>
            )}
            {filled && anoms === 0 && (
              <CheckCircle2 size={10} className="text-emerald-500" />
            )}
          </button>
        )
      })}
    </div>
  )
}

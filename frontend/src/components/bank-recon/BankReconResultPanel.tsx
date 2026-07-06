import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

type ReconSheet = { name: string; rows: any[][] }

export default function BankReconResultPanel({ xlsxUrl = '/cases/bank-recon-result-a.xlsx', embedded = false }: { xlsxUrl?: string; embedded?: boolean }) {
  const [sheets, setSheets] = useState<ReconSheet[]>([])
  const [activeSheet, setActiveSheet] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const buf = await fetch(xlsxUrl).then((r) => r.arrayBuffer())
      const wb = XLSX.read(buf, { type: 'array' })
      const next = wb.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false }) as any[][],
      }))
      if (!alive) return
      setSheets(next)
      setActiveSheet(next[0]?.name || '')
    })()
    return () => { alive = false }
  }, [xlsxUrl])

  const current = sheets.find((s) => s.name === activeSheet) || sheets[0]
  const maxCols = Math.max(0, ...(current?.rows || []).map((r) => r.length))

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <span className="text-sm font-medium text-slate-800">银行流水双向核对底稿</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(xlsxUrl, '_blank')}>
            <Download size={13} /> 下载 Excel
          </Button>
        </div>
      </div>
      <div className="px-4 py-2 border-b border-slate-200 flex flex-wrap gap-2 bg-white">
        {sheets.map((sheet) => (
          <button
            key={sheet.name}
            onClick={() => setActiveSheet(sheet.name)}
            className={cn('px-3 py-1 rounded-md text-[12px] border', activeSheet === sheet.name ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
          >
            {sheet.name}
          </button>
        ))}
      </div>
      <div className={cn('overflow-auto bg-white', embedded ? 'max-h-[820px]' : 'max-h-[920px]')}>
        <table className="min-w-full text-[11px] border-collapse">
          <tbody>
            {(current?.rows || []).map((row, rIdx) => (
              <tr key={rIdx} className="border-b border-slate-100">
                {Array.from({ length: maxCols || row.length }).map((_, cIdx) => {
                  const cell = row[cIdx] ?? ''
                  return (
                    <td
                      key={cIdx}
                      className={cn(
                        'px-2 py-1 align-top whitespace-pre-wrap border-r border-slate-100 min-w-[110px] leading-[1.35]',
                        rIdx < 2 ? 'bg-slate-100 font-semibold text-slate-700' : 'text-slate-700',
                        typeof cell === 'string' && (cell.includes('异常') || cell.includes('待确认') || cell.includes('不一致'))
                          ? 'bg-amber-50 text-rose-700 font-medium'
                          : '',
                      )}
                    >
                      {cell as any}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

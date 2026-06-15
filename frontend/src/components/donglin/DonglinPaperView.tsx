import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw, FileSpreadsheet,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  donglinApi, ProvenanceCell, DonglinPaperCode,
} from '@/lib/donglin'
import { cn } from '@/lib/utils'
import { ProvenanceDrawer } from './ProvenanceDrawer'
import ExcelGridView from './ExcelGridView'
import DonglinExcelView from './DonglinExcelView'
import AuditNotesPanel from './AuditNotesPanel'
import AdjustmentEntriesPanel from './AdjustmentEntriesPanel'
import { api } from '@/lib/api'

// 5 张 demo 底稿的中文标题
const DONGLIN_PAPER_TITLE_ZH: Record<string, string> = {
  A1: '货币资金',
  A6: '应收账款',
  A9: '其他应收款',
  A24: '固定资产',
  B1: '短期借款',
}
// 子表中文名
const DONGLIN_SHEET_LABEL_ZH: Record<string, string> = {
  summary: '审定表',
  customer_detail: '客户明细',
  aging_analysis: '账龄分析',
  bank_detail: '银行存款明细',
  cash_count: '库存现金盘点',
  cutoff_test: '截止性测试',
  loan_detail: '借款明细',
  asset_detail: '资产明细',
}


interface Props {
  paperCode: DonglinPaperCode
  paperId: number
  paperData: any
  /** Optional: parent (URL) controlled active sheet. If omitted, internal state is used. */
  activeSheetProp?: string | null
  /** Notify parent (for syncing URL) when user clicks a sheet tab inside. */
  onActiveSheetChange?: (code: string) => void
}

export function DonglinPaperView({
  paperCode, paperId, paperData, activeSheetProp, onActiveSheetChange,
}: Props) {
  const qc = useQueryClient()
  const [internalActiveSheet, setInternalActiveSheet] = useState<string>('')
  const [activeCell, setActiveCell] = useState<{ key: string; cell: ProvenanceCell } | null>(null)
  const [refilling, setRefilling] = useState(false)
  const [rowLimit, setRowLimit] = useState(50)
  const setActiveSheet = (s: string) => {
    setInternalActiveSheet(s)
    onActiveSheetChange?.(s)
  }
  const activeSheet = activeSheetProp ?? internalActiveSheet

  const { data: prov } = useQuery({
    queryKey: ['donglin-provenance', paperCode],
    queryFn: () => donglinApi.getProvenance(paperCode),
  })

  // —— v5: 拉本底稿的 FillRule（按 tpl-<paperCode> 过滤） ——
  const { data: allFillRules = [] } = useQuery({
    queryKey: ['objects', 'FillRule'],
    queryFn: () => api.listObjects('FillRule'),
  })
  const paperFillRules = useMemo(() => {
    const tplKey = `tpl-${paperCode.toLowerCase()}`
    return allFillRules.filter((r) => {
      const t = (r.data as any)?.appliesToWorkpaper || ''
      return t === tplKey || t.startsWith(tplKey + '-')
    })
  }, [allFillRules, paperCode])

  const sheetData = (paperData?.sheet_data || {}) as Record<string, any>
  const sheetCodes = Object.keys(sheetData)

  // 默认选第一个 sheet
  const curSheet = activeSheet || sheetCodes[0] || ''
  const curSheetData = sheetData[curSheet] || {}

  // —— 单元格追溯 quick-lookup ——
  const cellMap = prov?.cells || {}

  async function refill() {
    setRefilling(true)
    try {
      await donglinApi.fill(paperCode)
      await qc.invalidateQueries({ queryKey: ['object', paperId] })
      await qc.invalidateQueries({ queryKey: ['donglin-provenance', paperCode] })
    } finally {
      setRefilling(false)
    }
  }

  function openCell(key: string) {
    const c = cellMap[key]
    if (!c) return
    setActiveCell({ key, cell: c })
  }

  return (
    <div className="space-y-4">
      {/* —— 工具栏 —— */}
      <div className="flex items-center gap-2 px-1">
        <Badge tone="amber">{paperCode}</Badge>
        <span className="text-sm font-medium text-slate-700">{DONGLIN_PAPER_TITLE_ZH[paperCode] || paperCode}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refill}
            disabled={refilling}
          >
            <RefreshCw size={13} className={refilling ? 'animate-spin' : ''} />
            {refilling ? '填稿中…' : '让 Agent 重新填'}
          </Button>
          <a
            href={donglinApi.exportXlsxUrl(paperCode)}
            download={`东林审计_江苏大王_${paperCode}.xlsm`}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
            title={`下载当前底稿 ${paperCode} 的 .xlsm 文件（含 AI 填写结果）`}
          >
            <FileSpreadsheet size={13} /> 下载当前底稿
          </a>
        </div>
      </div>

      {/* —— 异常摘要已移至右侧"审计对话/待确认"面板 —— */}

      {/* —— Sheet Tabs —— */}
      {sheetCodes.length > 1 && (
        <div className="flex items-center gap-1 border-b border-slate-200">
          {sheetCodes.map((sc) => {
            const sd = sheetData[sc]
            const rowCount = Array.isArray(sd?.rows) ? sd.rows.length : 0
            return (
              <button
                key={sc}
                onClick={() => setActiveSheet(sc)}
                className={cn(
                  'px-3 py-2 text-sm border-b-2 -mb-px flex items-center gap-2',
                  curSheet === sc
                    ? 'border-amber-500 text-amber-700 font-medium'
                    : 'border-transparent text-slate-600 hover:text-slate-900',
                )}
              >
                <FileSpreadsheet size={13} />
                {sheetLabel(sc)}
                {rowCount > 0 && (
                  <Badge tone="neutral" className="!h-5">{rowCount}</Badge>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* —— 当前 Sheet 内容 (东林样式 Excel 视图) —— */}
      <DonglinExcelView
        paperIndex={paperCode}
        sheetCode={curSheet}
        sheetData={curSheetData}
        cellMap={cellMap}
        fillRules={paperFillRules}
        onCellClick={openCell}
        rowLimit={rowLimit}
        onLoadMore={() => setRowLimit((n) => n + 100)}
        paperMeta={{
          auditEntity: '江苏大王通风机械有限公司',
          paperCode: paperCode,
          paperTitle: (DONGLIN_PAPER_TITLE_ZH[paperCode] || `${paperCode} 底稿`)
            + (curSheet === 'summary' ? '' : ` · ${DONGLIN_SHEET_LABEL_ZH[curSheet] || curSheet}`),
          period: '2025-01-01 至 2025-12-31',
          preparer: paperData?.filled_by || '王叙超',
          preparedAt: paperData?.filled_at?.slice(0, 10) || '2026-02-28',
          reviewer: '侯佳成',
          reviewedAt: '2026-03-02',
        }}
      />

      {/* —— 审计说明 + 调整分录 (底稿表下方) —— */}
      <AuditNotesPanel
        paperId={paperId}
        paperCode={paperCode}
        paperData={paperData}
      />
      <AdjustmentEntriesPanel
        paperId={paperId}
        paperCode={paperCode}
        paperData={paperData}
      />

      {/* —— Provenance Drawer —— */}
      <ProvenanceDrawer
        cellKey={activeCell?.key || null}
        cell={activeCell?.cell || null}
        onClose={() => setActiveCell(null)}
      />
    </div>
  )
}

function sheetLabel(code: string): string {
  return ({
    summary: '审定表',
    customer_detail: '客户明细',
    aging_analysis: '账龄分析',
    employee_detail: '员工明细',
    asset_detail: '资产明细',
    loan_detail: '借款明细',
    cash_count: '现金盘点',
    bank_detail: '银行明细',
    cutoff_test: '截止测试',
    depreciation: '折旧重算',
    related_guarantee: '关联担保',
    interest_recalc: '利息重算',
  } as Record<string, string>)[code] || code
}


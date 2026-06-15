import type { Sheet, SheetField } from '@/lib/types'

/** Compute a derived value for table cells. Hardcoded for common audit columns. */
export function computeTableCell(
  sheetCode: string,
  columnCode: string,
  row: Record<string, any>,
): number | null {
  if (columnCode !== 'diff') return null
  if (sheetCode === 'bank_detail') {
    const a = Number(row.book_balance) || 0
    const b = Number(row.confirmation_balance) || 0
    return a - b
  }
  if (sheetCode === 'cash_count') {
    const a = Number(row.book_amount) || 0
    const b = Number(row.physical_amount) || 0
    return a - b
  }
  return null
}

/** Compute a derived field for the summary sheet, given all sheet data. */
export function computeSummaryField(
  field: SheetField,
  allSheetData: Record<string, any>,
): number | string | null {
  if (!field.computed) return null
  const bank = allSheetData.bank_detail?.rows || []
  const cash = allSheetData.cash_count?.rows || []
  const sum = (arr: any[], k: string) => arr.reduce((a, r) => a + (Number(r?.[k]) || 0), 0)
  const bankBook = sum(bank, 'book_balance')
  const bankConf = sum(bank, 'confirmation_balance')
  const cashTotal = sum(cash, 'physical_amount')
  switch (field.code) {
    case 'bank_book_total':
      return bankBook
    case 'bank_conf_total':
      return bankConf
    case 'bank_diff':
      return bankBook - bankConf
    case 'cash_total':
      return cashTotal
    case 'book_balance_total':
      return bankBook + cashTotal
    case 'tb_diff': {
      const tb = Number(allSheetData.summary?.tb_balance) || 0
      return bankBook + cashTotal - tb
    }
    default:
      return null
  }
}

/** Count anomaly rows in a sheet, by sheet-specific heuristic. */
export function sheetAnomalyCount(sheetCode: string, sheetData: any): number {
  const rows: any[] = sheetData?.rows || []
  if (sheetCode === 'bank_detail') {
    return rows.filter((r) => r.is_anomaly === true).length
  }
  if (sheetCode === 'cutoff_test') {
    return rows.filter((r) => r.is_proper === false).length
  }
  if (sheetCode === 'cash_count') {
    return rows.filter((r) => (Number(r.book_amount) || 0) !== (Number(r.physical_amount) || 0)).length
  }
  return 0
}

export function sheetRowCount(sheet: Sheet, sheetData: any): number {
  if (sheet.kind !== 'table') return 0
  return sheetData?.rows?.length || 0
}

export function isSheetFilled(sheet: Sheet, sheetData: any): boolean {
  if (sheet.kind === 'table') return (sheetData?.rows?.length || 0) > 0
  if (sheet.kind === 'summary') {
    const fields = sheet.fields || []
    return fields.some((f) => {
      if (f.computed) return false
      const v = sheetData?.[f.code]
      return v !== null && v !== undefined && v !== ''
    })
  }
  return false
}

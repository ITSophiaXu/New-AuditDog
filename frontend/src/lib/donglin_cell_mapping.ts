/** 甲所 5 张 demo 底稿的 sheet_data 字段 → 真实 Excel 单元格地址映射。
 *
 * 用途：
 *   - DonglinExcelView 渲染时把字段定位到真实 sheet!cell（如 A6!C11）
 *   - FillRule 覆盖：让 cell 旁的 ƒ 图标能找到对应的填表规则
 *   - 跨表勾稽：A6 主表的 C11 = A6-2 明细的 F824 等
 *
 * 命名规则：
 *   - 主表 = A6 / A6 / A6 …
 *   - 明细表 = A6-2 / A6-3 …
 *   - 模板里行号约定第 8 行开始为数据行（前 7 行是表头 + 元数据）
 */

export interface CellAddress {
  sheet: string   // 'A6' / 'A6-2'
  cell: string    // 'C11' / 'F824'
}

export type CellMapping = {
  /** 字段路径模板，例 'summary.tb_opening' 或 'customer_detail.rows[*].closing_dr' */
  pathPattern: string
  /** sheet 名 */
  sheet: string
  /** cell 地址或地址模板（含 * 时根据 row index 替换） */
  cellPattern: string
  /** row index 的偏移 (默认 8，即第 8 行起) */
  rowOffset?: number
}

// ── A6 应收账款 ────────────────────────────────────────
const A6_MAPPING: CellMapping[] = [
  // —— summary 主表 (sheet=A6) ——
  { pathPattern: 'summary.tb_opening',           sheet: 'A6', cellPattern: 'C9'  },
  { pathPattern: 'summary.tb_closing_unaudited', sheet: 'A6', cellPattern: 'C11' },
  { pathPattern: 'summary.aux_dr_total',         sheet: 'A6', cellPattern: 'D11' },
  { pathPattern: 'summary.aux_cr_total',         sheet: 'A6', cellPattern: 'E11' },
  { pathPattern: 'summary.aux_net',              sheet: 'A6', cellPattern: 'D9'  },
  { pathPattern: 'summary.tb_vs_aux_diff',       sheet: 'A6', cellPattern: 'F11' },
  { pathPattern: 'summary.reclass_to_advance',   sheet: 'A6', cellPattern: 'C13' },
  { pathPattern: 'summary.customer_count_cr',    sheet: 'A6', cellPattern: 'D13' },
  { pathPattern: 'summary.closing_audited',      sheet: 'A6', cellPattern: 'C20' },
  { pathPattern: 'summary.top5_concentration_pct', sheet: 'A6', cellPattern: 'C19' },
  // —— customer_detail 客户明细 (sheet=A6-2, row 8+i) ——
  { pathPattern: 'customer_detail.rows[*].customer_code',  sheet: 'A6-2', cellPattern: 'B*', rowOffset: 8 },
  { pathPattern: 'customer_detail.rows[*].customer_name',  sheet: 'A6-2', cellPattern: 'C*', rowOffset: 8 },
  { pathPattern: 'customer_detail.rows[*].closing_dr',     sheet: 'A6-2', cellPattern: 'D*', rowOffset: 8 },
  { pathPattern: 'customer_detail.rows[*].closing_cr',     sheet: 'A6-2', cellPattern: 'E*', rowOffset: 8 },
  { pathPattern: 'customer_detail.rows[*].classification', sheet: 'A6-2', cellPattern: 'F*', rowOffset: 8 },
  { pathPattern: 'customer_detail.rows[*].is_top5',        sheet: 'A6-2', cellPattern: 'G*', rowOffset: 8 },
  // —— aging_analysis 账龄分析 (sheet=A6-3, row 8+i) ——
  { pathPattern: 'aging_analysis.rows[*].customer_code', sheet: 'A6-3', cellPattern: 'B*', rowOffset: 8 },
  { pathPattern: 'aging_analysis.rows[*].customer_name', sheet: 'A6-3', cellPattern: 'C*', rowOffset: 8 },
  { pathPattern: 'aging_analysis.rows[*].total',         sheet: 'A6-3', cellPattern: 'D*', rowOffset: 8 },
  { pathPattern: 'aging_analysis.rows[*].within_1y',     sheet: 'A6-3', cellPattern: 'E*', rowOffset: 8 },
  { pathPattern: 'aging_analysis.rows[*].1_to_2y',       sheet: 'A6-3', cellPattern: 'F*', rowOffset: 8 },
  { pathPattern: 'aging_analysis.rows[*].2_to_3y',       sheet: 'A6-3', cellPattern: 'G*', rowOffset: 8 },
  { pathPattern: 'aging_analysis.rows[*].over_3y',       sheet: 'A6-3', cellPattern: 'H*', rowOffset: 8 },
]

// ── A1 货币资金 ────────────────────────────────────────
const A1_MAPPING: CellMapping[] = [
  { pathPattern: 'summary.tb_balance',           sheet: 'A1', cellPattern: 'C9'  },
  { pathPattern: 'summary.book_balance_total',   sheet: 'A1', cellPattern: 'C11' },
  { pathPattern: 'summary.tb_diff',              sheet: 'A1', cellPattern: 'C13' },
  { pathPattern: 'summary.confirmed_balance',    sheet: 'A1', cellPattern: 'D11' },
  { pathPattern: 'bank_detail.rows[*].account_no',  sheet: 'A1-2', cellPattern: 'B*', rowOffset: 8 },
  { pathPattern: 'bank_detail.rows[*].bank_name',   sheet: 'A1-2', cellPattern: 'C*', rowOffset: 8 },
  { pathPattern: 'bank_detail.rows[*].book_balance', sheet: 'A1-2', cellPattern: 'D*', rowOffset: 8 },
  { pathPattern: 'bank_detail.rows[*].confirmation_balance', sheet: 'A1-2', cellPattern: 'E*', rowOffset: 8 },
  { pathPattern: 'cash_count.rows[*].location',  sheet: 'A1-3', cellPattern: 'B*', rowOffset: 8 },
  { pathPattern: 'cash_count.rows[*].book_amount', sheet: 'A1-3', cellPattern: 'C*', rowOffset: 8 },
  { pathPattern: 'cash_count.rows[*].physical_amount', sheet: 'A1-3', cellPattern: 'D*', rowOffset: 8 },
  { pathPattern: 'cutoff_test.rows[*].voucher_no', sheet: 'A1-4', cellPattern: 'B*', rowOffset: 8 },
  { pathPattern: 'cutoff_test.rows[*].voucher_date', sheet: 'A1-4', cellPattern: 'C*', rowOffset: 8 },
  { pathPattern: 'cutoff_test.rows[*].amount', sheet: 'A1-4', cellPattern: 'D*', rowOffset: 8 },
]

// ── A9 其他应收款 ──────────────────────────────────────
const A9_MAPPING: CellMapping[] = [
  { pathPattern: 'summary.tb_balance',         sheet: 'A9', cellPattern: 'C9' },
  { pathPattern: 'summary.reverse_balance',    sheet: 'A9', cellPattern: 'C11' },
  { pathPattern: 'summary.reclass_to_tax',     sheet: 'A9', cellPattern: 'C13' },
  { pathPattern: 'summary.closing_audited',    sheet: 'A9', cellPattern: 'C15' },
  { pathPattern: 'customer_detail.rows[*].customer_code', sheet: 'A9-2', cellPattern: 'B*', rowOffset: 8 },
  { pathPattern: 'customer_detail.rows[*].closing_dr', sheet: 'A9-2', cellPattern: 'D*', rowOffset: 8 },
  { pathPattern: 'customer_detail.rows[*].closing_cr', sheet: 'A9-2', cellPattern: 'E*', rowOffset: 8 },
]

// ── A24 固定资产 ───────────────────────────────────────
const A24_MAPPING: CellMapping[] = [
  { pathPattern: 'summary.opening_cost',         sheet: 'A24', cellPattern: 'C9'  },
  { pathPattern: 'summary.additions',            sheet: 'A24', cellPattern: 'D9'  },
  { pathPattern: 'summary.disposals',            sheet: 'A24', cellPattern: 'E9'  },
  { pathPattern: 'summary.closing_cost',         sheet: 'A24', cellPattern: 'F9'  },
  { pathPattern: 'summary.book_depreciation',    sheet: 'A24', cellPattern: 'C11' },
  { pathPattern: 'summary.recomputed_depreciation', sheet: 'A24', cellPattern: 'D11' },
  { pathPattern: 'summary.depreciation_diff',    sheet: 'A24', cellPattern: 'E11' },
  { pathPattern: 'summary.materiality_judgment', sheet: 'A24', cellPattern: 'F13' },
  { pathPattern: 'asset_detail.rows[*].asset_class', sheet: 'A24-2', cellPattern: 'B*', rowOffset: 8 },
  { pathPattern: 'asset_detail.rows[*].avg_cost', sheet: 'A24-2', cellPattern: 'C*', rowOffset: 8 },
  { pathPattern: 'asset_detail.rows[*].years', sheet: 'A24-2', cellPattern: 'D*', rowOffset: 8 },
  { pathPattern: 'asset_detail.rows[*].recomputed', sheet: 'A24-2', cellPattern: 'E*', rowOffset: 8 },
]

// ── B1 短期借款 ───────────────────────────────────────
const B1_MAPPING: CellMapping[] = [
  { pathPattern: 'summary.tb_balance',         sheet: 'B1', cellPattern: 'C9'  },
  { pathPattern: 'summary.loan_count',         sheet: 'B1', cellPattern: 'D9'  },
  { pathPattern: 'summary.weighted_avg_rate',  sheet: 'B1', cellPattern: 'C11' },
  { pathPattern: 'summary.recomputed_interest', sheet: 'B1', cellPattern: 'D11' },
  { pathPattern: 'summary.book_interest',      sheet: 'B1', cellPattern: 'E11' },
  { pathPattern: 'summary.interest_diff',      sheet: 'B1', cellPattern: 'F11' },
  { pathPattern: 'summary.guarantee_coverage_pct', sheet: 'B1', cellPattern: 'C13' },
  { pathPattern: 'summary.going_concern_flag', sheet: 'B1', cellPattern: 'C15' },
  { pathPattern: 'loan_detail.rows[*].creditor',    sheet: 'B1-2', cellPattern: 'B*', rowOffset: 8 },
  { pathPattern: 'loan_detail.rows[*].principal',   sheet: 'B1-2', cellPattern: 'C*', rowOffset: 8 },
  { pathPattern: 'loan_detail.rows[*].rate',        sheet: 'B1-2', cellPattern: 'D*', rowOffset: 8 },
  { pathPattern: 'loan_detail.rows[*].term_start',  sheet: 'B1-2', cellPattern: 'E*', rowOffset: 8 },
  { pathPattern: 'loan_detail.rows[*].term_end',    sheet: 'B1-2', cellPattern: 'F*', rowOffset: 8 },
  { pathPattern: 'loan_detail.rows[*].guarantor',   sheet: 'B1-2', cellPattern: 'G*', rowOffset: 8 },
]

export const CELL_MAPPINGS: Record<string, CellMapping[]> = {
  A1: A1_MAPPING,
  A6: A6_MAPPING,
  A9: A9_MAPPING,
  A24: A24_MAPPING,
  B1: B1_MAPPING,
}

/** 把字段路径 + 行索引解析成具体 Excel 地址 */
export function resolveCellAddress(
  paperIndex: string,
  pathPattern: string,
  rowIndex?: number,
): CellAddress | null {
  const mappings = CELL_MAPPINGS[paperIndex]
  if (!mappings) return null

  // 直接匹配（无 rows）
  const exact = mappings.find((m) => m.pathPattern === pathPattern)
  if (exact) {
    return { sheet: exact.sheet, cell: exact.cellPattern }
  }

  // 模板匹配（rows[*].field）
  if (rowIndex == null) return null
  for (const m of mappings) {
    if (!m.pathPattern.includes('[*]')) continue
    // 把 [*] 替换为具体 row index 来匹配
    const concrete = m.pathPattern.replace('[*]', `[${rowIndex}]`)
    if (concrete === pathPattern) {
      const row = (m.rowOffset || 8) + rowIndex
      const cell = m.cellPattern.replace('*', String(row))
      return { sheet: m.sheet, cell }
    }
    // 字段后缀也允许通配
    const fieldPart = pathPattern.split('.').pop()
    const mFieldPart = m.pathPattern.split('.').pop()
    if (fieldPart === mFieldPart && pathPattern.includes(`rows[${rowIndex}]`)) {
      const row = (m.rowOffset || 8) + rowIndex
      const cell = m.cellPattern.replace('*', String(row))
      return { sheet: m.sheet, cell }
    }
  }
  return null
}

/** 给定字段路径，返回字段对应的 sheet 名 */
export function getSheetName(paperIndex: string, sheetKey: string): string {
  const m = CELL_MAPPINGS[paperIndex]?.[0]
  if (!m) return sheetKey
  // 找该 sheetKey (summary/customer_detail/aging_analysis...) 对应的 Excel sheet 名
  const found = CELL_MAPPINGS[paperIndex]?.find((mm) => mm.pathPattern.startsWith(sheetKey + '.'))
  return found?.sheet || sheetKey
}

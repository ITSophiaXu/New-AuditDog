/** 甲会计师事务所样式的内嵌 Excel 视图。
 *
 * 与原 ExcelGridView 的区别：
 *   1. 顶部带「甲所模板」navy 横幅 + 元数据表（编制人/复核人/客户/日期）
 *   2. 行号 / 列字母 使用真实 Excel 地址（按 cell_mapping 配置）
 *   3. 每个填好的单元格旁，如果有 FillRule 覆盖，显示 Σ 角标，点击弹 popover 显示公式
 *   4. 数据格按 source_kind 颜色编码（TB / Aux / Voucher / RuleDerived / Computed / Knowledge）
 */
import { useMemo, useState } from 'react'
import { Info, Sigma, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProvenanceCell, SOURCE_KIND_TONE } from '@/lib/donglin'
import { CELL_MAPPINGS, resolveCellAddress } from '@/lib/donglin_cell_mapping'

type Props = {
  paperIndex: string                 // A1 / A6 / A9 / A24 / B1
  sheetCode: string                  // 'summary' / 'customer_detail' / 'aging_analysis' / ...
  sheetData: any                     // 该 sheet 的实际数据
  cellMap: Record<string, ProvenanceCell>  // 4250 cell trace
  fillRules: any[]                   // 当前底稿的所有 FillRule (从 backend 拉回)
  onCellClick: (cellKey: string) => void
  /** 甲所模板 header 元数据 */
  paperMeta?: {
    auditEntity?: string
    paperTitle?: string
    period?: string
    preparer?: string
    preparedAt?: string
    reviewer?: string
    reviewedAt?: string
    paperCode?: string
  }
  rowLimit?: number
  onLoadMore?: () => void
}

const COL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

// 中文列名翻译表 — 完整覆盖 5 张 demo 底稿所有 sheet_data 字段
const COLUMN_LABELS_ZH: Record<string, string> = {
  // ═══ 通用字段 ═══
  preparer: '编制人', prepared_at: '编制日期',
  reviewer: '复核人', reviewed_at: '复核日期',

  // ═══ A1 货币资金 summary ═══
  tb_balance: 'TB 余额', book_balance_total: '账面合计',
  diff_with_tb: '与 TB 差异', opening_balance_total: '期初合计',
  cash_opening: '现金期初', cash_closing: '现金期末',
  bank_opening: '银行存款期初', bank_closing: '银行存款期末',
  other_opening: '其他货币资金期初', other_closing: '其他货币资金期末',
  restricted_total: '受限资金合计',
  // ═══ A1 bank_detail ═══
  sub_code: '科目代码', category: '分类',
  bank_name: '开户行', currency: '币种',
  opening: '期初余额', period_dr: '本期借方', period_cr: '本期贷方',
  book_balance: '账面余额', is_restricted: '是否受限',
  restriction_reason: '受限原因',
  // ═══ A1 cash_count ═══
  count_date: '盘点日期', location: '库存地点',
  book_amount: '账面金额', physical_amount: '盘点金额',
  difference: '差异', counter: '盘点人', supervisor: '监盘人',
  note: '备注',
  // ═══ A1 cutoff_test ═══
  voucher_no: '凭证号', voucher_date: '凭证日期',
  summary: '摘要', account: '科目', amount: '金额',
  should_belong_to: '应属期间', is_proper: '截止合理',

  // ═══ A6 应收账款 summary ═══
  tb_opening: '期初余额',
  tb_closing_unaudited: '期末未审金额',
  tb_closing: '期末余额',
  aux_dr_total: '辅助账借方合计', aux_cr_total: '辅助账贷方合计',
  aux_net: '辅助账净额', tb_vs_aux_diff: 'TB vs 辅助账差异',
  reclass_to_advance: '应重分类至预收',
  closing_audited: '期末审定数', bad_debt_provision: '坏账准备',
  customer_count: '客户总数', customer_count_dr: '借方余额客户数',
  customer_count_cr: '贷方余额客户数',
  top5_concentration_pct: '前 5 大集中度 (%)',
  // ═══ A6 customer_detail ═══
  customer_code: '客户代码', customer_name: '客户名称',
  closing_dr: '期末未审（借）', closing_cr: '期末未审（贷）',
  classification: '审定分类', is_top5: 'Top 5',
  // ═══ A6 aging_analysis ═══
  total: '合计', within_1y: '1 年以内',
  '1_to_2y': '1-2 年', '2_to_3y': '2-3 年', over_3y: '3 年以上',
  computed_total: '计算合计', diff_vs_closing: '与期末差异',
  aging_method: '账龄方法', voucher_count: '凭证笔数',

  // ═══ A9 其他应收款 summary ═══
  tb_1221_total: '1221 总额',
  tb_1133_export_refund: '1133 应收出口退税款',
  tb_1221_other_only: '1221 其他',
  aux_customers: '辅助账客户数',
  reclass_to_tax_payable: '应重分类至应交税费',
  matched_related_parties: '匹配关联方',
  rp_balance_total: '关联方占用合计',
  rp_rule_triggered: 'RP 规则触发',
  rp_threshold_pm: '关联方 PM 阈值',
  // ═══ A9 customer_detail ═══
  is_related_party: '是否关联方', exceeds_pm: '超 PM 阈值',

  // ═══ A24 固定资产 summary ═══
  tb_cost_opening: '原值期初', tb_cost_closing: '原值期末',
  tb_cost_dr: '原值本期借方', tb_cost_cr: '原值本期贷方',
  tb_accum_opening: '累计折旧期初', tb_accum_closing: '累计折旧期末',
  tb_dep_current_period: '本期折旧',
  net_book_value_opening: '净值期初', net_book_value_closing: '净值期末',
  avg_cost: '平均原值', recomputed_dep: '重算折旧',
  diff: '差异', diff_pct: '差异 %', diff_vs_te: '差异 vs TE',
  te: 'TE 容忍误差', sum_threshold: 'SUM 阈值', pm: 'PM 重要性',
  test_level: '测试级别', test_label: '测试结论',
  next_action: '下一步动作', passes_test: '是否通过',
  policy_applied: '适用政策',
  // ═══ A24 recompute_detail ═══
  weight: '权重', estimated_cost: '估算原值',
  salvage_rate: '残值率', useful_life: '使用年限',
  annual_rate: '年折旧率',
  // ═══ A24 movement ═══
  item: '项目', source: '数据源',
  opening_cost: '期初原值', additions: '本期增加', disposals: '本期减少',
  closing_cost: '期末原值', book_depreciation: '账面折旧',
  recomputed_depreciation: '重算折旧', depreciation_diff: '折旧差异',
  materiality_judgment: '重要性判定', asset_class: '资产类别',
  years: '使用年限', recomputed: '重算金额',

  // ═══ B1 短期借款 summary ═══
  tb_period_dr: '本期借方', tb_period_cr: '本期贷方',
  loan_count: '贷款笔数', principal_total: '本金合计',
  weighted_avg_rate: '加权平均利率',
  book_interest_expense: '账面利息支出',
  recomputed_interest_annual: '重算年利息',
  interest_diff: '利息差异', interest_diff_pct: '利息差异 %',
  guarantors: '担保人',
  related_guarantee_ratio: '关联担保覆盖率',
  triggers_going_concern: '触发持续经营关注',
  guarantee_coverage_pct: '担保覆盖率 (%)',
  going_concern_flag: '持续经营标志',
  // ═══ B1 loan_detail ═══
  loan_no: '贷款编号', creditor: '债权人/银行',
  principal: '本金', rate: '利率',
  annual_interest: '年利息', term_start: '起始日',
  term_end: '到期日', guarantor: '担保人',
  guarantee_type: '担保方式',
  confirmation_status: '函证状态',
  // ═══ B1 interest_recompute ═══
  rate_pct: '利率 %', formula: '计算公式',
  recomputed_annual: '重算年息',

  // ═══ 旧字段（兼容已有 cell_mapping） ═══
  tb_diff: 'TB 差异', confirmation_balance: '函证余额',
  confirmed_balance: '函证余额', reverse_balance: '反向余额',
  reclass_to_tax: '应重分类至应交税费',
  account_no: '银行账号',
  is_anomaly: '是否异常',
}

function zhLabel(key: string): string {
  return COLUMN_LABELS_ZH[key] || key
}

// ── 真实甲所模板的「项目」列分类 + 我们的字段到列的映射 ──────────
// 每行格式: [项目名, {列字母: 字段名 | "COMPUTED"}]
// COMPUTED 表示用真实模板公式 G = D + E - F 自动算
type RealTemplateRow = {
  label: string
  fields?: Record<string, string>
  italic?: boolean
}

const REAL_TEMPLATE_ROWS: Record<string, RealTemplateRow[]> = {
  // —— A6 应收账款 ——
  // 真实模板 8 列: A 索引号 / B 项目 / C 上期审定数 / D 期末未审金额
  //               / E 审计借方调整 / F 审计贷方调整 / G 审核确认额 / H 备注
  // 公式: G = D + E - F
  A6: [
    { label: '报表数',  italic: true },
    { label: '明细账',  fields: {
      D: 'tb_closing_unaudited',   // 期末未审 = 3,360,975.70
      E: 'reclass_to_advance',     // 审计借方调整 = 7,114,390.40 (AR-RULE-001 触发)
      F: '__zero__',               // 审计贷方调整 = 0
      G: '__computed_G__',         // = D + E - F = 10,475,366.10
    }},
    { label: '其中：',  italic: true },
    { label: '账面余额', fields: {
      D: 'tb_closing_unaudited',
      E: 'reclass_to_advance',
      F: '__zero__',
      G: '__computed_G__',
    }},
    { label: '坏账准备', italic: true },
    { label: '合计',    fields: {
      D: 'tb_closing_unaudited',
      E: 'reclass_to_advance',
      F: '__zero__',
      G: '__computed_G__',
    }},
    { label: '审核标识', italic: true },
  ],
  // —— A1 货币资金 ——
  A1: [
    { label: '报表数',  italic: true },
    { label: '明细账',  fields: {
      D: 'book_balance_total',
      G: 'book_balance_total',
    }},
    { label: '其中：',  italic: true },
    { label: '现金',     fields: { D: 'cash_total', G: 'cash_total' } },
    { label: '银行存款', fields: { D: 'bank_book_total', G: 'bank_book_total' } },
    { label: '其他货币资金', italic: true },
    { label: '合计',    fields: { D: 'book_balance_total', G: 'book_balance_total' } },
    { label: '审核标识', italic: true },
  ],
  // —— A9 其他应收款 ——
  A9: [
    { label: '报表数',  italic: true },
    { label: '明细账',  fields: { D: 'tb_balance', G: 'closing_audited' } },
    { label: '其中：',  italic: true },
    { label: '应收利息', italic: true },
    { label: '应收股利', italic: true },
    { label: '其他应收款', fields: { D: 'tb_balance', G: 'closing_audited' } },
    { label: '合计',    fields: { D: 'tb_balance', G: 'closing_audited' } },
    { label: '审核标识', italic: true },
  ],
  // —— A24 固定资产 ——
  A24: [
    { label: '报表数',  italic: true },
    { label: '明细账',  fields: { D: 'closing_cost', G: 'closing_cost' } },
    { label: '其中：',  italic: true },
    { label: '一、原值合计', fields: { D: 'closing_cost', G: 'closing_cost' } },
    { label: '二、累计折旧', fields: { D: 'book_depreciation', E: 'recomputed_depreciation', F: 'depreciation_diff' } },
    { label: '合计',    fields: { D: 'closing_cost', G: 'closing_cost' } },
    { label: '审核标识', italic: true },
  ],
  // —— B1 短期借款 ——
  B1: [
    { label: '报表数',  italic: true },
    { label: '明细账',  fields: { D: 'tb_balance', G: 'tb_balance' } },
    { label: '其中：',  italic: true },
    { label: '银行借款', fields: { D: 'tb_balance', G: 'tb_balance' } },
    { label: '合计',    fields: { D: 'tb_balance', G: 'tb_balance' } },
    { label: '审核标识', italic: true },
  ],
}

// 真实模板的 8 列表头 (适用 A1/A6/A9/A24/B1 主表)
const REAL_TEMPLATE_HEADER = [
  { letter: 'A', label: '索引号' },
  { letter: 'B', label: '项    目' },
  { letter: 'C', label: '上期审定数' },
  { letter: 'D', label: '期末未审金额' },
  { letter: 'E', label: '审计借方调整' },
  { letter: 'F', label: '审计贷方调整' },
  { letter: 'G', label: '审核确认额' },
  { letter: 'H', label: '备注' },
]

const KIND_BG_CLASS: Record<string, string> = {
  TB:            'bg-sky-50 text-sky-900',
  Aux:           'bg-emerald-50 text-emerald-900',
  Voucher:       'bg-amber-50 text-amber-900',
  Computed:      'bg-slate-100 text-slate-700',
  RuleDerived:   'bg-rose-100 text-rose-900 font-semibold ring-2 ring-inset ring-rose-300',
  Knowledge:     'bg-violet-50 text-violet-900',
  TemplateConst: 'bg-orange-50 text-orange-800 italic',
}

export default function DonglinExcelView({
  paperIndex, sheetCode, sheetData, cellMap, fillRules,
  onCellClick, paperMeta = {}, rowLimit = 100, onLoadMore,
}: Props) {
  // —— 解析当前 sheet 对应的真实 Excel sheet 名 ——
  const excelSheetName = useMemo(() => {
    const mappings = CELL_MAPPINGS[paperIndex]
    const found = mappings?.find((m) => m.pathPattern.startsWith(sheetCode + '.'))
    return found?.sheet || `${paperIndex}-${sheetCode}`
  }, [paperIndex, sheetCode])

  // —— FillRule 快查（output_field → rule）——
  const fillRuleByField = useMemo(() => {
    const m: Record<string, any> = {}
    for (const r of fillRules) {
      const out = (r.data as any)?.outputField
      if (out) m[out] = r
    }
    return m
  }, [fillRules])

  // —— Popover 状态：被点击的 cell ——
  const [showRule, setShowRule] = useState<{ cellAddr: string; rule: any } | null>(null)

  // —— 找当前 cell 对应的 FillRule ——
  function getFillRule(cellAddr: string): any | null {
    // 把 A6!C11 转成 v5 的 field-a6-c11 命名
    const norm = cellAddr.replace('!', '-').replace(/-/g, '-').toLowerCase()
    const fieldKey = `field-${norm}`
    return fillRuleByField[fieldKey] || null
  }

  const isTable = Array.isArray(sheetData?.rows) && sheetData.rows.length > 0
  const isSummary = !isTable && sheetData && Object.keys(sheetData).some(
    (k) => typeof sheetData[k] !== 'object' || sheetData[k] === null,
  )

  return (
    <div className="donglin-excel-view border border-slate-300 rounded-lg overflow-hidden bg-white shadow-sm">
      {/* —— 甲所样式 header —— */}
      <DonglinHeader
        sheetCode={excelSheetName}
        meta={paperMeta}
      />

      {/* —— Excel 主体 —— */}
      {!sheetData || (!isTable && !isSummary) ? (
        <div className="p-10 text-sm text-slate-500 text-center bg-slate-50">
          此 sheet 尚未填稿
        </div>
      ) : isTable ? (
        <TableModeGrid
          sheetData={sheetData}
          excelSheetName={excelSheetName}
          sheetCode={sheetCode}
          paperIndex={paperIndex}
          cellMap={cellMap}
          getFillRule={getFillRule}
          onCellClick={onCellClick}
          onShowRule={setShowRule}
          rowLimit={rowLimit}
          onLoadMore={onLoadMore}
        />
      ) : (
        <SummaryModeGrid
          sheetData={sheetData}
          excelSheetName={excelSheetName}
          sheetCode={sheetCode}
          paperIndex={paperIndex}
          cellMap={cellMap}
          getFillRule={getFillRule}
          onCellClick={onCellClick}
          onShowRule={setShowRule}
        />
      )}

      {/* —— Source kind 图例 —— */}
      <SourceKindLegend />

      {/* —— FillRule popover —— */}
      {showRule && <FillRulePopover info={showRule} onClose={() => setShowRule(null)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// 甲所样式 header
// ═══════════════════════════════════════════════════════════
function DonglinHeader({ sheetCode, meta }: {
  sheetCode: string
  meta: NonNullable<Props['paperMeta']>
}) {
  // 模仿真实甲所 .xlsm 的 5 行元数据布局
  return (
    <div className="donglin-header" style={{ borderBottom: '2px solid #1e3a8a', background: '#fafbfc' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
        <tbody>
          {/* Row 1: 事务所名 + 编制人 */}
          <tr>
            <td style={{...firmRow, width: '70%'}}>
              <strong style={{ color: '#1e3a8a' }}>甲会计师事务所有限公司</strong>
            </td>
            <td style={metaLabelRight}>编&nbsp;&nbsp;制：</td>
            <td style={metaValue}>{meta.preparer || '王叙超'}</td>
          </tr>
          {/* Row 2: 编制日期 */}
          <tr>
            <td style={firmRow}></td>
            <td style={metaLabelRight}>日&nbsp;&nbsp;期：</td>
            <td style={metaValue}>{meta.preparedAt || '2026-02-28'}</td>
          </tr>
          {/* Row 3: 被审计单位 + 复核人 */}
          <tr>
            <td style={firmRow}>被审计单位：<strong>{meta.auditEntity || '甲公司（通风机械）'}</strong></td>
            <td style={metaLabelRight}>复&nbsp;&nbsp;核：</td>
            <td style={metaValue}>{meta.reviewer || '侯佳成'}</td>
          </tr>
          {/* Row 4: 项目 + 复核日期 */}
          <tr>
            <td style={firmRow}>项&nbsp;&nbsp;&nbsp;&nbsp;目：<strong>{meta.paperTitle || sheetCode}</strong></td>
            <td style={metaLabelRight}>日&nbsp;&nbsp;期：</td>
            <td style={metaValue}>{meta.reviewedAt || '2026-03-02'}</td>
          </tr>
          {/* Row 5: 基准日 + 索引号 */}
          <tr>
            <td style={firmRow}>项目基准日：<strong>{meta.period?.split('至')[1]?.trim() || '2025-12-31'}</strong></td>
            <td style={metaLabelRight}>索&nbsp;&nbsp;引：</td>
            <td style={{...metaValue, fontFamily: 'monospace', fontWeight: 700, color: '#1e3a8a'}}>{sheetCode}</td>
          </tr>
          {/* Row 6: sheet 大标题 (居中) */}
          <tr>
            <td colSpan={3} style={{
              padding: '8px 12px', textAlign: 'center',
              fontSize: 14, fontWeight: 700, color: '#1e3a8a',
              background: '#e0e7ff', borderTop: '1px solid #c7d2fe',
              borderBottom: '1px solid #c7d2fe',
            }}>
              {meta.paperTitle || sheetCode}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const firmRow: React.CSSProperties = {
  padding: '3px 12px',
  borderRight: '1px solid #e5e7eb',
  fontSize: 11.5,
  color: '#1e293b',
}
const metaLabelRight: React.CSSProperties = {
  padding: '3px 8px',
  textAlign: 'right',
  color: '#64748b',
  fontSize: 11,
  width: 60,
  background: '#f1f5f9',
  borderRight: '1px solid #e5e7eb',
  borderLeft: '1px solid #e5e7eb',
}

const metaLabel: React.CSSProperties = {
  padding: '4px 10px',
  width: 80,
  textAlign: 'right',
  color: '#64748b',
  fontSize: 11,
  borderRight: '1px solid #e5e7eb',
  borderBottom: '1px solid #e5e7eb',
  background: '#f1f5f9',
}
const metaValue: React.CSSProperties = {
  padding: '4px 10px',
  borderRight: '1px solid #e5e7eb',
  borderBottom: '1px solid #e5e7eb',
  color: '#1e293b',
  fontWeight: 500,
}

// ═══════════════════════════════════════════════════════════
// 表格模式 (rows 数组)
// ═══════════════════════════════════════════════════════════
function TableModeGrid({
  sheetData, excelSheetName, sheetCode, paperIndex, cellMap,
  getFillRule, onCellClick, onShowRule, rowLimit, onLoadMore,
}: any) {
  const rows = sheetData.rows as any[]
  const cols = Object.keys(rows[0] || {})
  const showRows = rows.slice(0, rowLimit)

  return (
    <div className="overflow-auto" style={{ maxHeight: 600 }}>
      <table className="excel-grid border-collapse text-[12px] w-full">
        <thead>
          {/* Excel 列字母（A B C D ...） */}
          <tr>
            <th
              className="sticky top-0 left-0 z-30 border border-slate-300 px-1 text-center w-12 h-6"
              style={{ background: '#1e3a8a', color: 'white', fontSize: 10, fontWeight: 600 }}
            >
              {excelSheetName}
            </th>
            {cols.map((_: any, i: number) => (
              <th
                key={i}
                className="sticky top-0 z-20 border border-slate-300 text-center h-6"
                style={{ background: '#cbd5e1', color: '#1e3a8a', fontSize: 11, fontWeight: 700 }}
              >
                {COL_LETTERS[i + 1] || `+${i}`}{/* B 开始，因为 A 留给行号label */}
              </th>
            ))}
          </tr>
          {/* 第 8 行：模板表头（中文字段名） */}
          <tr>
            <th
              className="sticky left-0 z-20 border border-slate-300 text-center w-12"
              style={{ background: '#cbd5e1', color: '#1e3a8a', fontSize: 10, fontWeight: 700 }}
            >
              8
            </th>
            {cols.map((c: string) => (
              <th
                key={c}
                className="sticky top-6 z-10 border border-slate-300 px-2 py-1 whitespace-nowrap text-left"
                style={{ background: '#fafbfc', color: '#1e293b', fontWeight: 600, fontSize: 11.5 }}
                title={`原字段: ${c}`}
              >
                {zhLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {showRows.map((row: any, ri: number) => {
            const excelRow = ri + 9
            // 该行是否触发了规则？
            const ruleHit = cols.some((c: string) => {
              const cellKey = `${sheetCode}.rows[${ri}].${c}`
              return cellMap[cellKey]?.trace.some((t: any) => t.rule_code)
            })
            return (
              <tr key={ri} className={cn(ruleHit && 'bg-rose-50/30')}>
                <td
                  className="sticky left-0 z-10 border border-slate-300 text-center font-mono w-12"
                  style={{ background: '#cbd5e1', color: '#1e3a8a', fontSize: 10, fontWeight: 700 }}
                >
                  {excelRow}
                </td>
                {cols.map((c: string, ci: number) => {
                  const cellKey = `${sheetCode}.rows[${ri}].${c}`
                  const cell = cellMap[cellKey]
                  const kind = cell?.trace[0]?.source_kind
                  const ruleCellHit = !!cell?.trace.some((t: any) => t.rule_code)
                  const v = row[c]
                  // 这格的真实 Excel 地址
                  const colLetter = COL_LETTERS[ci + 1] || ''
                  const excelAddr = `${excelSheetName}!${colLetter}${excelRow}`
                  const fillRule = getFillRule(excelAddr)
                  return (
                    <td
                      key={c}
                      className={cn(
                        'border border-slate-300 px-2 py-1 whitespace-nowrap font-mono text-[11.5px] relative',
                        cell && 'cursor-pointer',
                        ruleCellHit ? KIND_BG_CLASS.RuleDerived
                          : kind ? (KIND_BG_CLASS[kind] || '')
                          : '',
                        typeof v === 'number' && 'text-right tabular-nums',
                        typeof v === 'boolean' && 'text-center',
                      )}
                      onClick={() => cell && onCellClick(cellKey)}
                      title={cell ? `${excelAddr} · 点击查看追溯` : excelAddr}
                    >
                      {formatVal(v)}
                      {ruleCellHit && <span className="ml-1 text-[9px] text-rose-700">📜</span>}
                      {fillRule && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            onShowRule({ cellAddr: excelAddr, rule: fillRule })
                          }}
                          className="absolute top-0 right-0 inline-flex items-center justify-center w-3.5 h-3.5 bg-violet-600 text-white text-[8px] font-bold cursor-pointer hover:bg-violet-700"
                          title={`Σ FillRule: ${fillRule.display_name}`}
                          style={{ borderRadius: '0 0 0 4px' }}
                        >
                          ƒ
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="border-t border-slate-300 px-3 py-1.5 bg-slate-50 flex items-center text-[11px] text-slate-600">
        <span>共 {rows.length} 行 · 显示 {showRows.length} 行</span>
        {rows.length > rowLimit && onLoadMore && (
          <button onClick={onLoadMore} className="ml-3 text-brand-700 hover:underline">
            再加载 100 行 →
          </button>
        )}
        <span className="ml-auto text-slate-400 font-mono">
          sheet: {excelSheetName} · 数据从第 9 行开始
        </span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// 字段模式 (审定表) — 用真实甲所模板的 8 列 × N 行
// ═══════════════════════════════════════════════════════════
function SummaryModeGrid({
  sheetData, excelSheetName, sheetCode, paperIndex, cellMap,
  getFillRule, onCellClick, onShowRule,
}: any) {
  // —— 真实模板模式：用预定义的 项目 行 + 8 列结构 ——
  const realRows = REAL_TEMPLATE_ROWS[paperIndex]
  if (realRows && excelSheetName === paperIndex) {
    return (
      <RealTemplateGrid
        rows={realRows}
        excelSheetName={excelSheetName}
        sheetData={sheetData}
        sheetCode={sheetCode}
        paperIndex={paperIndex}
        cellMap={cellMap}
        getFillRule={getFillRule}
        onCellClick={onCellClick}
        onShowRule={onShowRule}
      />
    )
  }
  // —— 老的字段模式（fallback）——
  return (
    <FallbackSummaryGrid
      sheetData={sheetData}
      excelSheetName={excelSheetName}
      sheetCode={sheetCode}
      paperIndex={paperIndex}
      cellMap={cellMap}
      getFillRule={getFillRule}
      onCellClick={onCellClick}
      onShowRule={onShowRule}
    />
  )
}

// ═══════════════════════════════════════════════════════════
// 真实甲所模板 8 列 N 行表格
// ═══════════════════════════════════════════════════════════
function RealTemplateGrid({
  rows, excelSheetName, sheetData, sheetCode, paperIndex, cellMap,
  getFillRule, onCellClick, onShowRule,
}: {
  rows: RealTemplateRow[]
  excelSheetName: string
  sheetData: any
  sheetCode: string
  paperIndex: string
  cellMap: any
  getFillRule: (addr: string) => any
  onCellClick: (key: string) => void
  onShowRule: (info: any) => void
}) {
  return (
    <div className="overflow-auto" style={{ maxHeight: 600 }}>
      <table className="excel-grid border-collapse text-[12px] w-full">
        <thead>
          {/* 列字母 A B C D ... */}
          <tr>
            <th
              className="sticky top-0 left-0 z-30 border border-slate-300 px-1 text-center w-10 h-6"
              style={{ background: '#1e3a8a', color: 'white', fontSize: 10, fontWeight: 600 }}
            >
              {excelSheetName}
            </th>
            {REAL_TEMPLATE_HEADER.map((c) => (
              <th
                key={c.letter}
                className="sticky top-0 z-20 border border-slate-300 text-center h-6"
                style={{ background: '#cbd5e1', color: '#1e3a8a', fontSize: 11, fontWeight: 700 }}
              >
                {c.letter}
              </th>
            ))}
          </tr>
          {/* 真实模板表头 (行 7) */}
          <tr>
            <th
              className="sticky left-0 z-20 border border-slate-300 text-center w-10"
              style={{ background: '#cbd5e1', color: '#1e3a8a', fontSize: 10, fontWeight: 700 }}
            >
              7
            </th>
            {REAL_TEMPLATE_HEADER.map((c) => (
              <th
                key={c.letter}
                className="sticky top-6 z-10 border border-slate-300 px-2 py-1 whitespace-nowrap"
                style={{ background: '#fafbfc', color: '#1e293b', fontWeight: 600, fontSize: 11.5, textAlign: 'center' }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((tplRow, ri) => {
            const excelRow = 8 + ri
            return (
              <tr key={ri}>
                {/* 行号 */}
                <td
                  className="sticky left-0 z-10 border border-slate-300 text-center font-mono w-10"
                  style={{ background: '#cbd5e1', color: '#1e3a8a', fontSize: 10, fontWeight: 700 }}
                >
                  {excelRow}
                </td>
                {/* A 列：索引号 */}
                <td className="border border-slate-300 px-2 py-1 text-center text-slate-400 font-mono text-[10px]">
                  {/* 索引号通常为空 */}
                </td>
                {/* B 列：项目 */}
                <td
                  className="border border-slate-300 px-3 py-1 font-medium"
                  style={{
                    background: tplRow.italic ? '#f8fafc' : '#fafbfc',
                    color: tplRow.italic ? '#94a3b8' : '#1e3a8a',
                    fontStyle: tplRow.italic ? 'italic' : 'normal',
                  }}
                >
                  {tplRow.label}
                </td>
                {/* C-H 列：根据 fields 映射取值 (支持 __zero__ 和 __computed_G__) */}
                {['C', 'D', 'E', 'F', 'G', 'H'].map((colLetter) => {
                  const fieldName = tplRow.fields?.[colLetter]
                  // —— 处理 __zero__: 模板规定该格为 0 ——
                  // —— 处理 __computed_G__: 用真实模板公式 G = D + E - F 计算 ——
                  let value: any
                  let displayHint = ''
                  if (fieldName === '__zero__') {
                    value = 0
                    displayHint = '模板默认 0'
                  } else if (fieldName === '__computed_G__') {
                    const dField = tplRow.fields?.D
                    const eField = tplRow.fields?.E
                    const fField = tplRow.fields?.F
                    const d = dField === '__zero__' ? 0 : (sheetData[dField || ''] ?? 0)
                    const e = eField === '__zero__' ? 0 : (sheetData[eField || ''] ?? 0)
                    const f = fField === '__zero__' ? 0 : (sheetData[fField || ''] ?? 0)
                    value = (typeof d === 'number' ? d : 0)
                          + (typeof e === 'number' ? e : 0)
                          - (typeof f === 'number' ? f : 0)
                    displayHint = `公式: D+E-F = ${value.toLocaleString('zh-CN',{maximumFractionDigits:2})}`
                  } else {
                    value = fieldName ? sheetData[fieldName] : undefined
                  }
                  const cellKey = fieldName && !fieldName.startsWith('__') ? `${sheetCode}.${fieldName}` : ''
                  const cellTrace = cellKey ? cellMap[cellKey] : null
                  const kind = cellTrace?.trace[0]?.source_kind
                  const ruleHit = !!cellTrace?.trace.some((t: any) => t.rule_code)
                  const excelAddr = `${excelSheetName}!${colLetter}${excelRow}`
                  const fillRule = getFillRule(excelAddr)
                  const isComputed = fieldName === '__computed_G__'

                  return (
                    <td
                      key={colLetter}
                      className={cn(
                        'border border-slate-300 px-2 py-1 font-mono whitespace-nowrap relative',
                        cellTrace && 'cursor-pointer',
                        isComputed && 'bg-violet-50 text-violet-900 font-semibold',
                        !isComputed && (ruleHit ? KIND_BG_CLASS.RuleDerived
                          : kind ? (KIND_BG_CLASS[kind] || '') : ''),
                        typeof value === 'number' && 'text-right tabular-nums',
                      )}
                      onClick={() => cellTrace && onCellClick(cellKey)}
                      title={isComputed ? displayHint
                            : fieldName ? `${excelAddr} · 字段=${fieldName}` : excelAddr}
                    >
                      {value !== undefined ? formatVal(value) : ''}
                      {isComputed && <span className="ml-1 text-[9px] text-violet-700">Σ</span>}
                      {!isComputed && ruleHit && <span className="ml-1 text-[9px] text-rose-700">📜</span>}
                      {fillRule && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            onShowRule({ cellAddr: excelAddr, rule: fillRule })
                          }}
                          className="absolute top-0 right-0 inline-flex items-center justify-center w-3.5 h-3.5 bg-violet-600 text-white text-[8px] font-bold cursor-pointer hover:bg-violet-700"
                          title={`Σ FillRule: ${fillRule.display_name}`}
                          style={{ borderRadius: '0 0 0 4px' }}
                        >
                          ƒ
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="border-t border-slate-300 px-3 py-1.5 bg-slate-50 flex items-center text-[11px] text-slate-600">
        <span>真实甲所 .xlsm 模板 · 8 列 × {rows.length} 行 · 数据从第 8 行起</span>
        <span className="ml-auto text-slate-400">空格 = 模板里待填或不适用</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// Fallback summary (字段名 -> 数值) — 仅当 paperIndex 没有 REAL_TEMPLATE_ROWS 时
// ═══════════════════════════════════════════════════════════
function FallbackSummaryGrid({
  sheetData, excelSheetName, sheetCode, paperIndex, cellMap,
  getFillRule, onCellClick, onShowRule,
}: any) {
  const entries = Object.entries(sheetData).filter(
    ([, v]) => typeof v !== 'object' || v === null,
  ) as Array<[string, any]>

  // 把字段排序到模板里的真实行号位置
  const entriesWithAddr = entries.map(([k, v]) => {
    const addr = resolveCellAddress(paperIndex, `${sheetCode}.${k}`)
    return { key: k, value: v, sheet: addr?.sheet || excelSheetName, cell: addr?.cell || '?' }
  })
  // 按 cell 行号排序
  entriesWithAddr.sort((a, b) => {
    const aRow = parseInt(a.cell.replace(/[A-Z]/g, '')) || 0
    const bRow = parseInt(b.cell.replace(/[A-Z]/g, '')) || 0
    return aRow - bRow
  })

  return (
    <div className="overflow-auto" style={{ maxHeight: 600 }}>
      <table className="excel-grid border-collapse text-[12px] w-full">
        <thead>
          <tr>
            <th
              className="sticky top-0 left-0 z-30 border border-slate-300 px-1 text-center w-12 h-6"
              style={{ background: '#1e3a8a', color: 'white', fontSize: 10, fontWeight: 600 }}
            >
              {excelSheetName}
            </th>
            {['B', 'C'].map((L) => (
              <th
                key={L}
                className="sticky top-0 z-20 border border-slate-300 text-center h-6"
                style={{ background: '#cbd5e1', color: '#1e3a8a', fontSize: 11, fontWeight: 700 }}
              >
                {L}
              </th>
            ))}
          </tr>
          <tr>
            <th
              className="sticky left-0 z-20 border border-slate-300 text-center w-12"
              style={{ background: '#cbd5e1', color: '#1e3a8a', fontSize: 10, fontWeight: 700 }}
            >
              8
            </th>
            <th
              className="sticky top-6 z-10 border border-slate-300 px-2 py-1"
              style={{ background: '#fafbfc', color: '#1e293b', fontWeight: 600, fontSize: 11.5 }}
            >
              项目
            </th>
            <th
              className="sticky top-6 z-10 border border-slate-300 px-2 py-1"
              style={{ background: '#fafbfc', color: '#1e293b', fontWeight: 600, fontSize: 11.5 }}
            >
              数值
            </th>
          </tr>
        </thead>
        <tbody>
          {entriesWithAddr.map(({ key, value, sheet, cell }) => {
            const row = cell.replace(/[A-Z]/g, '')
            const cellKey = `${sheetCode}.${key}`
            const cellTrace = cellMap[cellKey]
            const kind = cellTrace?.trace[0]?.source_kind
            const ruleHit = !!cellTrace?.trace.some((t: any) => t.rule_code)
            const excelAddr = `${sheet}!${cell}`
            const fillRule = getFillRule(excelAddr)
            return (
              <tr key={key}>
                <td
                  className="sticky left-0 z-10 border border-slate-300 text-center font-mono w-12"
                  style={{ background: '#cbd5e1', color: '#1e3a8a', fontSize: 10, fontWeight: 700 }}
                >
                  {row}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-slate-700" title={`原字段: ${key}`}>
                  {zhLabel(key)}
                </td>
                <td
                  className={cn(
                    'border border-slate-300 px-2 py-1 font-mono whitespace-nowrap relative',
                    cellTrace && 'cursor-pointer',
                    ruleHit ? KIND_BG_CLASS.RuleDerived
                      : kind ? (KIND_BG_CLASS[kind] || '')
                      : '',
                    typeof value === 'number' && 'text-right tabular-nums',
                  )}
                  onClick={() => cellTrace && onCellClick(cellKey)}
                  title={`${excelAddr} · ${cellTrace ? '点击查看追溯' : ''}`}
                >
                  {formatVal(value)}
                  {ruleHit && <span className="ml-1 text-[9px] text-rose-700">📜</span>}
                  {cellTrace && !ruleHit && <Info size={9} className="inline ml-1 opacity-40" />}
                  {fillRule && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        onShowRule({ cellAddr: excelAddr, rule: fillRule })
                      }}
                      className="absolute top-0 right-0 inline-flex items-center justify-center w-3.5 h-3.5 bg-violet-600 text-white text-[8px] font-bold cursor-pointer hover:bg-violet-700"
                      title={`Σ FillRule: ${fillRule.display_name}`}
                      style={{ borderRadius: '0 0 0 4px' }}
                    >
                      ƒ
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
function FillRulePopover({ info, onClose }: { info: any; onClose: () => void }) {
  const r = info.rule.data
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.3)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-slate-200">
          <Sigma size={16} className="text-violet-600 mr-2" />
          <div className="flex-1">
            <div className="text-sm font-semibold">FillRule · {info.cellAddr}</div>
            <div className="text-xs text-slate-500 font-mono">{r.code}</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3 text-[12.5px]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              规则种类
            </div>
            <span className="inline-block px-2 py-0.5 rounded bg-violet-100 text-violet-700 text-[11px] font-medium">
              {r.hasRuleKind || 'rule'}
            </span>
          </div>
          {r.hasFormulaExpression && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Excel 公式表达式
              </div>
              <code className="block bg-slate-900 text-emerald-300 px-3 py-2 rounded font-mono text-[12px]">
                {r.hasFormulaExpression}
              </code>
            </div>
          )}
          {r.inputFields && r.inputFields.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                输入字段（这些 cell 必须先填好）
              </div>
              <ul className="space-y-1">
                {r.inputFields.map((f: string) => (
                  <li
                    key={f}
                    className="text-[11px] font-mono bg-amber-50 text-amber-800 px-2 py-1 rounded border border-amber-200"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.hasEvidenceRef && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                证据引用
              </div>
              <code className="text-[10.5px] text-slate-600 font-mono break-all">
                {r.hasEvidenceRef}
              </code>
            </div>
          )}
          <div className="pt-2 border-t border-slate-100 text-[10.5px] text-slate-500">
            <strong>层级：</strong> {r._layer || 'L3:donglin'} ·
            <strong>来源：</strong> {r._source || 'v5'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
function SourceKindLegend() {
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
      <span className="ml-3 text-slate-500">·</span>
      <span className="inline-flex items-center gap-1 text-violet-700">
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 bg-violet-600 text-white text-[8px] font-bold rounded">
          ƒ
        </span>
        点击 = 查看 v5 模板公式 (FillRule)
      </span>
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

/**
 * PlanningPaperView — 计划阶段底稿「东林 Excel 样式」渲染器
 * 复现 DonglinExcelView 的 navy header + 表格网格样式
 * 支持 Y1 / Y2 / Y3 / Y4 / Y5 / Y8 / X1 / X4
 */
import { cn } from '@/lib/utils'

interface Props {
  paperIndex: string
  paperName: string
  paperData: any
  /** 当前选中的 sheet_data key（来自左侧导航 ?sheet= 参数）*/
  activeSheet?: string | null
  onActiveSheetChange?: (sheet: string) => void
}

// ---- 中文字段名映射 ----
const FIELD_LABELS: Record<string, string> = {
  name: '公司名称', short_name: '简称', reg_no: '统一社会信用代码',
  reg_capital: '注册资本', address: '注册地址', legal_rep: '法定代表人',
  industry: '行业', founded: '成立日期', fiscal_year: '会计年度',
  accounting_std: '适用准则', employees: '员工人数',
  main_products: '主要产品', sales_model: '销售模式',
  major_customers: '主要客户', major_suppliers: '主要供应商',
  revenue: '营业收入', total_assets: '总资产', net_assets: '净资产',
  net_profit: '净利润', st_loan: '短期借款', cash: '货币资金',
  time_deposit: '定期存款', ar_audited: '应收账款（审定）',
  entity_understanding: '了解被审单位',
  industry_background: '行业背景', business_model: '商业模式',
  regulatory_environment: '法律法规环境', ownership_and_governance: '股权与治理',
  financial_performance: '主要财务指标', going_concern_indicators: '持续经营指标',
  trend: '趋势', company_info: '基本信息', business_overview: '业务概况',
  key_financials: '关键财务数据',
  entity_level_controls: '实体层面控制',
  governance: '治理结构', commitment_to_competence: '人员胜任',
  risk_assessment_process: '风险评估流程', information_systems: '信息系统',
  monitoring: '监控机制', overall_control_risk: '整体控制风险',
  planned_response: '拟采用的审计响应',
  description: '描述', risk: '风险等级', notes: '备注',
  basis_analysis: '基准比较分析',
  basis: '基准指标', amount: '金额', ratio: '比率', pm_result: 'PM 结果',
  recommended: '推荐', reason: '理由',
  conclusion: '结论', selected_basis: '选定基准', selected_amount: '基准金额',
  selected_ratio: '适用比率', pm: '重要性水平(PM)', te: '执行重要性(TE)',
  te_ratio_of_pm: 'TE/PM 比率', conclusion_text: '结论说明',
  scale_judgement: '小企业规模判断', going_concern: '持续经营评估',
  is_small_entity: '适用小企业准则', applicable_standard: '适用准则',
  scale_basis: '判断依据',
  risk_level: '风险等级', indicators: '关注指标',
  indicator: '指标', value: '金额/数值', concern: '关注事项',
  risk_matrix: '重大错报风险矩阵',
  risk_id: '风险编号', risk_desc: '风险描述',
  likelihood: '发生可能性', impact: '影响程度',
  inherent_risk: '固有风险', control_risk: '控制风险',
  detection_risk: '检查风险', combined_risk: '综合风险',
  response: '应对措施',
  control_environment: '控制环境', key_cycles: '主要业务循环',
  scale: '规模', risk_appetite: '风险偏好', overall_assessment: '整体评估',
  cycle: '循环', control_description: '控制描述',
  identified_weakness: '已识别缺陷', reliance: '拟依赖控制',
  walkthrough_steps: '穿行测试步骤', control_gaps: '控制缺陷',
  step: '步骤', detail: '详情', gap: '缺陷描述', impact_to_audit: '对审计的影响',
  preparer: '编制人', prepared_at: '编制日期',
  rows: '明细行', selected: '是否选定',
  // A1 货币资金
  cash_on_hand: '库存现金', bank_deposits: '银行存款', other_monetary: '其他货币资金',
  book_balance: '账面余额', audit_objective: '审计目标',
  account_bank: '开户行', account_type: '账户类型', currency: '币种',
  confirmation_status: '函证状态', restricted_fund_flag: '受限资金提示',
  pct_of_total_assets: '占总资产比例', ai_finding: 'AI发现',
  total_book_balance: '货币资金合计', cash_balance: '现金余额',
  audit_procedures_plan: '审计程序计划', analytical_procedures: '分析性程序',
  bank_accounts: '银行账户清单',
  restricted_amount: '受限金额', audit_adjustment: '审计调整',
  audited_balance: '审定余额', audit_result: '审计结论',
  bank_confirmation_result: '函证结果',
  // A6 应收账款
  related_party_balance: '关联方应收', overdue_over_90d: '逾期>90天余额',
  overdue_over_90d_pct: '逾期>90天占比', est_provision_aging: '估计坏账准备（账龄法）',
  aging_analysis: '账龄分析', aging_bucket: '账龄区间', pct_of_total: '占总余额比例',
  provision_rate_ref: '参考计提比例', estimated_provision: '估计坏账准备',
  customer_detail: '客户明细', customer: '客户名称', ar_balance: '期末余额',
  overdue_days: '逾期天数', related_party: '关联方', risk_note: '风险备注',
  bad_debt_provision: '坏账准备', net_balance: '净额（扣坏账）',
  key_risk: '主要风险', related_party_conclusion: '关联方结论', tianshu_assessment: '成都天枢评估',
  // A9 其他应收款
  key_items: '主要项目', payee: '对方', nature: '性质', other_receivable_amount: '金额',
  aging_months: '账龄（月）', has_agreement: '是否有协议', repayment_plan: '还款计划',
  compliance_note: '合规提示', compliance_result: '合规结论',
  related_party_amt: '关联方金额', key_concern: '关注点',
  // A10 存货
  industry_note: '行业说明', ai_analysis: 'AI分析', item: '项目',
  tb_balance: 'TB余额', wip_inquiry_result: '在制品询问结果',
  // A24 固定资产
  original_cost: '历史成本', accumulated_depreciation: '累计折旧',
  net_book_value: '账面净值', depreciation_rate: '折旧率',
  composition_estimate: '资产构成（估）', asset_category: '资产类别',
  est_original_cost: '估算原值', est_accum_depr: '估算累计折旧',
  est_net: '估算净值', typical_life: '常见年限',
  depreciation_analysis: '折旧分析', method: '折旧方法',
  ai_est_annual_depr_3yr_life: 'AI估算年折旧（3年）',
  ai_est_annual_depr_5yr_life: 'AI估算年折旧（5年）',
  book_depreciation_expense: '账面折旧费用', difference: '差异',
  ai_note: 'AI说明', depreciation_policy: '折旧政策', inventory_result: '盘点结果',
  // B1 银行借款
  short_term_loans: '短期借款', long_term_loans: '长期借款',
  total_borrowings: '借款合计', finance_cost_book: '账面财务费用',
  loan_detail: '借款明细', lender: '贷款行', loan_type: '借款类型',
  principal: '本金', interest_rate: '利率', start_date: '借款日期',
  maturity_date: '到期日', collateral: '抵押/担保', covenants: '财务契约条款',
  interest_verification: '利息核查',
  ai_est_interest: 'AI估算利息', contract_terms: '合同条款', interest_verified: '利息核查结论',
  // B9 应付职工薪酬
  employee_count: '员工人数', est_per_person_monthly: '估算人均月薪（期末）',
  composition_estimate_b9: '构成估算',
  component: '构成项目', pct: '占比',
  reasonableness_flag: '合理性判断',
  social_insurance_check: '社保核对',
  post_payment_verified: '期后付款核查', analytical_result: '分析性程序结论',
  // D1 主营业务收入
  operating_revenue: '主营业务收入', other_revenue: '其他业务收入',
  total_revenue: '营业收入合计', cost_of_revenue: '主营业务成本',
  gross_profit: '毛利润', gross_margin_pct: '毛利率',
  related_party_revenue: '关联方收入', dso_days: '应收账款周转天数',
  current_year_revenue: '本年收入', industry_avg_margin: '行业参考毛利率',
  margin_assessment: '毛利率评估', dso_assessment: 'DSO评估',
  related_party_pct: '关联方收入占比',
  cutoff_testing: '截止性测试', test_period: '测试期间', scope: '测试范围',
  ai_guidance: 'AI指引', cutoff_result: '截止测试结论',
  recognition_policy: '收入确认政策', related_party_result: '关联方收入结论',
  // 通用
  procedure: '审计程序', status: '状态', responsible: '责任方',
  account_no: '账号', confirmed: '已确认',
  common_risk_assessment: '风险评估', common_conclusion_text: '结论说明',
}

function L(key: string): string {
  return FIELD_LABELS[key] || key
}

// ---- 颜色 ----
function riskBg(val: string | undefined | boolean): string {
  if (val === true) return 'bg-emerald-50 text-emerald-700'
  if (val === false) return 'bg-slate-50 text-slate-500'
  if (!val) return ''
  if (['高', '重大', '高风险', '中-高', '高-高'].includes(val)) return 'bg-rose-50 text-rose-800 font-semibold'
  if (['中', '中等', '中风险'].includes(val)) return 'bg-amber-50 text-amber-800 font-semibold'
  if (['低', '低风险', '小'].includes(val)) return 'bg-emerald-50 text-emerald-800 font-semibold'
  if (val === '是' || val === '推荐') return 'bg-emerald-50 text-emerald-700'
  if (val === '否') return 'bg-slate-50 text-slate-500'
  return ''
}

function fmtVal(key: string, val: any): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? '是' : '否'
  if (typeof val === 'number') {
    if (['ratio', 'te_ratio_of_pm', 'selected_ratio'].includes(key))
      return (val * 100).toFixed(2) + '%'
    if (val >= 10000)
      return '¥' + val.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
    return String(val)
  }
  return String(val)
}

// ---- 单元格渲染 ----
function Cell({ cellKey, val }: { cellKey: string; val: any }) {
  if (Array.isArray(val)) {
    return (
      <ul className="list-disc list-inside space-y-0.5 text-xs">
        {val.map((item, i) => (
          <li key={i}>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</li>
        ))}
      </ul>
    )
  }
  const color = riskBg(val)
  const text = fmtVal(cellKey, val)
  return <span className={cn('text-xs px-1 py-0.5 rounded', color || 'text-slate-800')}>{text}</span>
}

// ---- 对象数组 → Excel 表格 ----
function ArrayTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <span className="text-slate-400 text-xs">（无）</span>
  const headers = Object.keys(rows[0]).filter(h => !Array.isArray(rows[0][h]) || rows[0][h].length < 10)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ background: '#1e3a8a' }}>
            {headers.map((h) => (
              <th key={h} className="px-2 py-1.5 text-left font-medium text-white border border-blue-800 whitespace-nowrap">
                {L(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
              {headers.map((h) => (
                <td key={h} className="px-2 py-1.5 border border-slate-200 align-top">
                  {Array.isArray(row[h]) ? (
                    <ul className="list-disc list-inside space-y-0.5">
                      {(row[h] as any[]).map((item, j) => (
                        <li key={j} className="text-slate-700">{String(item)}</li>
                      ))}
                    </ul>
                  ) : (
                    <Cell cellKey={h} val={row[h]} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- 对象 → 两列 key/value 表格 ----
function KVTable({ data }: { data: Record<string, any> }) {
  const entries = Object.entries(data).filter(([, v]) => typeof v !== 'object' || v === null)
  const nested = Object.entries(data).filter(([, v]) => typeof v === 'object' && v !== null)
  return (
    <div className="space-y-2">
      {entries.length > 0 && (
        <table className="w-full text-xs border-collapse">
          <tbody>
            {entries.map(([k, v], i) => (
              <tr key={k} className={i % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'}>
                <td className="px-3 py-1.5 border border-slate-200 font-medium text-slate-600 whitespace-nowrap w-[9rem]">
                  {L(k)}
                </td>
                <td className="px-3 py-1.5 border border-slate-200">
                  <Cell cellKey={k} val={v} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {nested.map(([k, v]) => (
        <div key={k} className="mt-2">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 pl-1">{L(k)}</div>
          <RenderSection sectionKey={k} data={v} />
        </div>
      ))}
    </div>
  )
}

// ---- 顶层 section 渲染 ----
function RenderSection({ sectionKey, data }: { sectionKey: string; data: any }) {
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-slate-400 text-xs">（无）</span>
    if (typeof data[0] === 'object' && data[0] !== null) return <ArrayTable rows={data} />
    return (
      <ul className="list-disc list-inside space-y-1">
        {data.map((item, i) => <li key={i} className="text-xs text-slate-700">{String(item)}</li>)}
      </ul>
    )
  }
  if (typeof data === 'object' && data !== null) return <KVTable data={data} />
  return <Cell cellKey={sectionKey} val={data} />
}

// ---- 东林 header 样式（复现 DonglinHeader 的 navy 模板） ----
const firmCell: React.CSSProperties = { padding: '3px 12px', borderRight: '1px solid #e5e7eb', fontSize: 11.5, color: '#1e293b' }
const metaLabel: React.CSSProperties = { padding: '3px 8px', textAlign: 'right', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }
const metaVal: React.CSSProperties = { padding: '3px 8px', fontSize: 11.5, color: '#1e293b', minWidth: 100 }

function ExcelHeader({ paperIndex, paperName, meta }: {
  paperIndex: string
  paperName: string
  meta: { entity: string; period: string; preparer: string; reviewer: string; preparedAt: string; reviewedAt: string }
}) {
  return (
    <div style={{ borderBottom: '2px solid #1e3a8a', background: '#fafbfc' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
        <tbody>
          <tr>
            <td style={{ ...firmCell, width: '70%' }}>
              <strong style={{ color: '#1e3a8a' }}>无锡东林会计师事务所有限公司</strong>
            </td>
            <td style={metaLabel}>编&nbsp;&nbsp;制：</td>
            <td style={metaVal}>{meta.preparer}</td>
          </tr>
          <tr>
            <td style={firmCell}></td>
            <td style={metaLabel}>日&nbsp;&nbsp;期：</td>
            <td style={metaVal}>{meta.preparedAt}</td>
          </tr>
          <tr>
            <td style={firmCell}>被审计单位：<strong>{meta.entity}</strong></td>
            <td style={metaLabel}>复&nbsp;&nbsp;核：</td>
            <td style={metaVal}>{meta.reviewer}</td>
          </tr>
          <tr>
            <td style={firmCell}>项&nbsp;&nbsp;&nbsp;&nbsp;目：<strong>{paperName}</strong></td>
            <td style={metaLabel}>日&nbsp;&nbsp;期：</td>
            <td style={metaVal}>{meta.reviewedAt}</td>
          </tr>
          <tr>
            <td style={firmCell}>项目基准日：<strong>{meta.period}</strong></td>
            <td style={metaLabel}>索&nbsp;&nbsp;引：</td>
            <td style={{ ...metaVal, fontFamily: 'monospace', fontWeight: 700, color: '#1e3a8a' }}>{paperIndex}</td>
          </tr>
          <tr>
            <td colSpan={3} style={{
              padding: '8px 12px', textAlign: 'center',
              fontSize: 14, fontWeight: 700, color: '#1e3a8a',
              background: '#e0e7ff', borderTop: '1px solid #c7d2fe',
              borderBottom: '1px solid #c7d2fe',
            }}>
              {paperName}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ---- 主组件 ----
const PAPER_META_KEYS = new Set(['preparer', 'prepared_at', 'reviewer', 'reviewed_at'])

export default function PlanningPaperView({ paperIndex, paperName, paperData, activeSheet, onActiveSheetChange }: Props) {
  const sheetData = (paperData?.sheet_data || {}) as Record<string, any>
  // 过滤掉编制者等元数据 key，只保留底稿内容 key
  const allKeys = Object.keys(sheetData).filter(k => !PAPER_META_KEYS.has(k))
  // 当前显示的 section key：优先用 activeSheet，否则显示全部内容 key
  const displayKeys = activeSheet && sheetData[activeSheet] !== undefined
    ? [activeSheet]
    : allKeys
  const status = paperData?.review_status || 'AI 初稿'
  const filledBy = sheetData?.preparer || paperData?.filled_by || 'AI Agent'
  const filledAt = sheetData?.prepared_at?.slice(0, 10) || paperData?.filled_at?.slice(0, 10) || ''
  const entity = (sheetData?.company_info?.name) || '江苏大王通风机械有限公司'

  const meta = {
    entity,
    period: '2025-12-31',
    preparer: filledBy,
    preparedAt: filledAt || '2026-02-28',
    reviewer: '侯佳成',
    reviewedAt: '2026-03-02',
  }

  if (Object.keys(sheetData).length === 0) {
    return (
      <div className="border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500 bg-slate-50">
        此底稿暂无数据
      </div>
    )
  }

  const statusColor = status === 'AI 初稿'
    ? '#d97706' : status === '已复核' ? '#16a34a' : '#1e3a8a'

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden bg-white shadow-sm">

      {/* 状态徽标行 */}
      <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
        <span style={{ color: statusColor, fontWeight: 600, border: `1px solid ${statusColor}`, borderRadius: 4, padding: '1px 6px' }}>
          {status}
        </span>
        <span style={{ color: '#94a3b8' }}>编制：{filledBy}{filledAt && ` · ${filledAt}`}</span>
      </div>

      {/* Sheet tab 导航（当有多个 section 时显示） */}
      {allKeys.length > 1 && (
        <div style={{ display: 'flex', gap: 4, padding: '6px 12px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
          {allKeys.map((k) => {
            const isActive = activeSheet ? activeSheet === k : false
            return (
              <button
                key={k}
                onClick={() => onActiveSheetChange?.(k)}
                style={{
                  padding: '3px 10px', fontSize: 11, borderRadius: 4, border: '1px solid',
                  borderColor: isActive ? '#1e3a8a' : '#cbd5e1',
                  background: isActive ? '#1e3a8a' : '#fff',
                  color: isActive ? '#fff' : '#475569',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {L(k)}
              </button>
            )
          })}
        </div>
      )}

      {/* Sections */}
      <div className="divide-y divide-slate-100">
        {displayKeys.map((key) => (
          <div key={key} className="p-4">
            {/* Section header bar */}
            <div style={{
              background: '#1e3a8a', color: '#fff',
              padding: '4px 10px', fontSize: 12, fontWeight: 600,
              borderRadius: '4px 4px 0 0', marginBottom: 0,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ opacity: 0.7, fontFamily: 'monospace', fontSize: 10 }}>{key.toUpperCase()}</span>
              <span>{L(key)}</span>
            </div>
            <div style={{ border: '1px solid #c7d2fe', borderTop: 'none', borderRadius: '0 0 4px 4px', padding: '10px 8px', background: '#fff' }}>
              <RenderSection sectionKey={key} data={sheetData[key]} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

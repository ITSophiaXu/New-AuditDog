/**
 * AuditConfirmPanel
 * 合并的"审计对话"面板：
 *   上半部分 — 结构化审计确认检查点列表（全流程20项 + 动态底稿状态）
 *   下半部分 — Agent 对话（点"询问 Agent"可一键填入对话框）
 */
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronUp,
  MessageSquare, Check, Clock, BarChart2, Gavel, FileCheck, X, Loader2, Info, Sparkles,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import ChatPanel, { type QuoteRef } from '@/components/agent/ChatPanel'
import { appendAnomalyToNotes } from './AuditNotesPanel'

const FILL_AGENT = 'jsdw_paper_fill'

// ─── 审计确认检查点 ─────────────────────────────────────────────
type Stage = '计划' | '执行' | '报告'
type ItemType = 'analytical' | 'judgment' | 'approval'

interface RecommendOption {
  label: string        // "营业收入"
  value: string        // internal key
  amount?: string      // "¥26,614,264"
  ratio?: string       // "0.5%"
  note?: string        // "稳定、推荐"
  disabled?: boolean
  disabledReason?: string
}

interface CheckpointRecommendation {
  selected: string              // recommended value/option key
  reason: string                // why
  amount?: string               // calculated amount
  options?: RecommendOption[]   // structured choices (for analytical type)
  warning?: string              // e.g., "利润总额为负，已排除"
}

interface Checkpoint {
  id: string; stage: Stage; index: string
  label: string; desc: string; prompt: string; type: ItemType
  recommendation?: CheckpointRecommendation
}

const TYPE_ICON = {
  analytical: BarChart2,
  judgment:   Gavel,
  approval:   FileCheck,
}
const TYPE_LABEL: Record<ItemType, string> = {
  analytical: '分析结论',
  judgment:   '职业判断',
  approval:   '审批签字',
}
const TYPE_COLOR: Record<ItemType, string> = {
  analytical: 'text-violet-600 bg-violet-50 border-violet-200',
  judgment:   'text-amber-600 bg-amber-50  border-amber-200',
  approval:   'text-rose-600   bg-rose-50   border-rose-200',
}

// ─── 江苏大王通风机械 检查点（ENG-JSDW-2025）─────────────────────
export const AUDIT_CHECKPOINTS_JSDW: Checkpoint[] = [
  // ── 计划阶段 ──────────────────────────────────────────────────
  {
    id: 'Y3-basis', stage: '计划', index: 'Y3', type: 'analytical',
    label: '重要性水平：基准指标选择',
    desc: 'AI已计算4种基准（总资产/净资产/营业收入/利润），需确认选哪个及对应比率',
    prompt: '请说明Y3重要性水平基准指标选择建议。江苏大王为通风机械制造业，净资产仅约46万（实收资本200万-未分配亏损153万），利润为负，哪个基准最合适？参考CSA 1221。',
    recommendation: {
      selected: '营业收入',
      reason: '公司为通风机械制造商，营业收入约¥25,000,000是最稳定代表性基准。净资产仅¥467,000（过小，不代表规模），利润为负已排除。总资产¥22,770,000可作备选。',
      amount: '¥25,000,000',
      warning: '净资产仅¥467,000（不可用）；利润亏损（已排除）',
      options: [
        { label: '营业收入', value: '营业收入', amount: '¥25,000,000', ratio: '0.5%', note: 'AI推荐：制造业首选' },
        { label: '总资产', value: '总资产', amount: '¥22,770,000', ratio: '1%', note: '备选（含质押定期）' },
        { label: '净资产', value: '净资产', amount: '¥467,000', disabled: true, disabledReason: '过小，不代表业务规模' },
        { label: '利润总额', value: '利润总额', amount: '亏损', disabled: true, disabledReason: '亏损年度不适用' },
      ],
    },
  },
  {
    id: 'Y3-pm', stage: '计划', index: 'Y3', type: 'analytical',
    label: '整体重要性 PM / 执行重要性 TE / 明显微小金额 SUM',
    desc: '三个关键金额需审计师逐一确认后方可固化到计划底稿',
    prompt: '请确认Y3中PM、TE（PM×75%）、SUM（PM×5%）三个重要性金额。基准：营业收入¥25,000,000×0.5%=¥125,000。',
    recommendation: {
      selected: 'PM=125,000 / TE=93,750 / SUM=6,250',
      reason: '以营业收入 ¥25,000,000 × 0.5% = ¥125,000 为 PM；TE 取 PM × 75% = ¥93,750；SUM 取 PM × 5% = ¥6,250。符合东林所规范，制造业比率合理。',
      amount: 'PM ¥125,000',
      options: [
        { label: 'PM（整体重要性）', value: 'PM', amount: '¥125,000', ratio: '营业收入×0.5%', note: 'AI计算' },
        { label: 'TE（执行重要性）', value: 'TE', amount: '¥93,750', ratio: 'PM×75%', note: 'AI计算' },
        { label: 'SUM（明显微小金额）', value: 'SUM', amount: '¥6,250', ratio: 'PM×5%', note: 'AI计算' },
      ],
    },
  },
  {
    id: 'Y3-lower', stage: '计划', index: 'Y3', type: 'judgment',
    label: '特定账户较低重要性水平',
    desc: '短期借款1,240万（担保人杨春平/黄燕红）、收入截止测试是否单独设置较低PM',
    prompt: '借款担保人黄燕红/杨春平与公司是否存在关联关系？是否需要为借款相关账户设置较低重要性水平？参考CAS 36。',
    recommendation: {
      selected: '设置特别账户PM ¥62,500（PM×50%）',
      reason: '短期借款1,240万由杨春平/黄燕红提供全额担保，若存在关联关系则涉及关联方披露完整性。收入截止测试存在跨期风险。对担保/关联账户设置PM×50%更为谨慎。',
      amount: '¥62,500',
      warning: '需通过企查查核实担保人杨春平/黄燕红与公司的关联关系',
    },
  },
  {
    id: 'Y5-going', stage: '计划', index: 'Y5/Y8', type: 'judgment',
    label: '持续经营风险评估（特别关注）',
    desc: '净资产仅46.7万，短期借款1,240万，利润亏损，资产负债率极高',
    prompt: '江苏大王净资产仅约¥467,000但短期借款高达¥12,400,000，且本年利润亏损。是否需要将持续经营识别为特别风险？',
    recommendation: {
      selected: '识别为特别风险：持续经营假设存在重大不确定性',
      reason: '短期借款1,240万 vs 净资产46.7万，杠杆率极高。若银行不续贷，公司难以为继。建议在Y8中明确识别持续经营为特别风险，并取得管理层书面意见及银行续贷证明。',
      warning: '资产负债率极高，持续经营不确定性须在报告附注披露',
    },
  },
  {
    id: 'Y5-strategy', stage: '计划', index: 'Y5', type: 'approval',
    label: '审计策略：是否执行内控测试',
    desc: '制造企业，内控基础待评估，采用纯实质性程序需合伙人确认',
    prompt: '请确认是否对江苏大王采用纯实质性审计策略，不进行内控测试，理由是否充分？',
    recommendation: {
      selected: '不执行内控测试，采用纯实质性程序',
      reason: '公司规模较小，内控基础有限，且外销出口退税等特殊业务占比不高，执行控制测试的收益低于成本。建议直接用实质性程序覆盖所有重要科目，加强截止测试和分析性程序。',
    },
  },
  {
    id: 'Y8-fraud', stage: '计划', index: 'Y8.3', type: 'judgment',
    label: '收入确认舞弊风险（特别风险识别）',
    desc: 'CSA 1141要求默认识别收入确认舞弊风险，需确认Y8.3是否完整填写',
    prompt: '收入截止测试是否识别了内外销跨期风险？Y8.3舞弊特别风险是否完整记录？',
    recommendation: {
      selected: '应识别为特别风险并记录于Y8.3',
      reason: 'CSA 1141第26条要求收入确认默认识别为舞弊导致特别风险。江苏大王有内销（发货确认）和外销（装运/验收确认）两种收入，期末截止风险需专项测试。Y8.3不可留空。',
      warning: 'Y8.3若留空，不符合CSA 1141要求',
    },
  },
  // ── 执行阶段 ──────────────────────────────────────────────────
  {
    id: 'A1-deposit', stage: '执行', index: 'A1', type: 'judgment',
    label: '定期存款8,481,393质押状态确认',
    desc: '定期存款期末8,481,393，可能为借款质押担保，需要确认是否受限',
    prompt: '定期存款¥8,481,393金额较大，是否为短期借款1,240万的质押担保？若质押，应重分类为"受限货币资金"而非货币资金。',
    recommendation: {
      selected: '需向银行函证确认质押状态',
      reason: '定期存款8.48M与短期借款12.4M金额高度相关，疑为银行承兑汇票或保证金存款质押。若属质押，需从货币资金重分类至其他流动资产（受限），同时在附注披露。',
      warning: '若8.48M定期存款为质押，货币资金实际余额仅约¥668,000（极低）',
    },
  },
  {
    id: 'A1-conf', stage: '执行', index: 'A1', type: 'judgment',
    label: '银行函证回函完整性',
    desc: '多家银行账户（农行/浙商/交行/建行/常熟农商/南京银行），函证是否全覆盖',
    prompt: '请确认A1中所有银行账户（≥6家）函证是否均已发出并回函，有无差异需要处理？',
    recommendation: {
      selected: '确认6家银行均已收到回函，差异已逐笔处理',
      reason: '账套显示6家银行账户，农行惠山支行、交通银行、常熟农商等均有余额。函证需全覆盖，回函差异应逐笔记录在A1函证汇总表，差异如超过SUM需说明原因。',
    },
  },
  {
    id: 'A6-adj', stage: '执行', index: 'A6', type: 'analytical',
    label: '应收账款重大调整与账龄分析',
    desc: 'TB余额3,360,976，审定余额10,475,366（差额7,114,390来自重分类），807个往来户',
    prompt: '请解释A6重分类7,114,390的来源：为何TB余额336万而审定后变为1047万？804户应收中账龄分布如何？坏账准备是否充分？',
    recommendation: {
      selected: '需核实重分类7,114,390来源及坏账计提充分性',
      reason: '审定余额比TB高出7,114,390，说明存在大额往来户或跨科目重分类（如预付款/应收款混记）。807户中305户有借方余额，需做账龄分析；集中度低（Top5仅23.2%），但总额大。',
      warning: '重分类金额7,114,390超过PM（¥125,000）的57倍，需充分解释来源',
      options: [
        { label: 'TB原余额（含贷方户）', value: 'tb', amount: '¥3,360,976', ratio: '—', note: '含153户贷方户' },
        { label: '审定后重分类+调整', value: 'reclass', amount: '+¥7,114,390', ratio: '来源待核实', note: '需解释' },
        { label: '坏账准备（当前=0）', value: 'bad', amount: '¥0', ratio: '0%', note: '是否充分？' },
      ],
    },
  },
  {
    id: 'A9-tax', stage: '执行', index: 'A9', type: 'judgment',
    label: '出口退税款430,610重分类确认',
    desc: 'A9其他应收款：TB中1221科目包含出口退税-430,610，已重分类至应交税费',
    prompt: '应收出口退税款¥430,610.14是否应重分类至应交税费（应收出口退税项）？处理依据是否完整？',
    recommendation: {
      selected: '重分类至应交税费"应收出口退税"合规，需附计算依据',
      reason: '出口退税款属于向税务机关的应收款，通常在应交税费项目下列示（借方）而非其他应收款。重分类正确，但需附出口退税申报记录作为支持文件，确认金额430,610准确。',
    },
  },
  {
    id: 'A10-inv', stage: '执行', index: 'A10', type: 'analytical',
    label: '库存商品归零原因解释（期初65.6万→期末0）',
    desc: '库存商品期初¥656,434，期末¥0，原材料增至¥1,862,930，需合理解释',
    prompt: '库存商品从¥656,434减至零，原材料从¥546,736增至¥1,862,930。是正常年末结转还是存在异常？截止测试是否识别了跨期发货？',
    recommendation: {
      selected: '需获得管理层书面解释+截止测试证据',
      reason: '库存商品全部归零可能是正常的订单式生产（按单生产无库存），也可能存在年末人为出库记录。原材料大幅增加与库存归零的逻辑需对照生产记录核实。需实施截止测试，核查12月末入库/出库凭证。',
      warning: '库存归零为重大变动，若无合理解释，需扩大截止测试范围',
    },
  },
  {
    id: 'A24-disposal', stage: '执行', index: 'A24', type: 'analytical',
    label: '固定资产大额处置921,396核实',
    desc: '本期固定资产贷方（减少）¥921,396，折旧重算差异达-¥125,020（超过TE）',
    prompt: '请确认A24固定资产处置¥921,396的处置对象、处置价格和处置损益；折旧重算差异-125,020是否需要调整？',
    recommendation: {
      selected: '需取得处置合同/发票，确认处置损益入账正确',
      reason: '处置921,396元需查明被处置的设备类别（运输设备可能性大）、处置收入与账面净值的差额是否已进损益。折旧重算差异-125,020超过TE（93,750），需专项测试或调整，并获得管理层解释。',
      warning: '折旧差异-¥125,020超过执行重要性TE（¥93,750），需专项处理',
    },
  },
  {
    id: 'B1-going', stage: '执行', index: 'B1', type: 'judgment',
    label: '短期借款12,400,000续贷风险评估',
    desc: '5笔借款合计1,240万，加权利率2.54%，全部由杨春平/黄燕红担保',
    prompt: '短期借款1,240万全部到期需续贷，担保人为杨春平/黄燕红。是否已取得续贷证明？是否触发持续经营特别风险？',
    recommendation: {
      selected: '需取得银行续贷证明 + 触发持续经营评估',
      reason: '短期借款1,240万vs净资产46.7万，比率约26.5倍。若任一笔借款到期不续，公司可能资金链断裂。需取得银行续贷承诺函，并在Y8中正式识别持续经营为特别风险，报告附注中披露。',
      warning: '触发持续经营评估，需合伙人审阅持续经营评估底稿',
    },
  },
  {
    id: 'D1-cutoff', stage: '执行', index: 'D1', type: 'analytical',
    label: '收入截止测试（内销+外销）',
    desc: '主营内销约22,905,857 + 出口约2,094,407，内外销确认时点不同',
    prompt: '收入截止测试是否覆盖了内销（发货确认）和外销（装运/提单确认）两类？期末前后5个工作日凭证是否已抽样？',
    recommendation: {
      selected: '重点复核：期末±5工作日发货记录+外销提单',
      reason: '内销按发货时确认，需核查12月25日-1月10日发货记录；外销按提单日期确认，需核查12月提单，汇率使用交易日汇率。建议各抽10笔，覆盖金额不低于主营收入10%。',
    },
  },
  {
    id: 'rel-party', stage: '执行', index: 'B1/附注', type: 'judgment',
    label: '担保人杨春平/黄燕红关联关系核实',
    desc: '短期借款1,240万由杨春平/黄燕红全额担保，关联关系需通过工商查询确认',
    prompt: '借款担保人杨春平/黄燕红与公司的关联关系是什么？是否为股东/高管/亲属？附注披露是否完整？',
    recommendation: {
      selected: '需通过企查查查询，确认担保人身份和关联关系',
      reason: 'AI识别杨春平/黄燕红为全部借款担保人，若其为公司股东或高管则属关联方担保，需在附注中完整披露担保金额、期限和关联性质。建议使用企查查查询两人工商信息。',
      warning: '建议立即使用企查查MCP查询杨春平/黄燕红任职及持股情况',
    },
  },
  // ── 报告阶段 ──────────────────────────────────────────────────
  {
    id: 'Z12-unadj', stage: '报告', index: 'Z12', type: 'approval',
    label: '未更正错报汇总与可接受性判断',
    desc: '折旧差异-125,020等已识别项是否已更正，Z12是否完整',
    prompt: '请确认Z12未更正错报清单。折旧重算差异-125,020是否已更正？重分类7,114,390是否已完整记录？',
    recommendation: {
      selected: '需与执行阶段所有调整项逐一核对',
      reason: '折旧差异-125,020超TE需关注是否已更正或客户接受。重分类7,114,390若属于分类错误也应记录。Z12.3/12.4若为空需有充分依据，否则需补充填写，合伙人复核。',
    },
  },
  {
    id: 'Z5-opinion', stage: '报告', index: 'Z5', type: 'approval',
    label: '审计意见类型确认（含持续经营评估）',
    desc: '持续经营不确定性是否影响意见类型；是否需要增加强调事项段',
    prompt: '最终审计意见类型是什么？持续经营风险是否需要增加强调事项段？已识别风险是否全部关闭？',
    recommendation: {
      selected: '标准无保留意见+增加持续经营强调事项段（待合伙人决定）',
      reason: '如借款续贷已获确认，仍可出具无保留意见，但建议增加强调事项段说明持续经营不确定性。如续贷未落实，需考虑意见类型。当前仍有待确认项未关闭，不建议现在最终确认意见。',
      warning: '持续经营问题须合伙人最终决定是否影响意见类型',
    },
  },
  {
    id: 'ZS-disc', stage: '报告', index: 'ZS附注', type: 'approval',
    label: '重要披露完整性确认',
    desc: '持续经营、担保负债（1,240万借款担保）、质押存款（8.48M）、出口退税等',
    prompt: '请确认附注中持续经营、短期借款担保人披露、质押定期存款、出口退税等关键披露是否完整准确。',
    recommendation: {
      selected: '需补充：定期存款质押状态 + 借款担保人完整性 + 持续经营披露',
      reason: '三项关键披露需确认：(1) 定期存款8.48M如为质押应在附注列示；(2) 担保人杨春平/黄燕红若为关联方需完整披露；(3) 净资产/亏损情况需评估持续经营披露义务。',
      warning: '持续经营附注内容须合伙人审定后方可定稿',
    },
  },
]

// ─── 无锡斑目信息技术 检查点（ENG-BANMU-2024）────────────────────
export const AUDIT_CHECKPOINTS_BANMU: Checkpoint[] = [
  // ── 计划阶段 ──────────────────────────────────────────────────
  {
    id: 'Y3-basis', stage: '计划', index: 'Y3', type: 'analytical',
    label: '重要性水平：基准指标选择',
    desc: 'AI已计算4种基准（总资产/净资产/收入/利润），需确认选哪个及对应比率',
    prompt: '请说明Y3重要性水平基准指标的选择建议，以及当前基准数值和比率是否合适？参考CSA 1221第11-15条。',
    recommendation: {
      selected: '营业收入',
      reason: '公司主要从事软件信息服务，营业收入为最稳定且最具代表性的基准指标，符合 CSA 1221 第 12 条建议。利润总额为负值，已排除。',
      amount: '¥26,614,264',
      warning: '利润总额 -382,651（负数）已自动排除',
      options: [
        { label: '营业收入', value: '营业收入', amount: '¥26,614,264', ratio: '0.5%', note: 'AI推荐：稳定基准' },
        { label: '总资产', value: '总资产', amount: '¥18,420,000', ratio: '1%', note: '备选' },
        { label: '净资产', value: '净资产', amount: '¥8,240,000', ratio: '2%', note: '备选' },
        { label: '利润总额', value: '利润总额', amount: '-¥382,651', ratio: '—', disabled: true, disabledReason: '负数，不适用' },
      ],
    },
  },
  {
    id: 'Y3-pm', stage: '计划', index: 'Y3', type: 'analytical',
    label: '整体重要性 PM / 执行重要性 TE / 明显微小金额 SUM',
    desc: '三个关键金额需审计师逐一确认后方可固化到计划底稿',
    prompt: '请确认Y3中PM、TE（PM×75%）、SUM（PM×5%）三个重要性金额是否合适？TE采用75%系数是否恰当？',
    recommendation: {
      selected: 'PM=133,071 / TE=99,803 / SUM=6,654',
      reason: '以营业收入 ¥26,614,264 × 0.5% = ¥133,071 为 PM；TE 取 PM × 75% = ¥99,803；SUM 取 PM × 5% = ¥6,654。系数选取符合东林所规范。',
      amount: 'PM ¥133,071',
      options: [
        { label: 'PM（整体重要性）', value: 'PM', amount: '¥133,071', ratio: '营业收入×0.5%', note: 'AI计算' },
        { label: 'TE（执行重要性）', value: 'TE', amount: '¥99,803', ratio: 'PM×75%', note: 'AI计算' },
        { label: 'SUM（明显微小金额）', value: 'SUM', amount: '¥6,654', ratio: 'PM×5%', note: 'AI计算' },
      ],
    },
  },
  {
    id: 'Y3-lower', stage: '计划', index: 'Y3', type: 'judgment',
    label: '特定账户较低重要性水平',
    desc: '关联方（黄燕红应收账款）、收入确认等高风险账户是否单独设置较低PM',
    prompt: '关联方黄燕红应收账款811,739和收入账户是否需要设置较低的特别账户重要性水平？参考CAS 36。',
    recommendation: {
      selected: '设置特别账户PM ¥66,535（PM×50%）',
      reason: '关联方黄燕红余额811,739高且账龄长，收入确认存在截止测试风险，参考 CAS 36 建议对该两类账户设置较低重要性水平 PM×50%。',
      amount: '¥66,535',
    },
  },
  {
    id: 'Y5-size', stage: '计划', index: 'Y5', type: 'judgment',
    label: '小型/中型企业综合判断',
    desc: '营业收入2661万接近3000万上限，综合判断影响整体审计策略',
    prompt: '请确认Y5企业规模综合判断结论：中型还是小型企业？对审计策略有何具体影响？',
    recommendation: {
      selected: '中型偏小，按小型企业审计策略',
      reason: '营业收入2661万略低于3000万上限，资产规模1842万，人员规模较小，建议按小型企业策略执行以控制投入成本。',
    },
  },
  {
    id: 'Y5-strategy', stage: '计划', index: 'Y5', type: 'approval',
    label: '审计策略：是否执行内控测试',
    desc: '当前策略为"不进行内控测试，直接实质性程序"，需合伙人确认',
    prompt: '请确认是否采用纯实质性审计策略，不进行内控测试，理由是否充分？',
    recommendation: {
      selected: '不执行内控测试，采用纯实质性程序',
      reason: '客户为老板实控的小型软件公司，内控基础薄弱，执行控制测试效率低，建议直接实质性程序覆盖所有重要科目。',
    },
  },
  {
    id: 'Y8-risk', stage: '计划', index: 'Y8', type: 'judgment',
    label: '整体重大错报风险评估结论',
    desc: 'Y8.1/8.2结论为"无重大错报风险"，需确认此结论是否充分',
    prompt: '请评估Y8重大错报风险识别是否充分，是否存在遗漏的特别风险？',
    recommendation: {
      selected: '存在特别风险：收入确认 + 关联方交易',
      reason: 'AI识别到两项潜在特别风险：(1) 收入确认截止测试（外销USD时点）；(2) 关联方黄燕红大额余额。建议在Y8中明确识别。',
      warning: '当前Y8.1/8.2标注"无重大错报风险"可能不够充分，建议补充',
    },
  },
  {
    id: 'Y8-fraud', stage: '计划', index: 'Y8.3', type: 'judgment',
    label: '收入确认舞弊风险（特别风险识别）',
    desc: 'CSA 1141要求默认识别收入确认舞弊风险为特别风险，Y8.3当前留空',
    prompt: '收入确认是否应识别为特别风险？Y8.3留空的处理是否符合CSA 1141要求？',
    recommendation: {
      selected: '应识别为特别风险并记录于Y8.3',
      reason: 'CSA 1141第26条要求，除有充分理由外，收入确认均应默认识别为舞弊导致的特别风险。Y8.3留空存在合规缺口。',
      warning: 'Y8.3当前为空，不符合CSA 1141要求',
    },
  },
  {
    id: 'Y2-ics', stage: '计划', index: 'Y2/X4/X8', type: 'judgment',
    label: '内控有效性评价一致性',
    desc: 'X8结论"内控基本有效" vs Y5"内控有限/老板实控"存在矛盾',
    prompt: 'X8内控结论与Y5企业特征描述存在不一致，请确认最终内控评价结论是什么？',
    recommendation: {
      selected: '统一为"内控有限，依赖实质性程序"',
      reason: '企业为老板实控小公司，X8"内控基本有效"与Y5描述矛盾。建议将X8结论修改为"内控存在局限性"，与Y5保持一致，并相应扩大实质性程序范围。',
      warning: 'X8与Y5内控结论存在矛盾，需统一',
    },
  },
  // ── 执行阶段 ──────────────────────────────────────────────────
  {
    id: 'A1-diff', stage: '执行', index: 'A1', type: 'judgment',
    label: '银行函证回函差异处理',
    desc: '网商银行42,060.08未入账（老板刷单），保证金/美元定期重分类多笔',
    prompt: '请确认A1银行函证回函差异的处理方案，特别是网商银行老板刷单42,060.08如何处理？',
    recommendation: {
      selected: '作为审计调整：借记应收账款/其他，贷记银行存款',
      reason: '网商银行差异42,060.08经查为老板刷单导致的未入账项目，应作为审计调整。保证金1,744,449和美元定期应重分类至其他货币资金，不应混入活期存款。',
      warning: '共3笔重分类、1笔调整需逐笔获得管理层确认',
    },
  },
  {
    id: 'A6-confirm', stage: '执行', index: 'A6', type: 'judgment',
    label: '应收账款函证状态与替代程序充分性',
    desc: 'A6-3函证汇总表为空（未发函或未填），替代程序是否足够支撑结论',
    prompt: '应收账款函证是否实际发出？A6-3空表情况下，替代程序（合同/发票/收款核对）是否充分支撑结论？',
    recommendation: {
      selected: '需确认：函证是否实际发出，或改用替代程序',
      reason: 'A6-3函证汇总表为空，无法判断函证是否已发出。若实际未发函，必须有充分替代程序（合同+发票+期后收款三项至少覆盖70%余额）支撑A6结论。',
      warning: 'A6-3汇总表为空，函证执行状态不明，存在程序缺口',
    },
  },
  {
    id: 'A6-bad', stage: '执行', index: 'A6', type: 'analytical',
    label: '应收账款坏账准备充分性',
    desc: '关联方黄燕红811,739.84长账龄（>1年），外销USD历史余额未计提坏账',
    prompt: '请判断A6坏账准备是否充分，特别是关联方黄燕红余额811,739.84和外销长账龄USD余额。',
    recommendation: {
      selected: '建议追加计提：黄燕红50%即¥405,870',
      reason: '黄燕红余额811,739账龄超1年且为关联方，参考同类处理建议至少计提50%即405,870元。外销USD余额需确认实际账龄，若超90天建议计提10-20%。',
      amount: '建议追加计提 ¥405,870+',
      options: [
        { label: '关联方黄燕红（账龄>1年）', value: '黄燕红', amount: '¥811,739', ratio: '计提50%', note: '建议追加¥405,870' },
        { label: '外销USD余额（账龄待确认）', value: 'USD', amount: '待确认', ratio: '10-20%', note: '需核实账龄' },
        { label: '其他应收（账龄<90天）', value: '其他', amount: '正常', ratio: '5%', note: '按现有政策' },
      ],
    },
  },
  {
    id: 'A10-inv', stage: '执行', index: 'A10', type: 'analytical',
    label: '存货跌价准备计提判断',
    desc: '库存商品归零异常（年发生额双向1,400万），原材料余额是否需计提跌价',
    prompt: '请判断A10存货是否需要计提跌价准备。库存商品归零如何解释？截止测试是否充分？',
    recommendation: {
      selected: '需解释库存归零异常，原材料评估跌价',
      reason: '库存商品年双向发生额约1,400万但期末归零，属异常波动，需要管理层书面解释。原材料需与可变现净值对比，若存在滞销风险应计提跌价。',
      warning: '库存商品期末归零属重大异常，需获得充分解释和证据',
    },
  },
  {
    id: 'A24-imp', stage: '执行', index: 'A24', type: 'analytical',
    label: '固定资产减值迹象判断',
    desc: '运输设备本期大额处置（921,396），是否存在减值迹象需要额外测试',
    prompt: '请判断A24固定资产是否存在减值迹象，本期大额运输设备处置921,396是否已充分记录？',
    recommendation: {
      selected: '需核实处置收益/损失，评估减值迹象',
      reason: '运输设备大额处置921,396可能产生处置损益，需核实处置价格与账面净值差异。若存在大量淘汰迹象，应评估剩余同类资产是否有减值迹象。',
    },
  },
  {
    id: 'rel-party', stage: '执行', index: 'A6/附注', type: 'judgment',
    label: '关联方黄燕红交易完整性与披露',
    desc: '黄燕红出现于应收账款（811万），需工商穿透确认关联关系',
    prompt: '关联方黄燕红的所有交易是否完整识别？性质是否正确？附注披露是否完整？',
    recommendation: {
      selected: '需进行工商穿透查询，确认关联关系',
      reason: 'AI识别黄燕红在A6应收账款中有大额余额，需确认其与公司的关联关系（股东/配偶/高管），通过企查查查询工商信息，确保附注披露完整。',
      warning: '建议使用企查查查询黄燕红关联企业和任职情况',
    },
  },
  // ── 报告阶段 ──────────────────────────────────────────────────
  {
    id: 'Z12-unadj', stage: '报告', index: 'Z12', type: 'approval',
    label: '未更正错报汇总与可接受性判断',
    desc: 'Z12.3/12.4均为"无"，需确认已识别错报均已更正、无遗漏未更正错报',
    prompt: '请确认Z12未更正错报清单是否完整，是否确实不存在需要考虑的未更正错报？',
    recommendation: {
      selected: '需与Z6调整分录交叉核对，确认无遗漏',
      reason: 'Z6中有多笔调整分录，需确认每笔均已反映在Z12或已被客户接受更正。Z12.3/12.4为"无"需有充分依据，否则需补充填写。',
    },
  },
  {
    id: 'Z5-opinion', stage: '报告', index: 'Z5', type: 'approval',
    label: '审计意见类型确认',
    desc: '基于执行结果和未更正错报汇总，确认意见类型（无保留/保留/否定/无法表示）',
    prompt: '请确认最终审计意见类型（无保留/保留/否定/无法表示），并说明主要判断依据。',
    recommendation: {
      selected: '初步建议：标准无保留意见，但需先关闭所有待确认项',
      reason: '当前已识别的调整项金额在可接受范围内，无重大未更正错报迹象。但Y8收入确认特别风险、关联方披露等待确认项需全部关闭后方可签发无保留意见。',
      warning: '仍有待确认事项未关闭，不建议现在确认意见类型',
    },
  },
  {
    id: 'ZS-disc', stage: '报告', index: 'ZS附注', type: 'approval',
    label: '重要披露完整性确认',
    desc: '关联方黄燕红交易、保证金1,744,449、USD外币资产等披露完整性',
    prompt: '请确认附注中关联方黄燕红交易、或有负债（银行保证金1,744,449）、外币资产等关键披露是否完整准确。',
    recommendation: {
      selected: '需补充附注：保证金1,744,449列示 + 关联方黄燕红交易汇总',
      reason: '银行保证金1,744,449需在附注或有负债中单独列示。关联方黄燕红的应收账款811,739须完整披露交易性质和余额。',
    },
  },
]

// 根据 engagementCode 选择检查点集
export function getCheckpoints(engagementCode?: string): Checkpoint[] {
  if (engagementCode?.includes('BANMU')) return AUDIT_CHECKPOINTS_BANMU
  return AUDIT_CHECKPOINTS_JSDW  // default to JSDW
}

export const AUDIT_CHECKPOINTS = AUDIT_CHECKPOINTS_JSDW

const STAGE_ORDER: Stage[] = ['计划', '执行', '报告']
const STAGE_ICON: Record<Stage, string> = { '计划': '📋', '执行': '⚙', '报告': '📕' }

// ─── localStorage helpers ──────────────────────────────────────
function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')) } catch { return new Set() }
}
function saveSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...s])) } catch {}
}

// ─── Props ────────────────────────────────────────────────────
interface Props {
  paperId?: number
  paperIndex?: string     // 当前底稿索引号（如 'Y3' / 'A1'），用于过滤检查点
  currentProjectPapers: any[]
  activeId?: number
  engagementCode?: string
  /** 从外部（BanmuTaskPanel）传入的引用，触发后跳转到对话并填入 quote */
  externalQuote?: QuoteRef
  onExternalQuoteConsumed?: () => void
  onNavigate: (id: number) => void
  onAfterRun?: () => void
  className?: string
}

export default function AuditConfirmPanel({
  paperId, paperIndex, currentProjectPapers, activeId, engagementCode,
  externalQuote, onExternalQuoteConsumed,
  onNavigate, onAfterRun, className,
}: Props) {
  const qc = useQueryClient()
  const lsKey = `audit-confirm-${engagementCode || 'default'}`
  const checkpoints = getCheckpoints(engagementCode)

  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(() => loadSet(`${lsKey}-confirmed`))
  const [deferredIds,  setDeferredIds]  = useState<Set<string>>(() => loadSet(`${lsKey}-deferred`))
  const [stageFilter,  setStageFilter]  = useState<Stage | 'all'>('all')
  const [listCollapsed, setListCollapsed] = useState(false)
  const [pendingQuote, setPendingQuote] = useState<QuoteRef | undefined>()
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  // adjustment diff preview state (Banmu A1 scenario)
  const [adjConfirmed, setAdjConfirmed] = useState<boolean>(
    () => { try { return localStorage.getItem(`${lsKey}-adj5-confirmed`) === '1' } catch { return false } }
  )
  const [adjDismissed, setAdjDismissed] = useState<boolean>(
    () => { try { return localStorage.getItem(`${lsKey}-adj5-dismissed`) === '1' } catch { return false } }
  )
  const [adjExpanded, setAdjExpanded] = useState(false)

  function confirmAdj() {
    setAdjConfirmed(true)
    try { localStorage.setItem(`${lsKey}-adj5-confirmed`, '1') } catch {}
  }
  function dismissAdj() {
    setAdjDismissed(true)
    try { localStorage.setItem(`${lsKey}-adj5-dismissed`, '1') } catch {}
  }

  // ── FillDecision（斑目项目人工判断点）──────────────────────────
  type FillDecisionData = {
    paper_id: number; paper_index: string; key: string; cell_path: string
    question: string; context: string
    options: Array<{ label: string; value: string; amount?: string; rate?: string; note?: string }>
    status: 'pending' | 'resolved'; resolved_value: string | null
  }
  const { data: allFillDecisions = [] } = useQuery({
    queryKey: ['objects', 'FillDecision'],
    queryFn: () => api.listObjects('FillDecision'),
    enabled: paperId != null,
  })
  const pendingDecisions = allFillDecisions.filter(
    (o) => (o.data as FillDecisionData)?.paper_id === paperId &&
            (o.data as FillDecisionData)?.status === 'pending',
  )
  const [selectedValues, setSelectedValues] = useState<Record<number, string>>({})
  const [confirmingDecId, setConfirmingDecId] = useState<number | null>(null)

  async function resolveDecision(decId: number, value: string) {
    setConfirmingDecId(decId)
    try {
      const isBanmu = engagementCode?.includes('BANMU')
      if (isBanmu) {
        await api.banmuResolve(decId, value)
      } else {
        await api.donglinResolvePlanning(decId, value)
      }
      qc.invalidateQueries({ queryKey: ['objects', 'FillDecision'] })
      qc.invalidateQueries({ queryKey: ['object', paperId] })
      qc.invalidateQueries({ queryKey: ['objects', 'WorkingPaper'] })
      qc.invalidateQueries({ queryKey: ['objects', 'Engagement'] })
    } catch (e: any) {
      alert(`提交失败：${e.message}`)
    } finally { setConfirmingDecId(null) }
  }

  // ── 异常（从 DB 查，只显示当前底稿的）──────────────────────────
  const { data: allAnomalies = [] } = useQuery({
    queryKey: ['objects', 'Anomaly'],
    queryFn: () => api.listObjects('Anomaly'),
    enabled: paperId != null,
  })
  type AnomalyData = {
    paper_id: number; paper_index: string
    severity: 'high' | 'medium' | 'low'
    title: string; detail: string; triggered_by: string; recommendation: string
    review_status?: '待审计' | '已确认' | '已驳回'; review_note?: string
    reviewed_by?: string; reviewed_at?: string; _layer?: string; _source?: string
    discovered_at?: string
  }
  const paperAnomalies = allAnomalies.filter(
    (a) => (a.data as AnomalyData)?.paper_id === paperId
  )
  const pendingAnomalies = paperAnomalies.filter(
    (a) => !(a.data as AnomalyData)?.review_status || (a.data as AnomalyData)?.review_status === '待审计'
  )

  async function setAnomalyStatus(anomalyId: number, d: AnomalyData, status: '已确认' | '已驳回') {
    setConfirmingId(anomalyId)
    try {
      await api.patchObject(anomalyId, {
        data: { ...d, review_status: status, reviewed_by: '审计师', reviewed_at: new Date().toISOString() },
      })
      if (status === '已确认' && paperId != null) {
        const paper = currentProjectPapers.find(p => p.id === paperId)
        if (paper) {
          const updated = appendAnomalyToNotes(
            paper.data?.auditor_notes || paper.data?.audit_conclusion || '',
            { title: d.title, detail: d.detail, severity: d.severity, triggered_by: d.triggered_by || '' },
            '审计师',
          )
          await api.patchObject(paperId, { data: { ...paper.data, auditor_notes: updated } })
          qc.invalidateQueries({ queryKey: ['object', paperId] })
        }
      }
      qc.invalidateQueries({ queryKey: ['objects', 'Anomaly'] })
    } finally { setConfirmingId(null) }
  }

  function confirm(id: string) {
    const next = new Set(confirmedIds).add(id)
    setConfirmedIds(next); saveSet(`${lsKey}-confirmed`, next)
    const d = new Set(deferredIds); d.delete(id)
    setDeferredIds(d); saveSet(`${lsKey}-deferred`, d)
  }
  function defer(id: string) {
    const next = new Set(deferredIds).add(id)
    setDeferredIds(next); saveSet(`${lsKey}-deferred`, next)
    const c = new Set(confirmedIds); c.delete(id)
    setConfirmedIds(c); saveSet(`${lsKey}-confirmed`, c)
  }
  function reset(id: string) {
    const c = new Set(confirmedIds); c.delete(id); setConfirmedIds(c); saveSet(`${lsKey}-confirmed`, c)
    const d = new Set(deferredIds);  d.delete(id); setDeferredIds(d);  saveSet(`${lsKey}-deferred`, d)
  }
  function askAgent(quote: QuoteRef) {
    setPendingQuote(undefined)
    setTimeout(() => setPendingQuote(quote), 10)
  }

  // 当外部（BanmuTaskPanel）的"询问"按钮触发时，接收 quote 并传给 ChatPanel
  useEffect(() => {
    if (externalQuote) {
      askAgent(externalQuote)
      onExternalQuoteConsumed?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalQuote])

  async function markPaperReviewed(_p: any) { /* moved to project dashboard */ }

  // paperIndex に関連するcheckpointのみ表示
  function matchesPaper(c: Checkpoint): boolean {
    if (!paperIndex) return true
    const idx = paperIndex.split('.')[0]
    return c.index.split('/').some(part => part.split('.')[0] === idx)
  }

  const visibleCheckpoints = checkpoints.filter(c =>
    !confirmedIds.has(c.id) && matchesPaper(c)
  )
  const isBanmu = engagementCode?.includes('BANMU') ?? false
  const checkpointsToShow = isBanmu ? [] : visibleCheckpoints
  const totalOpen = checkpointsToShow.length + (!isBanmu ? pendingAnomalies.length + pendingDecisions.length : 0)

  // 待确认事项卡片 — 渲染到 ChatPanel 的 pinnedCards 区域（消息流顶部）
  // 斑目项目的 FillDecision / Anomaly 卡片已移至 BanmuTaskPanel，此处不再重复显示
  const pinnedCards = (checkpointsToShow.length > 0 || (!isBanmu && (pendingAnomalies.length > 0 || pendingDecisions.length > 0))) ? (
    <div className="space-y-2 mb-2">
      {/* 标题 */}
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
        <AlertCircle size={12} className="shrink-0" />
        待确认事项
        <span className="ml-auto bg-amber-500 text-white rounded-full px-1.5 py-px text-[9px] font-bold">{totalOpen}</span>
      </div>

      {/* AI 填稿判断点（FillDecision）— 仅非斑目项目显示，斑目项目已移至 BanmuTaskPanel */}
      {!isBanmu && pendingDecisions.map(o => {
        const d = o.data as FillDecisionData
        const isBusy = confirmingDecId === o.id
        const sel = selectedValues[o.id]
        return (
          <div key={o.id} className="rounded-md border mb-1 border-violet-200 bg-white hover:border-violet-300 transition-colors">
            <div className="flex items-start gap-1.5 px-2 py-1.5">
              <Sparkles size={11} className="shrink-0 mt-0.5 text-violet-400" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[9px] font-bold px-1 py-px rounded border text-violet-600 bg-violet-50 border-violet-200">AI判断点</span>
                  <span className="text-[11px] font-medium text-slate-800 leading-tight">{d.question}</span>
                </div>
                {d.context && (
                  <div className="mt-1 text-[10px] text-slate-600 leading-relaxed whitespace-pre-wrap border-l-2 border-violet-100 pl-2"
                    dangerouslySetInnerHTML={{
                      __html: d.context
                        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                        .replace(/^•\s/gm, '<span class="text-violet-400 mr-1">•</span>')
                    }}
                  />
                )}
              </div>
            </div>
            {/* Radio options */}
            <div className="px-2 pb-1 space-y-1">
              {d.options.map(opt => (
                <label key={opt.value}
                  className={cn(
                    'flex items-start gap-1.5 px-2 py-1 rounded cursor-pointer border text-[10px] transition-colors',
                    sel === opt.value
                      ? 'border-violet-400 bg-violet-50 text-violet-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                  )}
                >
                  <input type="radio" name={`dec-${o.id}`} value={opt.value}
                    checked={sel === opt.value}
                    onChange={() => setSelectedValues(prev => ({ ...prev, [o.id]: opt.value }))}
                    className="mt-0.5 accent-violet-600"
                  />
                  <span className="flex-1">
                    {opt.label}
                    {opt.amount && <span className="ml-1 font-mono text-violet-700">{opt.amount}</span>}
                    {opt.rate && <span className="ml-1 text-slate-500">× {opt.rate}</span>}
                    {opt.note && <span className="ml-1 text-slate-400 italic">{opt.note}</span>}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-1 px-2 pb-1.5">
              <button
                disabled={isBusy || !sel}
                onClick={() => sel && resolveDecision(o.id, sel)}
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 text-[10px] disabled:opacity-50"
              >
                {isBusy ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />} 确认选择
              </button>
              <button
                onClick={() => askAgent({ label: d.question, detail: d.context, color: 'violet' })}
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-violet-300 bg-white text-violet-700 hover:bg-violet-50 text-[10px]"
              >
                <MessageSquare size={9} /> 询问
              </button>
            </div>
          </div>
        )
      })}

      {/* AI 识别的异常 — 仅非斑目项目显示 */}
      {!isBanmu && pendingAnomalies.map(a => {
        const d = a.data as AnomalyData
        const isBusy = confirmingId === a.id
        const sevColor = d.severity === 'high'
          ? 'text-rose-600 bg-rose-50 border-rose-200'
          : d.severity === 'medium'
          ? 'text-amber-600 bg-amber-50 border-amber-200'
          : 'text-sky-600 bg-sky-50 border-sky-200'
        const sevLabel = d.severity === 'high' ? '高风险' : d.severity === 'medium' ? '中风险' : '低风险'
        const SevIcon = d.severity === 'high' ? AlertTriangle
          : d.severity === 'medium' ? AlertCircle : Info
        return (
          <div key={a.id} className="rounded-md border mb-1 border-slate-200 bg-white hover:border-amber-200 transition-colors">
            <div className="flex items-start gap-1.5 px-2 py-1.5">
              <SevIcon size={11} className="shrink-0 mt-0.5 text-slate-400" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className={cn('text-[9px] font-bold px-1 py-px rounded border', sevColor)}>{sevLabel}</span>
                  <span className="text-[11px] font-medium text-slate-800 leading-tight">{d.title}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{d.detail}</div>
                {d.recommendation && (
                  <div className="text-[10px] text-slate-400 italic mt-0.5 line-clamp-1">建议：{d.recommendation}</div>
                )}
              </div>
            </div>
            <div className="flex gap-1 px-2 pb-1.5">
              <button disabled={isBusy} onClick={() => setAnomalyStatus(a.id, d, '已确认')}
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 text-[10px] disabled:opacity-50">
                {isBusy ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />} 确认
              </button>
              <button disabled={isBusy} onClick={() => setAnomalyStatus(a.id, d, '已驳回')}
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 text-[10px] disabled:opacity-50">
                {isBusy ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />} 驳回
              </button>
              <button onClick={() => askAgent({
                  label: d.title,
                  detail: d.detail,
                  color: d.severity === 'high' ? 'rose' : d.severity === 'medium' ? 'amber' : 'blue',
                })}
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-violet-300 bg-white text-violet-700 hover:bg-violet-50 text-[10px]">
                <MessageSquare size={9} /> 询问
              </button>
            </div>
          </div>
        )
      })}

      {/* 结构化审计检查点 */}
      {checkpointsToShow.map(c => (
        <CheckpointCard
          key={c.id}
          checkpoint={c}
          confirmed={confirmedIds.has(c.id)}
          deferred={deferredIds.has(c.id)}
          onConfirm={() => confirm(c.id)}
          onDefer={() => defer(c.id)}
          onReset={() => reset(c.id)}
          onAsk={() => askAgent({ label: c.label, detail: c.desc, color: c.type === 'analytical' ? 'violet' : c.type === 'approval' ? 'rose' : 'amber' })}
        />
      ))}
    </div>
  ) : null

  // Banmu A1 调整分录预览卡（库存现金→肖海林）
  const isBanmuA1 = engagementCode?.includes('BANMU') && paperIndex?.split('.')[0] === 'A1'
  const banmuAdjCard = isBanmuA1 && !adjDismissed ? (
    <div className={cn(
      'rounded-md border mb-2 transition-colors',
      adjConfirmed
        ? 'border-emerald-300 bg-emerald-50'
        : 'border-violet-200 bg-white',
    )}>
      {/* 头部 */}
      <div className="flex items-start gap-2 px-3 py-2">
        <Sparkles size={12} className={cn('shrink-0 mt-0.5', adjConfirmed ? 'text-emerald-500' : 'text-violet-500')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {adjConfirmed
              ? <span className="text-[9px] font-bold px-1 py-px rounded border text-emerald-700 bg-emerald-100 border-emerald-300">✓ 已执行</span>
              : <span className="text-[9px] font-bold px-1 py-px rounded border text-violet-600 bg-violet-50 border-violet-200">待确认调整</span>
            }
            <span className="text-[11px] font-semibold text-slate-800">调整#5：库存现金 → 股东应收款</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">现场盘点无现金，账面余额177,207.13元，经询问为股东肖海林借用。</p>
          {/* 分录 */}
          <div className="mt-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[10px] leading-5 text-slate-700">
            <div><span className="text-rose-500 font-bold mr-1">借：</span>其他应收款—肖海林<span className="float-right text-slate-900 font-medium">177,207.13</span></div>
            <div><span className="text-emerald-600 font-bold mr-1">贷：</span>货币资金—库存现金<span className="float-right text-slate-900 font-medium">177,207.13</span></div>
          </div>
        </div>
        {!adjConfirmed && (
          <button onClick={dismissAdj} className="text-slate-300 hover:text-slate-500 shrink-0 text-[10px]">✕</button>
        )}
      </div>

      {/* 展开：跨表影响 */}
      <button
        onClick={() => setAdjExpanded(v => !v)}
        className="w-full flex items-center gap-1 px-3 py-1 text-[10px] text-violet-600 hover:bg-violet-50/60 border-t border-slate-100"
      >
        {adjExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        跨表影响预览（5张底稿）
      </button>

      {adjExpanded && (
        <div className="border-t border-slate-100 px-3 py-2">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left pb-1 font-medium">底稿</th>
                <th className="text-left pb-1 font-medium">科目/位置</th>
                <th className="text-right pb-1 font-medium text-rose-500">调整前</th>
                <th className="text-right pb-1 font-medium text-emerald-600">调整后</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                { sheet: 'Z6', loc: '新增第5条分录', before: '—', after: '✓ 新增', highlight: true },
                { sheet: 'A1', loc: '现金 · 审核确认额', before: '177,207.13', after: '0.00' },
                { sheet: 'A1', loc: '合计 · 审核确认额', before: '5,611,916.18', after: '5,434,709.05' },
                { sheet: 'A9', loc: '肖海林 · 期末余额', before: '0.00', after: '177,207.13' },
                { sheet: 'Z9', loc: '货币资金 · 审定余额', before: '5,611,916.18', after: '5,434,709.05' },
                { sheet: 'Z9', loc: '其他应收款 · 审定余额', before: '6,377,569.06', after: '6,554,776.19' },
                { sheet: 'ZK3.1', loc: '货币资金及货币等价物', before: '5,611,916.18', after: '5,434,709.05' },
                { sheet: 'ZK3.1', loc: '其他应收款', before: '6,377,569.06', after: '6,554,776.19' },
              ].map((row, i) => (
                <tr key={i} className="py-0.5">
                  <td className="py-1 pr-2">
                    <span className="rounded border border-slate-200 bg-slate-50 px-1 py-px font-mono font-medium text-slate-700">{row.sheet}</span>
                  </td>
                  <td className="py-1 pr-2 text-slate-600">{row.loc}</td>
                  <td className="py-1 text-right text-rose-600 font-mono">{row.before}</td>
                  <td className={cn('py-1 text-right font-mono', row.highlight ? 'text-emerald-600 font-semibold' : 'text-emerald-700')}>{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 操作按钮 */}
      {!adjConfirmed && (
        <div className="flex gap-2 px-3 pb-2 pt-1 border-t border-slate-100">
          <button
            onClick={confirmAdj}
            className="flex-1 rounded border border-emerald-400 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            ✓ 确认执行
          </button>
          <button
            onClick={dismissAdj}
            className="rounded border border-slate-200 px-3 py-1 text-[11px] text-slate-500 hover:bg-slate-50 transition-colors"
          >
            取消
          </button>
        </div>
      )}
    </div>
  ) : null

  const finalPinnedCards = (pinnedCards || banmuAdjCard) ? (
    <div>
      {banmuAdjCard}
      {pinnedCards}
    </div>
  ) : (
    <div className="flex items-center gap-2 text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-2">
      <CheckCircle2 size={12} /> 本底稿无待确认事项
    </div>
  )

  return (
    <div className={cn('h-full flex flex-col', className)}>
      <ChatPanel
        agentCode={FILL_AGENT}
        paperId={paperId}
        pendingQuote={pendingQuote}
        onQuoteDismiss={() => setPendingQuote(undefined)}
        pinnedCards={finalPinnedCards}
        hideHeader={false}
        placeholder="就任何审计判断、底稿差异、或待确认事项提问…"
        onAfterRun={onAfterRun}
        className="flex-1 min-h-0 border-0 rounded-none"
      />
    </div>
  )
}

// ─── 检查点卡片 ─────────────────────────────────────────────────
function CheckpointCard({
  checkpoint, confirmed, deferred,
  onConfirm, onDefer, onReset, onAsk,
}: {
  checkpoint: Checkpoint
  confirmed: boolean; deferred: boolean
  onConfirm: () => void; onDefer: () => void; onReset: () => void; onAsk: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const Icon = TYPE_ICON[checkpoint.type]
  const typeClass = TYPE_COLOR[checkpoint.type]
  const isDone = confirmed || deferred
  const rec = checkpoint.recommendation

  // Auto-select AI recommendation on first expand
  const effectiveSelection = selectedOption ?? rec?.selected ?? null

  return (
    <div className={cn(
      'rounded-md border mb-1 transition-colors',
      confirmed ? 'border-emerald-200 bg-emerald-50/50' :
      deferred  ? 'border-slate-200 bg-slate-50 opacity-60' :
      'border-slate-200 bg-white hover:border-amber-200',
    )}>
      {/* Main row */}
      <div
        className="flex items-start gap-1.5 px-2 py-1.5 cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <Icon size={11} className={cn('shrink-0 mt-0.5', confirmed ? 'text-emerald-500' : 'text-slate-400')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-mono text-[9px] font-bold text-slate-400">{checkpoint.index}</span>
            <span className="text-[11px] font-medium text-slate-800 leading-tight">{checkpoint.label}</span>
          </div>
          {/* Inline recommendation preview (collapsed) */}
          {!expanded && rec && !isDone && (
            <div className="text-[9px] text-blue-600 mt-0.5 truncate">
              AI建议：{rec.selected}
              {rec.amount ? `（${rec.amount}）` : ''}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          <span className={cn('text-[9px] px-1 py-px rounded border font-medium', typeClass)}>
            {TYPE_LABEL[checkpoint.type]}
          </span>
          {confirmed && <Check size={10} className="text-emerald-500" />}
          {deferred  && <Clock size={10} className="text-slate-400" />}
        </div>
      </div>

      {/* Expanded detail + actions */}
      {expanded && (
        <div className="px-2 pb-2 space-y-2 border-t border-slate-100 pt-2">

          {/* AI Recommendation card */}
          {rec && !isDone && (
            <div className="rounded bg-blue-50 border border-blue-200 p-2 space-y-1.5">
              <div className="flex items-start gap-1.5">
                <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-px rounded shrink-0">AI建议</span>
                <span className="text-[10px] font-semibold text-blue-800 leading-snug">{rec.selected}</span>
                {rec.amount && (
                  <span className="text-[9px] text-blue-600 font-mono ml-auto shrink-0">{rec.amount}</span>
                )}
              </div>
              <p className="text-[9px] text-blue-700 leading-relaxed">{rec.reason}</p>
              {rec.warning && (
                <div className="flex items-center gap-1 text-[9px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                  <AlertCircle size={9} className="shrink-0" />
                  {rec.warning}
                </div>
              )}

              {/* Structured options table */}
              {rec.options && rec.options.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {rec.options.map(opt => (
                    <button
                      key={opt.value}
                      disabled={opt.disabled}
                      onClick={e => { e.stopPropagation(); if (!opt.disabled) setSelectedOption(opt.value) }}
                      className={cn(
                        'w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left transition-colors',
                        opt.disabled
                          ? 'opacity-40 cursor-not-allowed bg-slate-50'
                          : effectiveSelection === opt.value
                            ? 'bg-blue-100 border border-blue-300'
                            : 'bg-white border border-slate-200 hover:border-blue-200',
                      )}
                    >
                      <div className={cn(
                        'w-3 h-3 rounded-full border-2 shrink-0 flex items-center justify-center',
                        effectiveSelection === opt.value && !opt.disabled
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-slate-300',
                      )}>
                        {effectiveSelection === opt.value && !opt.disabled && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                      <span className={cn(
                        'text-[10px] font-medium flex-1',
                        opt.disabled ? 'text-slate-400 line-through' : 'text-slate-700',
                      )}>{opt.label}</span>
                      {opt.amount && (
                        <span className="text-[9px] font-mono text-slate-500">{opt.amount}</span>
                      )}
                      {opt.ratio && (
                        <span className="text-[9px] text-slate-400 ml-1">{opt.ratio}</span>
                      )}
                      {opt.note && (
                        <span className={cn(
                          'text-[8px] px-1 py-px rounded',
                          opt.note.includes('推荐') || opt.note.includes('AI')
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-slate-100 text-slate-500',
                        )}>{opt.note}</span>
                      )}
                      {opt.disabledReason && (
                        <span className="text-[8px] text-rose-400">{opt.disabledReason}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fallback desc for non-recommendation items */}
          {(!rec || isDone) && (
            <p className="text-[10px] text-slate-500 leading-relaxed">{checkpoint.desc}</p>
          )}

          {/* Actions */}
          {isDone ? (
            <button
              onClick={e => { e.stopPropagation(); onReset() }}
              className="text-[10px] text-slate-400 hover:text-slate-600 underline"
            >
              撤销{confirmed ? '确认' : '暂缓'}
            </button>
          ) : (
            <div className="flex gap-1.5">
              <button
                onClick={e => { e.stopPropagation(); onAsk() }}
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium border bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100 transition-colors"
              >
                <MessageSquare size={10} /> 询问 Agent
              </button>
              <button
                onClick={e => { e.stopPropagation(); onConfirm() }}
                className="flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 transition-colors"
              >
                <Check size={10} /> {rec ? '确认建议' : '已确认'}
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDefer() }}
                className="flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium border bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 transition-colors"
              >
                <Clock size={10} /> 暂缓
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

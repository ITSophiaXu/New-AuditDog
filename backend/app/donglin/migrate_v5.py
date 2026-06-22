"""把 v5 (ontology_build_v3.zip) 的关键知识合并到我们的 pilot-demo。

合并范围：
  - 44 个新 ObjectType (我们没有的)
  - 部分新 LinkType
  - 47 条 FillRule (作为 ObjectInstance)
  - 61 个 WorkpaperField (作为 ObjectInstance)
  - 每个 OT 加 _layer 字段
"""
from __future__ import annotations
import json
import re
from pathlib import Path

# ── 路径 ──────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent.parent  # backend/
DATA_DIR = ROOT / "data" / "donglin"
V5_DIR = Path(r"C:\Users\yingx\OneDrive - Microsoft\claude output\ontology_build_v3")
V5_PAYLOAD = V5_DIR / "ontology" / "explorer_payload"
V5_FILL_RULES = V5_DIR / "ontology" / "fill_rules.ttl"


# ── L1/L2/L3 标签规则 ─────────────────────────────────
LAYER_MAP = {
    # L1 国际通用
    'Engagement': 'L1', 'Client': 'L1', 'Person': 'L1', 'Group': 'L1',
    'TrialBalance': 'L1', 'Account': 'L1', 'AccountBalance': 'L1',
    'JournalEntry': 'L1', 'Voucher': 'L1', 'AuxiliaryLedger': 'L1',
    'WorkingPaper': 'L1', 'PaperTemplate': 'L1',
    'AuditProcedure': 'L1', 'Evidence': 'L1', 'AuditRule': 'L1',
    'Anomaly': 'L1', 'SpecialAuditCase': 'L1',
    'AuditAssertion': 'L1',
    'ExistenceAssertion': 'L1', 'CompletenessAssertion': 'L1',
    'AccuracyAssertion': 'L1', 'CutoffAssertion': 'L1',
    'OccurrenceAssertion': 'L1', 'ValuationAssertion': 'L1',
    'AllocationAssertion': 'L1', 'ClassificationAssertion': 'L1',
    'PresentationAssertion': 'L1', 'RightsObligationsAssertion': 'L1',
    'AuditReport': 'L1', 'AuditOpinion': 'L1',
    'SubstantiveTest': 'L1', 'AnalyticalProcedureResult': 'L1',
    'ControlActivity': 'L1', 'Walkthrough': 'L1',
    'ConfirmationLetter': 'L1', 'SubsequentEvent': 'L1',
    'Contract': 'L1', 'EngagementLetter': 'L1',
    'Invoice': 'L1', 'ManagementRep': 'L1', 'ManagementLetter': 'L1',
    'Recommendation': 'L1', 'RelatedParty': 'L1',
    'ReportLineItem': 'L1', 'NoteSection': 'L1', 'FinancialStatement': 'L1',
    'EmphasisOfMatterParagraph': 'L1',
    # L2 中国本地化
    'MaterialityLevel': 'L1', 'MaterialityBenchmark': 'L1',
    'AccountingFramework': 'L1', 'AccountingPolicy': 'L1',
    'RiskOfMaterialMisstatement': 'L1', 'RiskAssessment': 'L1',
    'FraudRisk': 'L1', 'RelatedPartyRisk': 'L1',
    'GoingConcernAssessment': 'L1',
    'ReviewRecord': 'L1', 'AuditorRole': 'L1',
    'BadDebtProvision': 'L1', 'UnadjustedMisstatement': 'L1',
    'MergeAdjustment': 'L1', 'ReclassificationEntry': 'L1',
    'CutoffTest': 'L1', 'ConfirmationReconciliation': 'L1',
    # L3 甲所专有
    'AuditArea': 'L2:donglin',
    'PaperPhase': 'L2:donglin',
    'SummarySheet': 'L2:donglin', 'DetailSheet': 'L2:donglin',
    'AggregationSheet': 'L2:donglin',
    'WorkpaperField': 'L2:donglin',
    'FillRule': 'L2:donglin',
    'Z6AdjustmentEntry': 'L2:donglin',
    'AuditAdjustingEntry': 'L2:donglin',
    'VoucherSamplingWorkpaper': 'L2:donglin',
    'CounterpartyUnit': 'L2:donglin',
    'CrossFootCheck': 'L2:donglin',
    'IndustryProfile': 'L2:donglin',
    'DocumentRequestList': 'L2:donglin',
    'SuppliedDocument': 'L2:donglin',
    'AuditCycle': 'L2:donglin',
    'Milestone': 'L2:donglin',
    'BusinessRegistration': 'L2:donglin',
    'BankAccount': 'L2:donglin',
    'BankStatement': 'L2:donglin',
    'LoanContract': 'L2:donglin',
    'FixedAssetItem': 'L2:donglin',
    'DepreciationSchedule': 'L2:donglin',
    'InventoryItem': 'L2:donglin',
    'InventorySheet': 'L2:donglin',
    'TaxItem': 'L2:donglin',
    'SalaryRoster': 'L2:donglin',
    'ToolUsage': 'L2:donglin',
    'ControlDeficiency': 'L2:donglin',
    'CorrectionLog': 'L2:donglin',
    'CrossReference': 'L2:donglin',
    'RemediationRequirement': 'L2:donglin',
    'RelatedPartyGuarantee': 'L2:donglin',
}


# ── 簇映射（v5 没有 _cluster，给它补上）────────────────
CLUSTER_MAP = {
    # 客户类
    'Client': '客户类', 'Group': '客户类', 'Person': '客户类',
    'RelatedParty': '客户类', 'RelatedPartyGuarantee': '客户类',
    'BusinessRegistration': '客户类', 'IndustryProfile': '客户类',
    # 项目类
    'Engagement': '项目类', 'EngagementLetter': '项目类',
    'AuditCycle': '项目类', 'AuditorRole': '项目类', 'Milestone': '项目类',
    'ProjectTeam': '项目类', 'AuditPeriod': '项目类',
    # 数据类
    'TrialBalance': '数据类', 'Account': '数据类', 'AccountBalance': '数据类',
    'AuxiliaryLedger': '数据类', 'Voucher': '数据类', 'JournalEntry': '数据类',
    'BankAccount': '数据类', 'BankStatement': '数据类', 'Invoice': '数据类',
    'Contract': '数据类', 'LoanContract': '数据类',
    'AccountingPolicy': '数据类', 'AccountingFramework': '数据类',
    'FixedAssetItem': '数据类', 'DepreciationSchedule': '数据类',
    'InventoryItem': '数据类', 'InventorySheet': '数据类',
    'TaxItem': '数据类', 'SalaryRoster': '数据类',
    # 审计区域
    'AuditArea': '审计区域',
    # 认定
    'AuditAssertion': '认定', 'ExistenceAssertion': '认定',
    'CompletenessAssertion': '认定', 'AccuracyAssertion': '认定',
    'CutoffAssertion': '认定', 'OccurrenceAssertion': '认定',
    'ValuationAssertion': '认定', 'AllocationAssertion': '认定',
    'ClassificationAssertion': '认定', 'PresentationAssertion': '认定',
    'RightsObligationsAssertion': '认定',
    # 风险
    'RiskOfMaterialMisstatement': '风险', 'RiskAssessment': '风险',
    'FraudRisk': '风险', 'RelatedPartyRisk': '风险',
    'GoingConcernAssessment': '风险', 'MaterialityLevel': '风险',
    'MaterialityBenchmark': '风险',
    # 程序
    'AuditProcedure': '程序', 'SubstantiveTest': '程序',
    'AnalyticalProcedureResult': '程序', 'Walkthrough': '程序',
    'ControlActivity': '程序', 'CutoffTest': '程序',
    'AuditRule': '程序', 'FillRule': '程序',
    'Anomaly': '程序', 'ToolUsage': '程序',
    # 证据
    'Evidence': '证据', 'ConfirmationLetter': '证据',
    'ConfirmationReconciliation': '证据',
    'DocumentRequestList': '证据', 'SuppliedDocument': '证据',
    # 底稿
    'WorkingPaper': '底稿', 'PaperTemplate': '底稿',
    'SummarySheet': '底稿', 'DetailSheet': '底稿',
    'AggregationSheet': '底稿', 'WorkpaperField': '底稿',
    'PaperPhase': '底稿', 'VoucherSamplingWorkpaper': '底稿',
    'CounterpartyUnit': '底稿', 'CrossFootCheck': '底稿',
    'CorrectionLog': '底稿', 'CrossReference': '底稿',
    # 报告
    'AuditReport': '报告', 'AuditOpinion': '报告',
    'FinancialStatement': '报告', 'ReportLineItem': '报告',
    'NoteSection': '报告', 'EmphasisOfMatterParagraph': '报告',
    'ManagementRep': '报告', 'ManagementLetter': '报告',
    'Recommendation': '报告',
    'Z6AdjustmentEntry': '报告', 'AuditAdjustingEntry': '报告',
    'MergeAdjustment': '报告', 'ReclassificationEntry': '报告',
    'UnadjustedMisstatement': '报告', 'BadDebtProvision': '报告',
    'ReviewRecord': '报告', 'ControlDeficiency': '报告',
    'RemediationRequirement': '报告', 'SubsequentEvent': '报告',
    'SpecialAuditCase': '报告',
}


def merge_object_types() -> int:
    """合并 v5 OT 进我们的 object_types.json。返回新增的数量。"""
    v5 = json.loads((V5_PAYLOAD / "object_types.json").read_text(encoding='utf-8'))
    our = json.loads((DATA_DIR / "object_types.json").read_text(encoding='utf-8'))

    existing_codes = {ot['code'] for ot in our}

    # 给我们已有的 OT 补 _layer 字段
    for ot in our:
        if '_layer' not in ot:
            ot['_layer'] = LAYER_MAP.get(ot['code'], 'L2:donglin')

    # v5 新增的 OT
    added = 0
    for v5_ot in v5:
        code = v5_ot['code']
        if code in existing_codes:
            continue
        new_ot = {
            '_cluster': CLUSTER_MAP.get(code, '辅助'),
            '_layer': LAYER_MAP.get(code, 'L2:donglin'),
            '_source': 'v5_import',
            'code': code,
            'display_name': v5_ot.get('display_name_zh') or v5_ot.get('display_name_en') or code,
            'icon': _pick_icon(code),
            'color': _pick_color(LAYER_MAP.get(code, 'L2:donglin')),
            'description': f"v5 引入 · {v5_ot.get('display_name_en', '')}",
            'properties_schema': [],
        }
        our.append(new_ot)
        added += 1

    # 写回（v5 来自 _source 标识，方便日后追溯）
    (DATA_DIR / "object_types.json").write_text(
        json.dumps(our, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )
    return added


def _pick_icon(code: str) -> str:
    # 简单根据名字猜图标
    if 'Sheet' in code or 'Workpaper' in code: return 'FileSpreadsheet'
    if 'Rule' in code or 'Assert' in code: return 'Scale'
    if 'Risk' in code or 'Fraud' in code: return 'AlertTriangle'
    if 'Report' in code or 'Opinion' in code: return 'FileText'
    if 'Confirm' in code: return 'Mail'
    if 'Asset' in code or 'Loan' in code: return 'Coins'
    if 'Voucher' in code or 'Journal' in code: return 'Receipt'
    return 'Box'


def _pick_color(layer: str) -> str:
    return {'L1': '#2563eb', 'L2': '#0d9488', 'L2:donglin': '#d97706'}.get(layer, '#64748b')


def merge_link_types() -> int:
    """合并 v5 LT。"""
    v5 = json.loads((V5_PAYLOAD / "link_types.json").read_text(encoding='utf-8'))
    our = json.loads((DATA_DIR / "link_types.json").read_text(encoding='utf-8'))

    existing = {lt[0] if isinstance(lt, list) else lt['code'] for lt in our}
    added = 0

    for v5_lt in v5:
        code = v5_lt['code']
        if code in existing:
            continue
        # 我们的 LT 是数组格式 [code, display_name, src, tgt, card]
        # v5 是字典格式
        our.append([
            code,
            code,  # display_name 直接用 code (中文名v5里没有)
            v5_lt.get('source_type_code', ''),
            v5_lt.get('target_type_code', ''),
            '1:N',  # 默认基数
        ])
        added += 1

    (DATA_DIR / "link_types.json").write_text(
        json.dumps(our, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )
    return added


def parse_fill_rules_ttl() -> tuple[list[dict], list[dict]]:
    """从 v5 fill_rules.ttl 抽出 FillRule + WorkpaperField 个体。
    返回 (fillrules, fields) 两个 instance 列表（我们 JSON 格式）。
    """
    text = V5_FILL_RULES.read_text(encoding='utf-8')

    # 1. WorkpaperField — 简单模式
    fields = []
    for m in re.finditer(
        r':field-([a-z0-9-]+)\s+a\s+owl:NamedIndividual,\s*:WorkpaperField\s*;\s*'
        r':hasSheetName\s+"([^"]+)"\s*;\s*'
        r':hasCellAddress\s+"([^"]+)"\s*\.',
        text
    ):
        slug, sheet, cell = m.group(1), m.group(2), m.group(3)
        fields.append({
            'type_code': 'WorkpaperField',
            'display_name': f"{sheet}!{cell}",
            'data': {
                'code': f"field-{slug}",
                'hasSheetName': sheet,
                'hasCellAddress': cell,
                '_layer': 'L2:donglin',
                '_source': 'v5_fill_rules.ttl',
            }
        })

    # 2. FillRule — 锚定到下一条规则起点或文件结束
    rules = []
    rule_blocks_iter = re.finditer(
        r':(fillrule-[a-z0-9-]+)\s+a\s+owl:NamedIndividual,\s*:FillRule\s*;(.*?):appliesToWorkpaper\s+:(\S+?)\s*\.',
        text, re.DOTALL
    )
    for m in rule_blocks_iter:
        slug = m.group(1)
        body = m.group(2)
        applies = m.group(3)
        # 解析字段
        kind_m = re.search(r':hasRuleKind\s+"([^"]+)"', body)
        formula_m = re.search(r':hasFormulaExpression\s+"([^"]+)"', body)
        evidence_m = re.search(r':hasEvidenceRef\s+"([^"]+)"', body)
        output_m = re.search(r':outputField\s+:(\S+)', body)
        inputs = re.findall(r':inputField\s+:(\S+)', body)
        applies_m = applies  # 已从外部捕获
        label_m = re.search(r'rdfs:label\s+"([^"]+)"@en', body)

        rules.append({
            'type_code': 'FillRule',
            'display_name': label_m.group(1) if label_m else slug,
            'data': {
                'code': slug,
                'hasRuleKind': kind_m.group(1) if kind_m else None,
                'hasFormulaExpression': formula_m.group(1) if formula_m else None,
                'hasEvidenceRef': evidence_m.group(1) if evidence_m else None,
                'outputField': output_m.group(1) if output_m else None,
                'inputFields': inputs,
                'appliesToWorkpaper': applies_m,
                '_layer': 'L2:donglin',
                '_source': 'v5_fill_rules.ttl',
            }
        })

    return rules, fields


def merge_fill_rules_as_instances() -> tuple[int, int]:
    """把 FillRule + WorkpaperField 作为 ObjectInstance 合并进 object_instances.json"""
    rules, fields = parse_fill_rules_ttl()

    our = json.loads((DATA_DIR / "object_instances.json").read_text(encoding='utf-8'))

    # 找最大 id
    max_id = max((o.get('id', 0) for o in our), default=0)
    existing_keys = {f"{o['type_code']}::{(o.get('data') or {}).get('code')}" for o in our}

    fields_added = 0
    for f in fields:
        key = f"WorkpaperField::{f['data']['code']}"
        if key in existing_keys:
            continue
        max_id += 1
        our.append({
            'id': max_id,
            'key': key,
            'type_code': 'WorkpaperField',
            'display_name': f['display_name'],
            'data': f['data'],
        })
        existing_keys.add(key)
        fields_added += 1

    rules_added = 0
    for r in rules:
        key = f"FillRule::{r['data']['code']}"
        if key in existing_keys:
            continue
        max_id += 1
        our.append({
            'id': max_id,
            'key': key,
            'type_code': 'FillRule',
            'display_name': r['display_name'],
            'data': r['data'],
        })
        existing_keys.add(key)
        rules_added += 1

    (DATA_DIR / "object_instances.json").write_text(
        json.dumps(our, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )
    return rules_added, fields_added


def main():
    print("[v5-migrate] 1. 合并 ObjectType...")
    n_ot = merge_object_types()
    print(f"    新增 {n_ot} 个 ObjectType")

    print("[v5-migrate] 2. 合并 LinkType...")
    n_lt = merge_link_types()
    print(f"    新增 {n_lt} 个 LinkType")

    print("[v5-migrate] 3. 解析 fill_rules.ttl 并合并...")
    n_rules, n_fields = merge_fill_rules_as_instances()
    print(f"    新增 {n_rules} 条 FillRule + {n_fields} 个 WorkpaperField (ObjectInstance)")

    print("[v5-migrate] ✓ 完成。请重启 backend 让 seed_donglin 重新加载。")


if __name__ == "__main__":
    main()

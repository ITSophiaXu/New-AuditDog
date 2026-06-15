"""注入公共法规库 — 中注协 CSA / 财政部 CAS / 国务院税法 ~30 条实例。

补 4 件事：
  1. 加 OT AccountingStandard / LawArticle (如不存在)
  2. 加 ~30 条法规 ObjectInstance
  3. 给每条 AuditRule 加 references_standards
  4. PaperTemplate.sheets 扩到 11 个真实子表
  5. default_rules 扩到全部 12 条
"""
from __future__ import annotations
from datetime import datetime

from sqlmodel import Session, select

from ..db import engine
from ..models import ObjectInstance, ObjectType


# ── 法规库定义 ──────────────────────────────────────────────
CSA_STANDARDS = [  # 中注协 (审计准则)
    ("CSA 1101", "注册会计师对财务报表审计的总体目标", "中注协", "2010-11-01"),
    ("CSA 1141", "财务报表审计中对舞弊的考虑",         "中注协", "2010-11-01"),
    ("CSA 1211", "通过了解被审计单位及其环境识别和评估重大错报风险", "中注协", "2010-11-01"),
    ("CSA 1221", "计划审计工作和应对评估的重大错报风险", "中注协", "2010-11-01"),
    ("CSA 1231", "针对评估的重大错报风险实施的程序",     "中注协", "2010-11-01"),
    ("CSA 1301", "审计证据",                          "中注协", "2010-11-01"),
    ("CSA 1311", "函证",                              "中注协", "2010-11-01"),
    ("CSA 1313", "分析程序",                          "中注协", "2010-11-01"),
    ("CSA 1324", "持续经营",                          "中注协", "2010-11-01"),
    ("CSA 1411", "银行存款审计",                       "中注协", "2023-12-01"),
    ("CSA 1502", "在审计报告中增加强调事项段和其他事项段", "中注协", "2010-11-01"),
    ("CSA 1551", "关联方",                            "中注协", "2010-11-01"),
    ("CSA 1601", "对集团财务报表审计的特殊考虑",       "中注协", "2010-11-01"),
]

CAS_STANDARDS = [  # 财政部 (企业会计准则)
    ("CAS 1",  "存货",                       "财政部", "2006-02-15"),
    ("CAS 4",  "固定资产",                   "财政部", "2006-02-15"),
    ("CAS 8",  "资产减值",                   "财政部", "2006-02-15"),
    ("CAS 9",  "职工薪酬",                   "财政部", "2014-01-27"),
    ("CAS 14", "收入",                       "财政部", "2017-07-05"),
    ("CAS 16", "政府补助",                   "财政部", "2017-05-10"),
    ("CAS 19", "外币折算",                   "财政部", "2006-02-15"),
    ("CAS 22", "金融工具确认和计量 (ECL 模型)", "财政部", "2017-03-31"),
    ("CAS 28", "会计政策、会计估计变更和差错更正", "财政部", "2006-02-15"),
    ("CAS 30", "财务报表列报",                "财政部", "2014-01-26"),
    ("CAS 36", "关联方披露",                  "财政部", "2006-02-15"),
    ("企业会计制度", "1993 体系", "财政部", "1993-06-23"),
]

TAX_LAWS = [  # 国家税法
    ("企税法第8条", "企业所得税法 第8条 (扣除项总则)",     "国务院", "2008-01-01"),
    ("企税法实施条例第43条", "招待费 5‰/60% 孰低",        "国务院", "2008-01-01"),
    ("企税法实施条例第44条", "广告宣传费扣除限额",        "国务院", "2008-01-01"),
    ("增值税法", "中华人民共和国增值税法",                "国务院", "2026-01-01"),
    ("出口退（免）税管理办法", "国税总局 2012年第24号公告", "国家税务总局", "2012-07-01"),
]


# ── AuditRule → 引用的法规 映射 ─────────────────────────────
RULE_REFERENCES = {
    "CASH-RULE-001":     ["CSA 1411", "CSA 1311"],
    "CASH-RULE-002":     ["CSA 1411", "CSA 1141"],
    "AR-RULE-001":       ["CAS 22", "CAS 30"],
    "AP-RULE-001":       ["CAS 22", "CAS 30"],
    "RP-RULE-001":       ["CSA 1551", "CAS 36"],
    "INV-RULE-001":      ["CAS 1", "CSA 1141"],
    "REV-RULE-001":      ["CSA 1141", "CAS 14"],
    "FA-RULE-001":       ["CSA 1221", "CAS 4", "CAS 8"],
    "TAX-RULE-001":      ["企税法第8条", "企税法实施条例第43条"],
    "TAX-RECLASS-001":   ["CAS 22", "出口退（免）税管理办法"],
    "GC-INDICATOR-001":  ["CSA 1324", "CSA 1502"],
    "DL-RULE-001":       ["CSA 1101"],
}


# ── 真实 11 个 sheet（用 template_layout.json 抽出来的）─────
REAL_SHEETS = [
    {"code": "A1",    "name": "货币资金（审定表）",     "kind": "summary",       "real_columns": 8},
    {"code": "A1-2",  "name": "货币资金明细表",         "kind": "detail",        "real_columns": 11},
    {"code": "A6",    "name": "应收账款（审定表）",     "kind": "summary",       "real_columns": 8},
    {"code": "A6-2",  "name": "应收账款明细表",         "kind": "detail",        "real_columns": 15},
    {"code": "A6-3",  "name": "应收账款函证情况汇总表", "kind": "confirmation",  "real_columns": 15},
    {"code": "A9",    "name": "其他应收款（审定表）",   "kind": "summary",       "real_columns": 8},
    {"code": "A9-2",  "name": "其他应收款明细表",       "kind": "detail",        "real_columns": 15},
    {"code": "A24",   "name": "固定资产（审定表）",     "kind": "summary",       "real_columns": 8},
    {"code": "A24-2", "name": "固定资产明细表",         "kind": "detail",        "real_columns": 12},
    {"code": "B1",    "name": "短期借款（审定表）",     "kind": "summary",       "real_columns": 8},
    {"code": "B1-2",  "name": "短期借款明细表",         "kind": "detail",        "real_columns": 10},
]


def seed_regulations(session: Session = None) -> dict[str, int]:
    if session is None:
        with Session(engine) as s:
            return _do(s)
    return _do(session)


def _do(s: Session) -> dict[str, int]:
    stats = {"OT_added": 0, "Standard_added": 0, "Law_added": 0,
             "Rule_updated": 0, "Template_updated": 0}

    # 1. 确保 AccountingStandard / LawArticle OT 存在
    existing_ot = {ot.code for ot in s.exec(select(ObjectType))}
    new_ots = []
    if "AccountingStandard" not in existing_ot:
        new_ots.append(ObjectType(
            code="AccountingStandard",
            display_name="会计/审计准则",
            description="[L1] [东林·法规] 中注协 CSA / 财政部 CAS / IFRS / ISA 等通用准则",
            icon="BookOpen", color="#0d9488", is_seed=True,
            properties_schema=[
                {"code": "code", "label": "准则编号", "type": "string", "required": True},
                {"code": "name", "label": "准则名", "type": "string"},
                {"code": "issuer", "label": "颁发单位", "type": "string"},
                {"code": "effective", "label": "生效日", "type": "date"},
                {"code": "category", "label": "类别", "type": "enum",
                 "enum": ["审计准则", "会计准则", "其他"]},
            ],
        ))
    if "LawArticle" not in existing_ot:
        new_ots.append(ObjectType(
            code="LawArticle",
            display_name="法律法规条款",
            description="[L1] [东林·法规] 国务院/财政部/税务总局 法律法规具体条款",
            icon="Scale", color="#be185d", is_seed=True,
            properties_schema=[
                {"code": "code", "label": "条款编号", "type": "string", "required": True},
                {"code": "name", "label": "条款标题", "type": "string"},
                {"code": "issuer", "label": "颁发单位", "type": "string"},
                {"code": "effective", "label": "生效日", "type": "date"},
            ],
        ))
    for ot in new_ots:
        s.add(ot)
        stats["OT_added"] += 1
    s.commit()

    # 2. 注入法规实例
    existing = {(o.type_code, (o.data or {}).get("code"))
                for o in s.exec(select(ObjectInstance))
                if o.type_code in ("AccountingStandard", "LawArticle")}

    # 中注协 CSA 准则
    for code, name, issuer, eff in CSA_STANDARDS:
        if ("AccountingStandard", code) in existing:
            continue
        s.add(ObjectInstance(
            type_code="AccountingStandard",
            display_name=f"{code} {name}",
            data={"code": code, "name": name, "issuer": issuer,
                  "effective": eff, "category": "审计准则",
                  "_layer": "L1", "_source": "中注协官方"},
        ))
        stats["Standard_added"] += 1

    # 财政部 CAS 准则
    for code, name, issuer, eff in CAS_STANDARDS:
        if ("AccountingStandard", code) in existing:
            continue
        s.add(ObjectInstance(
            type_code="AccountingStandard",
            display_name=f"{code} {name}",
            data={"code": code, "name": name, "issuer": issuer,
                  "effective": eff, "category": "会计准则",
                  "_layer": "L1", "_source": "财政部官方"},
        ))
        stats["Standard_added"] += 1

    # 税法
    for code, name, issuer, eff in TAX_LAWS:
        if ("LawArticle", code) in existing:
            continue
        s.add(ObjectInstance(
            type_code="LawArticle",
            display_name=f"{code} {name}",
            data={"code": code, "name": name, "issuer": issuer,
                  "effective": eff, "_layer": "L1",
                  "_source": "国务院/国家税务总局"},
        ))
        stats["Law_added"] += 1
    s.commit()

    # 3. 给每条 AuditRule 加 references_standards
    rules = list(s.exec(select(ObjectInstance).where(
        ObjectInstance.type_code == "AuditRule")))
    for r in rules:
        d = dict(r.data or {})
        rule_code = d.get("code")
        if rule_code in RULE_REFERENCES:
            d["references_standards"] = RULE_REFERENCES[rule_code]
            r.data = d
            s.add(r)
            stats["Rule_updated"] += 1
    s.commit()

    # 4. 更新 PaperTemplate.sheets (11 真实) + default_rules (全 12 条)
    tpl = next((o for o in s.exec(select(ObjectInstance).where(
        ObjectInstance.type_code == "PaperTemplate"))
        if (o.data or {}).get("code") == "TPL-DL-FY2025"), None)
    if tpl:
        d = dict(tpl.data or {})
        d["sheets"] = REAL_SHEETS
        all_rule_codes = [(r.data or {}).get("code") for r in rules
                          if (r.data or {}).get("code")]
        d["default_rules"] = sorted(all_rule_codes)
        d["_note"] = "sheets 是 11 个 demo 用真实子表 (从 WP_FSR.xlsm 抽取); default_rules 含全部 12 条业务规则"
        tpl.data = d
        s.add(tpl)
        stats["Template_updated"] = 1
    s.commit()

    return stats


if __name__ == "__main__":
    stats = seed_regulations()
    print(f"[seed_regulations] {stats}")

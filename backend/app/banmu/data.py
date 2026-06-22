"""己公司（信息技术） — Mock accounting data for demo purposes."""
from __future__ import annotations

COMPANY_INFO: dict = {
    "name": "己公司（信息技术）",
    "short_name": "己公司",
    "eng_code": "ENG-BANMU-2024",
    "year_end": "2024-12-31",
    "industry": "软件信息服务",
    "industry_code": "I65",
    "legal_rep": "陈伟峰",
    "registered_capital": 5_000_000.0,
    "established": "2016-03-15",
    "address": "无锡市高新技术产业开发区软件园A座1201",
    "business_scope": "软件开发、信息系统集成、数据处理及存储服务",
    "employees": 68,
    "auditor": "甲会计师事务所",
}

# 试算平衡表 (year-end balances; debit=positive, credit=negative)
TB: list[dict] = [
    # 流动资产
    {"code": "1001", "name": "库存现金",     "balance":    12_345.00},
    {"code": "1002", "name": "银行存款",     "balance": 3_444_456.00},
    {"code": "1012", "name": "其他货币资金", "balance":   500_000.00},
    {"code": "1122", "name": "应收账款",     "balance": 12_345_678.00},
    {"code": "1221", "name": "其他应收款",   "balance":   456_789.00},
    {"code": "1405", "name": "预付账款",     "balance":   234_567.00},
    # 非流动资产
    {"code": "1606", "name": "固定资产",     "balance": 3_456_789.00},
    {"code": "1608", "name": "累计折旧",     "balance": -1_234_567.00},
    {"code": "1701", "name": "无形资产",     "balance": 2_345_678.00},
    {"code": "1702", "name": "累计摊销",     "balance":  -567_890.00},
    # 流动负债
    {"code": "2202", "name": "应付账款",     "balance": -1_234_567.00},
    {"code": "2203", "name": "预收账款",     "balance":  -890_123.00},
    {"code": "2221", "name": "应付职工薪酬", "balance": -1_456_789.00},
    {"code": "2241", "name": "其他应付款",   "balance":  -234_567.00},
    # 非流动负债
    {"code": "2501", "name": "长期借款",     "balance": -2_000_000.00},
    # 所有者权益
    {"code": "4001", "name": "实收资本",     "balance": -5_000_000.00},
    {"code": "4002", "name": "资本公积",     "balance": -1_000_000.00},
    {"code": "4101", "name": "盈余公积",     "balance":  -500_000.00},
    {"code": "4104", "name": "未分配利润",   "balance": -8_677_799.00},
    # 损益（当期，年末未结转）
    {"code": "6001", "name": "主营业务收入", "balance": -45_678_901.00},
    {"code": "6051", "name": "其他业务收入", "balance":    -456_789.00},
    {"code": "6401", "name": "主营业务成本", "balance": 28_901_234.00},
    {"code": "6601", "name": "销售费用",     "balance":  3_456_789.00},
    {"code": "6602", "name": "管理费用",     "balance":  4_567_890.00},
    {"code": "6603", "name": "财务费用",     "balance":    123_456.00},
    {"code": "6711", "name": "营业外支出",   "balance":     12_345.00},
    {"code": "6801", "name": "所得税费用",   "balance":  1_093_938.00},
]

# 应收账款客户明细
AR_DETAIL: list[dict] = [
    {"code": "C001", "name": "上海锐智科技有限公司",   "balance": 3_456_789.00, "overdue_days": 45,  "invoice_date": "2024-10-15", "related": False},
    {"code": "C002", "name": "北京云途信息技术有限公司","balance": 2_345_678.00, "overdue_days": 89,  "invoice_date": "2024-09-28", "related": False},
    {"code": "C003", "name": "深圳格信数据服务有限公司","balance": 1_890_234.00, "overdue_days": 12,  "invoice_date": "2024-12-01", "related": False},
    {"code": "C004", "name": "成都天枢软件有限公司",    "balance": 1_567_890.00, "overdue_days": 156, "invoice_date": "2024-07-20", "related": False},
    {"code": "C005", "name": "无锡斑华科技有限公司",    "balance": 1_234_567.00, "overdue_days": 0,   "invoice_date": "2024-12-15", "related": True},
    {"code": "C006", "name": "杭州维翔网络科技有限公司","balance":   890_123.00, "overdue_days": 67,  "invoice_date": "2024-10-01", "related": False},
    {"code": "C007", "name": "其他客户（合计12家）",    "balance":   960_397.00, "overdue_days": 30,  "invoice_date": "2024-11-30", "related": False},
]

# 客户材料：关联方
CLIENT_MATERIALS: dict = {
    "related_parties": [
        {
            "name": "无锡斑华科技有限公司",
            "relationship": "同一实际控制人（陈伟峰控制）",
            "transaction_type": "软件服务销售",
            "balance": 1_234_567.00,
            "note": "需确认交易定价是否公允",
        },
        {
            "name": "陈伟峰",
            "relationship": "法定代表人 / 控股股东",
            "transaction_type": "其他应收款（个人借款）",
            "balance": 234_567.00,
            "note": "个人借款，需确认还款计划",
        },
    ],
    "going_concern_risks": [],
}


def get_totals() -> dict:
    """Calculate key financial totals from TB."""
    revenue        = 45_678_901 + 456_789           # 46,135,690
    total_assets   = (
        12_345 + 3_444_456 + 500_000 + 12_345_678 + 456_789 + 234_567
        + (3_456_789 - 1_234_567) + (2_345_678 - 567_890)
    )                                                # 20,993,845
    total_liab     = 1_234_567 + 890_123 + 1_456_789 + 234_567 + 2_000_000  # 5,816,046
    net_assets     = total_assets - total_liab       # 15,177,799
    profit_bt      = (
        revenue
        - 28_901_234   # cost
        - 3_456_789    # selling
        - 4_567_890    # admin
        - 123_456      # finance
        - 12_345       # other
    )                                                # 9,073,976
    return {
        "revenue":           revenue,
        "total_assets":      total_assets,
        "total_liabilities": total_liab,
        "net_assets":        net_assets,
        "profit_before_tax": profit_bt,
        "ar_balance":        12_345_678,
    }

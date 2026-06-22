# 底稿 Agent 填写过程演示

> 演示 `jsdw_paper_fill` 智能体如何**消费本体知识库**填写甲公司 2025 年度审计底稿。
> 全程明确标注每一步使用的 **ObjectType / LinkType / ActionType / ObjectInstance / LinkInstance / AuditRule**。

## 演示范围

| 底稿 | 包含 |
|---|---|
| **A1 货币资金** | 审定表 (summary) + 银行存款明细表 (bank_detail) + 库存现金盘点明细 (cash_count) |
| **A6 应收账款** | 审定表 (summary) + 客户明细表 (customer_detail) + 账龄分析 (aging_analysis) |

## 文件结构

| 文件 | 用途 |
|---|---|
| `README.md` | 本文件 |
| `01_agent_workflow.md` | 智能体通用工作流 + 本体调用模型 |
| `02_paper_A1_cash.md` | A1 货币资金端到端填写过程（含本体调用追踪表）|
| `03_paper_A6_ar.md` | A6 应收账款端到端填写过程（含本体调用追踪表）|
| `04_ontology_usage_summary.md` | 全程本体使用统计 + 调用图 |
| `filled_A1_workingpaper.json` | A1 填后的 WorkingPaper.sheet_data |
| `filled_A6_workingpaper.json` | A6 填后的 WorkingPaper.sheet_data |
| `agent_run_log.json` | 模拟的 AgentRun 执行日志（agent_runs 表的一行）|

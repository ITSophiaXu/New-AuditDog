# 01 智能体通用工作流

## Agent 来源

```jsonc
// agents.json — code = "jsdw_paper_fill"
{
  "code": "jsdw_paper_fill",
  "name": "江苏大王 · 底稿填写助手",
  "scenario": "working_paper_fill",
  "system_prompt": "你是一名资深审计经理，按东林 442-sheet 模板填写江苏大王通风机械 2025 年度审计底稿。工作流程：(1) get_trial_balance 读取 2025-12-31 TB；(2) 对 A1/A6/A9/A10/A24/B1/B6/B9/D1 九张主底稿逐一 fill_sheet；(3) 对每张底稿调用 apply_rule 应用 default_rules；(4) 发现异常调用 flag_anomaly；(5) 对借贷余额异常的客户/供应商生成 propose_adjustment 写回 Z6。",
  "tools": [
    { "kind": "query",  "ref": "get_trial_balance" },
    { "kind": "query",  "ref": "get_vouchers_by_account" },
    { "kind": "action", "ref": "FillSheet" },           // ActionType
    { "kind": "action", "ref": "ApplyRule" },           // ActionType
    { "kind": "action", "ref": "FlagAnomaly" },         // ActionType
    { "kind": "action", "ref": "ProposeAdjustment" }    // ActionType
  ],
  "retrieval_object_types": [
    "WorkingPaper",    // 当前要填的底稿
    "PaperTemplate",   // 模板（sheet 结构与默认规则）
    "AuditRule",       // 适用的审计规则
    "Account"          // 涉及的会计科目
  ]
}
```

## 通用填写流程（5 步法）

```
┌──────────────────────────────────────────────────────────────────────┐
│ Step 1: 检索上下文 (retrieval)                                        │
│   ──> Query ObjectInstance by retrieval_object_types                  │
│   ──> 通过 LinkInstance 遍历相关对象                                  │
├──────────────────────────────────────────────────────────────────────┤
│ Step 2: 数据计算 (compute)                                            │
│   ──> 从 Account / TrialBalance / Voucher 抽取数值                    │
│   ──> 按 PaperTemplate.sheets[].fields/columns 组装                  │
├──────────────────────────────────────────────────────────────────────┤
│ Step 3: 调用 FillSheet (action.kind=fill_sheet)                       │
│   ──> 写入 WorkingPaper.sheet_data[sheet_code]                       │
│   ──> 原子提交                                                        │
├──────────────────────────────────────────────────────────────────────┤
│ Step 4: 调用 ApplyRule (action.kind=apply_rule)                      │
│   ──> 对 WorkingPaper 应用每条 default_rules                         │
│   ──> 返回 passed / finding                                          │
├──────────────────────────────────────────────────────────────────────┤
│ Step 5: 异常处理 (condition)                                         │
│   ──> 规则未过：调用 FlagAnomaly (action.kind=flag) 创建 Anomaly     │
│   ──> 需调整：调用 ProposeAdjustment (target=Engagement) 写入 Z6     │
└──────────────────────────────────────────────────────────────────────┘
```

## 本体调用追踪格式

为方便审计师追溯，每一步用以下符号标注本体元素：

| 符号 | 含义 | 示例 |
|---|---|---|
| `📦 OT::xxx` | ObjectType（对象类型）| `📦 OT::WorkingPaper` |
| `🔗 LT::xxx` | LinkType（关系类型）| `🔗 LT::PaperConcernsAccount` |
| `⚡ AT::xxx` | ActionType（操作类型）| `⚡ AT::FillSheet` |
| `📋 OI#id` | ObjectInstance（实例）| `📋 OI#28 (WP-A1-2025)` |
| `→ LI` | LinkInstance（链接）| `→ LI (PaperConcernsAccount: 28 → 38)` |
| `📜 Rule::xxx` | AuditRule（审计规则）| `📜 Rule::CASH-RULE-001` |

## 关键设计点

1. **Agent 不发明数据** —— 所有数值必须来自现有 ObjectInstance（Account/TrialBalance/Voucher）。
2. **Agent 不绕过本体** —— 所有写操作必须通过 ActionType（不能直接 UPDATE 数据库）。
3. **每次调用都有溯源** —— `AgentRun.tool_calls` 表记录每次 ActionType 调用的参数与结果。
4. **规则失败必触发异常** —— ApplyRule 返回 passed=false 时，Agent 必须调用 FlagAnomaly。
5. **重大调整必走 Z6** —— 调整金额 > TE (115,908.53) 时必须调用 ProposeAdjustment 而非直接修改科目。

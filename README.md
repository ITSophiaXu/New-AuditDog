# 审计本体 · Audit Ontology

Palantir Foundry 风格的「本体 + 智能体」原型平台，面向会计师事务所的财务年审场景。

> **本仓库 vs 上游 leizhai2025/pilot-demo**
> 此仓库 fork 自 `leizhai2025/pilot-demo`，并集成了 **东林事务所审计本体 + 江苏大王 2025 年度案例底稿填写过程**（位于 `backend/data/donglin/` 与 `backend/app/donglin/`）。
> 上游为通用骨架；本仓库为真实案例落地。

## 东林事务所本体扩展

### 本体规模（接入数据库后）
- **50** 个 ObjectType（10 大簇：客户/项目/数据/审计区域/认定/风险/程序/证据/底稿/报告）
- **73** 个 LinkType（关系定义）
- **11** 个核心 ActionType（Read/Map/Standardize/Sample/Reconcile/Recompute/Explain/Generate/Review/SignOff/Archive）
- **95+** 个 ObjectInstance（江苏大王 2025 实例数据）
- **117+** 个 LinkInstance
- **4** 个智能体（底稿填写/方案生成/异常分析/高新专项）

### 5 张端到端填好的底稿（含本体追溯）
- **A1 货币资金** — Read 10 子目 + Map BANK_MAP + 截止测试（4 个子表）
- **A6 应收账款** — 458 客户 + AR-RULE-001 触发 ¥7.11M 重分类 + FIFO 真账龄
- **A9 其他应收款** — 1133 出口退税反向余额触发 TAX-RECLASS-001 ¥430K 重分类
- **A24 固定资产** — 折旧重算按 CSA 1221 四级梯度（SUM/TE/PM）判定
- **B1 短期借款** — 5 笔贷款利息重算 + 100% 关联担保触发 GC-INDICATOR-001 持续经营关注

### 4,250+ 单元格级本体追溯
每个填入的单元格都附带 `cell_provenance`，记录其来自哪个 📦 OT / ⚡ AT / 📜 Rule。

### 东林相关 API 端点
- `GET  /api/donglin/papers` — 5 张已填底稿元数据
- `GET  /api/donglin/papers/{A1|A6|A9|A24|B1}` — 单张底稿完整内容
- `POST /api/donglin/fill/{A1|A6|A9|A24|B1}` — 触发 Agent 重新填稿（读 input/ 客户数据 → 写回 DB）
- `GET  /api/donglin/provenance/{paper_code}` — 该底稿的全部单元格追溯
- `GET  /api/donglin/adjustments` — Agent 提议的调整分录 (Z6-AI-*)
- `GET  /api/donglin/agent-runs` — 5 次 agent_run 完整调用日志
- `GET  /donglin` — 跳转到单文件 demo HTML（无需启动后端也能看）

### 文件结构
```
backend/
├── app/
│   ├── donglin/                 ← 东林样式底稿填写代码
│   │   ├── __init__.py
│   │   ├── fill.py              # 5 个 fill_<paper> 函数 (1500+ 行)
│   │   └── router.py            # /api/donglin/* HTTP 接口
│   ├── seed_donglin.py          # 装载东林本体到 SQLite
│   ├── seed.py                  # 主 seed (尾部调 seed_donglin)
│   └── main.py                  # 主路由 (尾部 mount donglin_router)
└── data/
    └── donglin/                 ← 东林本体 + 客户数据
        ├── object_types.json    # 50 类
        ├── link_types.json      # 73 关系
        ├── action_types.json    # 11 动作
        ├── object_instances.json # 95+ 实例
        ├── link_instances.json
        ├── agents.json          # 4 个 agent
        ├── audit_ontology_review.html  # 单文件离线 demo (1.5 MB)
        ├── input/               # 客户原始财务数据 (匿名)
        │   ├── input_tb.xlsx        科目余额表
        │   ├── input_aux.xlsx       辅助核算
        │   └── input_vouchers.xlsx  序时账凭证 12,620 笔
        └── agent_demo/          # Agent 填后输出 (作为 seed 数据)
            ├── filled_A1/A6/A9/A24/B1_workingpaper.json
            ├── cell_provenance.json  # 4,250+ 追溯条目
            ├── agent_run_log.json    # 5 次 agent_run
            ├── proposed_adjustments.json  # 2 笔 PAJE
            └── agent_fill.py         # (复用版本已迁至 app/donglin/fill.py)
```

### 关闭东林 seed (如只想用上游 demo)
```bash
export AUDIT_ONTOLOGY_SKIP_DONGLIN=1
```

---

## 这是什么

把会计师事务所沉淀多年的**底稿模板 / 审计规则 / 行业 expertise**，建模为可执行的**本体（Ontology）**——
然后让**智能体**直接读取本体上下文、写回底稿、执行规则、识别异常。

第一个版本完整跑通了「**财务年审 · 货币资金底稿填写**」端到端流程，并预置了其他三个场景的智能体模板：

- ✅ **底稿填写** (Working Paper Fill) — 完整可演示
- 🟡 **方案生成** (Plan Generation) — 智能体已预置，待对接业务逻辑
- 🟡 **异常分析** (Anomaly Analysis) — 智能体已预置
- 🟡 **专项审计** (Special Audit) — 智能体已预置

## Palantir 设计映射

| Palantir Foundry / AIP | 本原型 |
|---|---|
| Ontology Manager (OMA) | 本体管理页 — 对象类型 / 链接 / 操作 / 图谱 |
| Object Type | 审计项目、底稿、模板、审计规则、凭证 … |
| Action Type | 填写底稿、标记异常、应用规则、附加证据 |
| Object Explorer | 数据浏览页 |
| AIP Chatbot Studio | 智能体工作室 — 提示词 / 工具 / 检索上下文 |
| Workshop | 底稿工作台 — 三栏面向终端用户的应用 |
| Ontology MCP (OMCP) | MCP 工具页 — 外部集成清单 |
| Ontology Augmented Generation | 智能体配置中的「检索上下文」 |

## 启动方式

需要 Python 3.11+ 与 Node.js 20+。

**Windows**:

```
start.bat
```

**macOS / Linux**:

```
./start.sh
```

或手动：

```bash
# 后端
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows
# . .venv/bin/activate; pip install -r requirements.txt   # macOS / Linux
uvicorn app.main:app --reload --port 8000

# 前端（另开一个终端）
cd frontend
npm install
npm run dev
```

打开 <http://127.0.0.1:5173>。

## LLM 配置

复制 `backend/.env.example` 为 `backend/.env`：

```
GITHUB_TOKEN=ghp_xxx
MODEL_ID=openai/gpt-4o
```

GitHub Models API 是 OpenAI 兼容的推理服务，
申请 token：<https://github.com/settings/tokens>（勾选 `models:read`）。

**不设置 token 也可以**——后端会进入 **DEMO 模式**，
为「货币资金底稿填写」流程返回一段确定性的脚本，便于不带 key 演示。

## 演示路径（5 分钟）

1. **首页**：查看进行中项目、本体规模、已部署智能体。
2. **本体管理**：打开 `底稿` 对象类型 → 属性 / 链接 / 操作 / 图谱。
3. **底稿工作台**（demo 主场）：
   - 选中 `A1 货币资金 - 星河制造 2025`
   - 点击 `AI 填写`，或在右侧聊天面板输入 `请帮我填写`
   - 观察智能体：读取试算平衡表 → 查询凭证 → 写回 5 个字段 → 应用 3 条审计规则
4. **智能体工作室**：打开 `货币资金底稿填写助手`，修改提示词或勾选/去勾选工具，保存。
5. **MCP 工具**：浏览外部集成清单（filesystem / excel / 银行询证函）。
6. **场景模板**：4 个场景卡片，1 个可演示，3 个 stub 预置。

## 仓库结构

```
audit-ontology/
├── backend/             # FastAPI + SQLModel + SQLite
│   └── app/
│       ├── models.py        # 本体表 + 实例表 + 智能体配置 + MCP 注册
│       ├── seed.py          # 内置 11 种对象类型 / 9 条链接 / 4 个操作 + 示例数据 + 4 个智能体
│       ├── ontology/        # 本体 CRUD + action execution
│       ├── agents/          # 智能体 CRUD + 运行循环（runner）
│       ├── llm.py           # GitHub Models API 调用（OpenAI-compatible）
│       └── mcp_registry.py  # MCP 服务注册
└── frontend/            # React + Vite + TS + Tailwind v4 + shadcn-style
    └── src/
        ├── pages/           # Home / OntologyManager / ObjectExplorer / WorkingPaperWorkbench / AgentStudio / MCPServers / ScenarioTemplates
        ├── components/      # ui (Button/Card/...) / ontology (LinkGraph) / agent (ChatPanel/ToolPicker)
        └── lib/             # api / types / utils
```

## 已知限制（v1）

- 无登录 / 多租户 / 操作审计日志
- 规则评估为占位实现（每条规则默认通过）；真实校验逻辑应在 `agents/runner.py:apply_rule` 内
- MCP 调用为 stub —— 没有真实启动外部 server。`tools` 列表来自数据库种子
- 仅简体中文；i18n 留作 v2
- 本体编辑限于属性查看；新增 / 修改对象类型的表单留作 v2

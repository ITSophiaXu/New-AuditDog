# 东林事务所底稿模板

## 文件说明

| 文件 | 含义 | 是否入 git |
|---|---|---|
| `WP_FSR_donglin.xlsm` | 真实东林 442-sheet 财务报表审计底稿模板（27 MB） | ❌ 不入 git（太大） |
| `template_layout.json` | 从 .xlsm 抽取的 11 个 demo sheet 的真实表头 + 列结构 | ✅ |
| `real_summary_rows.json` | 5 张 demo 底稿主表的真实"项目"列分类（报表数 / 明细账 / 账面余额 / 等） | ✅ |

## 部署时如何获取 .xlsm

`WP_FSR_donglin.xlsm` 是真实东林底稿模板，**包含审计师个人信息**，不入版本控制。

部署时需要从原始来源拷贝（如内部 fileshare / 审计师本机 audit-knowledge 目录）：

```bash
# 例：从开发者本地拷贝
cp "C:/Users/yingx/audit-knowledge/WP_FSR.xlsm" backend/data/donglin/templates/WP_FSR_donglin.xlsm
```

没有这个文件 `GET /api/donglin/export-xlsx/{code}` 接口会返回 500。

## 重抽 layout（升级模板版本时）

如果东林发了新版模板（如 2025X05A），重跑：

```bash
cd backend
python -m app.donglin.extract_template_layout
```

会更新 `template_layout.json` + `real_summary_rows.json`。

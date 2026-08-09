# 搜索约束设计（防幻觉 + 省 token）

> 替代 TJ 自建 open-webSearch daemon 的方案，效果等价且零新增服务。

## 1. 搜索源

- **Exa**（已接入 mcporter）：`mcporter call 'exa.web_search_exa(query: "...", numResults: 5)'`
- 需要领域限定时加 `site:` 白名单（如 `site:arxiv.org`、`site:mp.weixin.qq.com`）
- 不要用裸搜索引擎直接灌结果——必须经 Exa 语义检索（相关性更高）

## 2. 防幻觉硬规则（写进每个拆解 prompt）

1. **所有论断必须来自搜索结果**；没有来源的标注「（推断）」
2. 引用格式：`[来源N]`，来源列表附在回答尾部
3. 搜索不到的内容：显式说「未检索到」，禁止编造
4. 数字/日期/人物头衔必须有来源

## 3. 缓存策略（省 token）

- 缓存文件：`~/.cache/kd_search.json`（主题 hash → 结果，TTL 7 天）
- 同主题同查询不重复搜
- 每个节点最多 1 次搜索、结果截断 3-5 条（每条截断 200 字）

## 4. 流程

```
节点需要检索？
  → 查缓存（命中直接用）
  → 未命中 → Exa 搜索（3-5 条）→ 存缓存
  → 结果格式化（截断）→ 拼进 volatile 数据 → LLM 引用
```

## 5. 与 TJ 的差异说明

- TJ：自建 open-webSearch daemon（:3210，Node，随主服务起停）
- 移植版：Exa MCP（已装，mcporter）——无守护进程、无需维护、同样可加白名单
- 效果对比：Exa 语义检索相关性更稳；TJ daemon 的优点（完全本地）用缓存弥补

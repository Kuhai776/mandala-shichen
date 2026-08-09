# 编排情报（TRAE 实现底层代码的依据）

> 来源：TJ `knowledge.py`（136KB）+ `prompt_defaults.py` + `ai.py` 逆向提炼。
> 目标：让 TRAE 用这些规则重写一个**轻量编排器**（不依赖 FastAPI/DB/SSE）。

## 1. LLM 调用底座

- OpenAI 兼容接口（`/v1/chat/completions`），默认 DeepSeek（`deepseek-chat`，base_url `https://api.deepseek.com/v1`）
- 换模型改 `base_url` + `model` 即可（Moonshot/vLLM/OpenRouter 都行）
- **usage 处理**：DeepSeek 的 `prompt_cache_hit_tokens` 在 `model_extra` 里，可用来算缓存命中省钱

## 2. 消息组装（核心）

```
顺序 = [固定输出规则] + [固定 task/instructions/json_schema] + [每轮会变的 volatile 数据]
```

- 固定部分放 system/首个 user 消息（**prompt 缓存友好**，每轮不变）
- volatile 以 JSON dump 追加（`ensure_ascii=False`）
- 每个 prompt 自带 json_schema 约束（结构化输出，防发散）

## 3. 节点 JSON 结构（NodeOut-shape）

```json
{
  "id": "n-xxx",
  "title": "节点标题",
  "parent_id": "n-parent | null",
  "thought": "拆解思路（可选）",
  "children": [ ...递归... ],
  "relevance": true,
  "relevance_score": 3
}
```

- `relevance_score` 钳制 1-3：`relevance=True → 3`，否则默认 2
- 一级节点=分组卡片（抽象领域块），二级=具体知识点（两步法）

## 4. 流程事件（核心链路）

| 事件 | 触发 | 载荷 |
|---|---|---|
| `initial_map` | 主题确认 | topics[].children[]（两层树） |
| `grow_children` | 用户点展开 | parent_id, parent_title, children[]（NodeOut） |
| `branch_done` | 展开完成 | parent_id, parent_title, children[] |
| `fp_layer` | 首性原理 | parent_id, parent_title, children[], reached_bottom |
| `subdivide` | 细分节点 | 节点 + 已有 children 标题（**≤12 个**） |
| `deep_reanswer` | 深度重答 | 消息 + 问题 |

## 5. 预览-确认流程

1. `preview_topics`：AI 先出 4-6 个候选主题（标题+一句话）让用户确认
2. 用户确认/覆盖 → `topics_override` 直接建主干（不再调 AI 拆树）
3. children 留空，由后续 `grow_children` 流式补齐

## 6. 上下文管理（省 token 关键）

- 传给 AI 的已有 children 标题**截断到 12 个**
- `existing_children_of_this_node` 按标题排序后截断
- 每个节点独立调用（不累积全树上下文）
- 消息按节点维度组装，不把整个树塞进单次调用

## 7. 结构化输出机制

- 每个 prompt 带 `json_schema`（task/instructions 固定 + schema 固定）
- 模型输出 JSON 后校验：缺字段重试一次；`relevance_score` 超界钳制
- 「只输出 JSON」写在 prompt 里（防止 markdown 包裹）

## 8. 降本要点（移植时保持）

- **prompt 缓存**：固定规则+json_schema 放首条消息（DeepSeek 缓存命中省 90%）
- **节点级调用**：不整树重算，只算当前节点
- **截断**：children 标题 ≤12、搜索结果 ≤5 条
- **低档模型**：拆解用 deepseek-chat 即可（TJ 默认就是）

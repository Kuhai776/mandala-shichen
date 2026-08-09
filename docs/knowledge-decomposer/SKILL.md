---
name: knowledge-decomposer
description: 知识拆解器（移植自 TJ AI 知识地图）。输入主题 → 两层知识地图 → 节点细分 → 首性原理 → 多角度细分 → 高亮卡片，产出写 wiki + 曼陀罗。触发词：拆解、知识地图、学习地图、帮我拆、首性原理、主题拆解、knowledge map。
---

# Knowledge Decomposer（知识拆解器）

> 移植自 TJ AI 知识地图核心能力。12 个原始 prompt 在 `references/prompts/`（原样保留，一字不改）。

## 核心工作流（6 步）

```
① 初始地图   INITIAL_MAP      → 主题 → 两层 JSON 树（分组卡片→具体节点）
② 细分       SUBDIVIDE        → 节点 → 子节点（带 relevance_score）
③ 首性原理   FIRST_PRINCIPLES → 节点 → 底层假设/公理层
④ 多角度     MULTI_ANGLE_SUBDIVIDE → 节点 → 不同视角的拆法
⑤ 深度重答   DEEP_REANSWER    → 追问/深挖
⑥ 高亮卡片   PEEK/EXPLAIN     → 生成知识卡片 → 双写
```

## 输出契约（硬约束）

- 只输出 JSON（结构见 `references/orchestration.md` §2）
- 一级节点=分组卡片（抽象领域块），二级=具体知识点
- 数量按档位：Lite 6-8 主题/3-4 子节点/24-32 总节点；Medium 8-11/4-6/36-50；Zen 10-14/5-8/55-75
- 覆盖度自检三问（入门/进阶/实战/风险/行业生态 五面）
- 参考用户背景调整偏重（新手多基础概念，专家直接上机制）
- relevance_score 钳制 1-3（relevance=True 默认 3，否则 2）

## 消息组装规则（编排核心）

```
messages = [固定输出规则] + [固定 task/instructions/json_schema] + [本轮 volatile 数据]
```

- 固定部分：输出规则 + 任务指令 + JSON schema（每轮不变，缓存友好）
- volatile：每轮变化的输入（当前节点、已有 children 标题、用户问题、背景）

## 搜索约束（防幻觉 + 省 token）

- 搜索走 **Exa**（mcporter，`exa.web_search_exa`），可加 `site:` 白名单
- 每个节点检索上限 **3-5 条**，结果缓存（同主题不重复搜）
- Prompt 硬规则：「所有论断必须来自搜索结果，否则标注『推断』」

## 双写对接（产出落点）

1. **wiki**：主题 → `~/wiki/entities/<slug>.md`（frontmatter + wikilinks）；每节点一个概念页或合并为长文
2. **曼陀罗**：高亮卡片 → MCP `add_inbox_item`（type=wiki，title=节点名，summary=要点）

## 交付物结构

```
knowledge-decomposer/
├── SKILL.md
├── references/
│   ├── orchestration.md     # TJ 编排情报（TRAE 实现底层代码的依据）
│   ├── search.md            # 搜索约束设计
│   └── prompts/             # 12 个原始 prompt（已提取，勿改）
│       ├── initial_map_default.md
│       ├── subdivide_default.md
│       ├── first_principles_default.md
│       ├── multi_angle_subdivide_default.md
│       ├── peek_default.md
│       ├── explain_default.md
│       ├── expand_children_default.md
│       ├── preview_topics_default.md
│       ├── subdivision_options_default.md
│       ├── deep_reanswer_default.md
│       ├── background_quiz_default.md
│       └── background_followup_default.md
└── scripts/                 # TRAE 实现（decompose.py 编排）
```

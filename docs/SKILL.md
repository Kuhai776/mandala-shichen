# 曼陀罗时辰 × Hermes 联动技能

> 本文件是 Hermes 智能体的技能说明，主源在仓库 `docs/SKILL.md`，Hermes 侧同步至 `~/.hermes/skills/mandala/SKILL.md`。
> 更新规则：仓库优先，Hermes 侧按需 `git pull` 同步。

## 一、时间模型

每日划分为 **9 时辰 × 9 格**，每格 ≈ 13 分 20 秒：

| 时辰 | 时段 | 能量 | 适合 |
|---|---|---|---|
| 1 | 05:00-07:00 | 启动 | 晨间启动、深度工作 |
| 2 | 07:00-09:00 | 上升 | 核心任务 |
| 3 | 09:00-11:00 | 巅峰 | 难度最高任务 |
| 4 | 11:00-13:00 | 高位 | 协作、会议 |
| 5 | 13:00-15:00 | 回升 | 执行类任务 |
| 6 | 15:00-17:00 | 稳定 | 收尾、整理 |
| 7 | 17:00-19:00 | 下降 | 运动、学习 |
| 8 | 19:00-21:00 | 二次峰 | 复习、创作 |
| 9 | 21:00-23:00 | 舒缓 | 复盘、放松 |

**三才翻页**：天·计划（要做）/ 地·记录（实际做了）/ 人·复盘（总结剖析）。

## 二、数据模型（localStorage 镜像）

```
data.json = {
  "tasks":   { "2026-08-08": { "1": ["写报告","健身"], "3": ["读30分钟书"], ... } },
  "done":    { "2026-08-08": { "1": [{"task":"写报告","done":true,"at":"..."}] } },
  "checklists": { ... },
  "repeats":  { ... },
  "records":  { ... },
  "reviews":  { ... },
  "longTasks": [
    {
      "id": "lt-xxx", "title": "学完嵌入式系统",
      "start": "2026-08-08", "deadline": "2026-09-30",
      "repeat": "weekly",  // none|daily|weekly|monthly
      "progress": 0,       // 0-100
      "note": "...",
      "eval": {            // 知识评估 7 维度，子项 1-5 分
        "Cl": {"def": 3, "boundary": 0, "repr": 0},
        "Cp": {"struct": 0, "step": 0},
        "B":  {"applicable": 0, "fail": 0, "limit": 0},
        "L":  {"updown": 0, "iso": 0, "cross": 0},
        "Ev": {"trace": 0, "iter": 0},
        "P":  {"chunk": 0, "flow": 0},
        "Rh": {"cycle": 0, "freq": 0, "predict": 0, "duration": 0, "timing": 0}
      }
    }
  ],
  "inbox": [ {"id":"in-xxx","text":"...","created":"..."} ]
}
```

数据键：`mandala-tasks-v2` / `mandala-done-v2` / `mandala-longtasks-v1` / `mandala-inbox-v1`。

## 三、知识评估 7 维度

| 编号 | 维度 | 子维度（sub_key） | 核心追问 |
|---|---|---|---|
| Cl | 清晰度 | def / boundary / repr | 能用一句话说清？能区分相似知识？能用图形比喻表达？ |
| Cp | 完整性 | struct / step | 子知识齐全？操作链每步能闭卷写出？ |
| B | 边界感 | applicable / fail / limit | 适用条件？失效条件？极限参数还成立？ |
| L | 关联度 | updown / iso / cross | 上下游？同构骨架？跨域迁移？ |
| Ev | 进化感 | trace / iter | 版本追溯？迭代方向？ |
| P | 精炼度 | chunk / flow | 口诀压缩度？自动执行还是刻意回忆？ |
| Rh | 节奏感 | cycle / freq / predict / duration / timing | 检索周期？频率？卡点预测？时长？时机？ |

## 四、联动架构（4 层）

| 层 | 方向 | 实现 | 负责方 |
|---|---|---|---|
| L1 神经层 | 曼陀罗→Hermes | PWA apiUrl 填 `:8002/v1/chat/completions`（零代码，已预置 Hermes 平台选项） | 用户配置 |
| L2 数据层 | 双向 | 前端防抖推送 `POST /api/sync` + 启动拉取 `GET /api/sync`；后端 serve.py 提供 `/api/sync`（merge 写入） | 前端=TRAE / 后端=Hermes |
| L3 能力层 | Hermes→曼陀罗 | `mcp/mandala-mcp.py` stdio MCP，7 工具 + fcntl 锁 + 原子写 | TRAE 写 / Hermes 接入 |
| L4 自动层 | Hermes 主动 | cron：晨间简报（get_today_plan→微信）、晚间复盘（get_tasks→生成→update_schedule）、周度 7 维度检查 | Hermes |

## 五、MCP 工具清单

| 工具 | 用途 | 关键参数 |
|---|---|---|
| `get_tasks` | 获取某日任务 | date(可选) |
| `add_task` | 添加任务到格子 | text(必填), period(1-9), slot, date |
| `complete_task` | 标记完成 | index, period, date |
| `get_long_tasks` | 获取长期任务+评估 | — |
| `score_eval` | 7 维度打分 | id, dim_code, sub_key, score(1-5) |
| `get_today_plan` | 今日计划概览（简报用） | — |
| `update_schedule` | 批量更新某日计划（复盘写回） | tasks, date |
| `add_hermes_note` | Hermes 写入总结/规划/洞察文本，同步显示到曼陀罗对话区 | text, type(summary/plan/insight), date |
| `add_inbox_item` | Hermes 写入卡片型收集箱项（wiki/文章总结/待读），0 token 渲染卡片 | title, type(reading/wiki/summary), summary, link, source |

## 六、Hermes 接入步骤

```bash
# 1. 拉取仓库
git clone https://github.com/Kuhai776/mandala-shichen.git
# 2. 注册 MCP（stdio，同机信任无需 OAuth）
hermes mcp add mandala --stdio -- python3 mandala-shichen/mcp/mandala-mcp.py --data ~/.mandala/data.json
# 3. 同步技能
mkdir -p ~/.hermes/skills/mandala
cp mandala-shichen/docs/SKILL.md ~/.hermes/skills/mandala/SKILL.md
# 4. 配置 L1（用户在 PWA 设置里选「Hermes 智能体」预置项，或填 :8002/v1/chat/completions）
```

## 七、增效降本原则

- cron 晨报用 **0 token 脚本**（直接调 MCP，不经过 LLM）
- 晚间复盘用**低档模型**（如 gpt-4o-mini / qwen2.5:7b）
- 同步防抖 3 秒，避免高频写
- MCP 读多写少，锁仅写时持有
- 不为联动添加无关多余功能

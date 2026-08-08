# 曼陀罗时辰 × Hermes 联动技能

> 本文件是 Hermes 智能体的技能说明，主源在仓库 `docs/SKILL.md`，Hermes 侧同步至 `~/.hermes/skills/mandala/SKILL.md`。
> 更新规则：仓库优先，Hermes 侧按需 `git pull` 同步。

## 一、时间模型

每日划分为 **9 时辰 × 9 格**，每格 ≈ 13 分 20 秒。时辰用传统地支表示，与 Hermes 台词统一：

| 时辰 | 地支 | 时段 | 能量 | 适合 |
|---|---|---|---|---|
| 1 | 卯时 | 05:00-07:00 | 启动 | 晨间启动、深度工作 |
| 2 | 辰时 | 07:00-09:00 | 上升 | 核心任务 |
| 3 | 巳时 | 09:00-11:00 | 巅峰 | 难度最高任务 |
| 4 | 午时 | 11:00-13:00 | 高位 | 协作、会议 |
| 5 | 未时 | 13:00-15:00 | 回升 | 执行类任务 |
| 6 | 申时 | 15:00-17:00 | 稳定 | 收尾、整理 |
| 7 | 酉时 | 17:00-19:00 | 下降 | 运动、学习 |
| 8 | 戌时 | 19:00-21:00 | 二次峰 | 复习、创作 |
| 9 | 亥时 | 21:00-23:00 | 舒缓 | 复盘、放松 |

界面显示：标题 + 时辰切换条 + 九宫格中心水印均显示地支（如"巳时"）。
MCP `get_today_plan` 返回 `current_name`（如"巳时"）+ 各时辰 `name`，Hermes 台词直接用。

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

扩展字段（PWA ↔ Hermes 同步新增）：
```
"actions": [    // Hermes trigger_action 写入的 PWA 动作队列，PWA pullSync 时消费
  {"id":"ac-xxx","type":"switch_realm|toast|pulse","payload":{"realm":"record"},
   "message":"提示文字","created_at":"...","consumed":false}
],
"hermesNotes": [  // Hermes add_hermes_note 写入的总结/规划/洞察，PWA 对话区顶部渲染
  {"id":"hn-xxx","type":"summary|plan|insight","text":"...","date":"...","at":"..."}
]
```

数据键：`mandala-tasks-v2` / `mandala-done-v2` / `mandala-longtasks-v1` / `mandala-inbox-v1` / `mandala-actions-v1` / `mandala-hermes-notes-v1`。

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
| `get_current_context` | 当前时辰上下文：上一时辰汇总(含未完成)+本时辰任务+下一时辰预告，时辰切换对话用 | date(可选) |
| `trigger_action` | Hermes 触发 PWA 动作：switch_realm(跳转计划/记录/复盘页) / toast(弹提示) / pulse(时辰闪烁)。PWA 下次 pullSync 时消费执行 | type(必填), payload{realm}, message |
| `update_schedule` | 批量更新某日计划（复盘写回） | tasks, date |
| `add_hermes_note` | Hermes 写入总结/规划/洞察文本，同步显示到曼陀罗对话区 | text, type(summary/plan/insight), date |
| `add_inbox_item` | Hermes 写入卡片型收集箱项（wiki/文章总结/待读），0 token 渲染卡片 | title, type(reading/wiki/summary), summary, link, source |

### 5.1 关键工具返回结构

**`get_current_context`**（时辰切换对话用，一次拿到上下文）：
```json
{
  "date": "2026-08-08",
  "current_period": 3, "current_name": "巳时", "current_range": "9-11",
  "prev": {                    // 上一时辰汇总（cur=1 时为 null）
    "period": 2, "name": "辰时", "range": "7-9",
    "planned_count": 2, "done_count": 1, "undone_count": 1,
    "undone": ["回邮件"], "tasks": ["晨会","回邮件"]
  },
  "current": { ... },          // 本时辰任务，结构同 prev
  "next": { ... }              // 下一时辰预告（cur=9 时为 null）
}
```
对话范式：Hermes 读 `prev.undone` 说"刚才辰时漏了回邮件"，读 `current.tasks` 说"接下来巳时做写方案"，读 `next.tasks` 预告。

**`trigger_action`**（Hermes → PWA 单向触发，异步消费）：
```json
// 调用
{"type":"switch_realm","payload":{"realm":"record"},"message":"巳时已到，去记录页"}
// 返回
{"ok":true,"action":{"id":"ac-xxx","consumed":false},"pending_count":1}
```
消费机制：PWA 每 30 秒 `pullSync` 拉取 data.json，`consumeActions` 执行未消费的 action 后标记 `consumed:true`，`pushSync` 回写。Hermes 可读 `pending_count` 判断是否已被消费。注意：动作非实时，最长 30 秒延迟。

**`trigger_action` 三种类型**：
- `switch_realm` — PWA 切到计划/记录/复盘页，`payload.realm` 必填 `plan|record|review`
- `toast` — PWA 弹文字提示，`message` 显示给用户
- `pulse` — PWA 时辰切换标签 + 九宫格边框闪烁（金橙色脉冲 3 次），`message` 同时弹提示

## 六、Hermes 接入步骤

### 6.1 合并启动（MCP + HTTP 同步服务器）

PWA（浏览器 HTTP）和 Hermes（MCP stdio）通过同一个 `data.json` 同步。用 `start.sh` 合并启动：

```bash
# 1. 拉取仓库
git clone https://github.com/Kuhai776/mandala-shichen.git
cd mandala-shichen

# 2. 合并启动 MCP(stdio) + HTTP 同步服务器（共享 ~/.mandala/data.json）
#    Hermes 连 MCP，PWA 连 HTTP 服务器，两者数据互通
./start.sh --data ~/.mandala/data.json --port 8001 --host 0.0.0.0
#    或用环境变量：DATA=~/.mandala/data.json PORT=8001 ./start.sh

# 3. 注册 MCP（stdio，指向同一个 data.json）
hermes mcp add mandala --stdio -- ./start.sh --data ~/.mandala/data.json

# 4. 同步技能
mkdir -p ~/.hermes/skills/mandala
cp docs/SKILL.md ~/.hermes/skills/mandala/SKILL.md

# 5. 配置 L1（用户在 PWA 设置里选「Hermes 智能体」预置项，或填 :8002/v1/chat/completions）
```

### 6.2 PWA 配置同步地址

在 PWA 设置里填 `syncUrl`，勾选「自动同步」：
- 本机：`http://localhost:8001/api/sync`
- 公网：`https://你的域名/api/sync`（必须 HTTPS，否则 PWA 在 https 页面 fetch http 会被混合内容拦截）

### 6.3 公网部署（HTTPS 反代）

`sync_server.py` 监听 HTTP，公网需 HTTPS（PWA 在 https 页面 fetch http 会被混合内容拦截）。三种方案任选：

**方案 A：Cloudflare Tunnel（推荐，免端口转发/免证书）**
```bash
# 1. 装 cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# 2. 登录（浏览器授权）
cloudflared tunnel login

# 3. 创建隧道
cloudflared tunnel create mandala

# 4. 配置 ~/.cloudflared/config.yml
cat > ~/.cloudflared/config.yml <<'EOF'
tunnel: mandala
credentials-file: /root/.cloudflared/<隧道ID>.json
ingress:
  - hostname: mandala.你的域名.com
    service: http://127.0.0.1:8001
  - service: http_status:404
EOF

# 5. DNS 自动绑定 + 启动
cloudflared tunnel route dns mandala mandala.你的域名.com
cloudflared tunnel run mandala
# 现在 https://mandala.你的域名.com/api/sync 可用，自动 HTTPS
```
优点：不用开 VPS 端口、不用管证书续期、Cloudflare 边缘加速。

**方案 B：nginx**（已有 nginx 环境）
```nginx
server {
    listen 443 ssl http2;
    server_name mandala.example.com;
    ssl_certificate     /path/cert.pem;
    ssl_certificate_key /path/key.pem;

    location /api/sync {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**caddy 示例（自动 HTTPS）：**
```
mandala.example.com {
    reverse_proxy 127.0.0.1:8001
}
```

### 6.4 数据流

```
PWA (浏览器)
  ↕ HTTPS fetch(syncUrl)        ← PWA 每 30 秒 pullSync 拉取 + pushSync 上传
sync_server.py (HTTP /api/sync)
  ↕ 文件读写（fcntl 锁 + 原子写）
~/.mandala/data.json
  ↕ stdio
Hermes ↔ mandala-mcp.py
```

合并策略（PWA 上传时服务器端自动执行，避免 Hermes 写的数据丢失）：
- `actions`/`inbox`/`hermesNotes`/`longTasks` → 按 id 合并去重（`actions` 的 `consumed` 取 OR）
- `tasks`/`done` → 按日期合并（PWA 覆盖同名日期，保留 Hermes 独写的日期）
- `records`/`reviews`/`checklists`/`repeats` → PWA 覆盖（Hermes 不直接写这些）

## 七、增效降本原则

- cron 晨报用 **0 token 脚本**（直接调 MCP，不经过 LLM）
- 晚间复盘用**低档模型**（如 gpt-4o-mini / qwen2.5:7b）
- 同步防抖 3 秒，避免高频写
- MCP 读多写少，锁仅写时持有
- 不为联动添加无关多余功能

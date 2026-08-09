/* ============================================================
 * 曼陀罗时辰 · AI 日程规划
 * 时间模型：每天 5:00 开始，9 时辰 × 2 小时 = 18 小时（至 23:00）
 * 每时辰 = 一个曼陀罗九宫格（3×3=9 格），每格 ≈ 13 分 20 秒
 * 数据结构（v2）：按日期存储，每格支持多任务
 *   tasks = { "2026-07-28": { "0-0": ["任务1","任务2"] } }
 *   done  = { "2026-07-28": { "0-0": true } }
 * ============================================================ */

// ---------- 启动期 SW 强制清理（解决覆盖安装后仍加载旧资源的问题）----------
// 必须在任何业务逻辑前执行，确保拿到最新代码
(async () => {
  try {
    if ("serviceWorker" in navigator) {
      // 1. 注销所有已注册的 Service Worker
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      // 2. 清空所有 CacheStorage（含 mandala-v21/v22/v23 旧缓存）
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      // 3. 重新注册最新 SW（sw.js 已是 v23）
      await navigator.serviceWorker.register("./sw.js?v=20260809h", { scope: "./" });
      console.log("[SW] 已清理旧缓存并重新注册");
    }
  } catch (e) {
    console.warn("[SW] 清理失败（不影响功能）:", e);
  }
})();

(function () {
  "use strict";

  // ---------- 常量 ----------
  const START_HOUR = 5;
  const PERIOD_HOURS = 2;
  const PERIOD_COUNT = 9;
  const CELLS_PER_PERIOD = 9;
  const SECONDS_PER_PERIOD = PERIOD_HOURS * 3600;
  const SECONDS_PER_CELL = SECONDS_PER_PERIOD / CELLS_PER_PERIOD;
  const START_SECONDS = START_HOUR * 3600;
  // 时辰地支映射（9 时辰对应 卯→亥），Hermes 台词与界面统一用此
  const PERIOD_NAMES = ["卯时", "辰时", "巳时", "午时", "未时", "申时", "酉时", "戌时", "亥时"];
  const PERIOD_GLYPHS = ["卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

  const STORAGE_KEY = "mandala-tasks-v2";

  // ---------- Capacitor 原生能力（APK 环境）----------
  // 浏览器环境：navigator.vibrate / 无状态栏控制；APK 环境：@capacitor/haptics + status-bar
  const IS_NATIVE = typeof window !== "undefined" && !!window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  const NativeHaptics = IS_NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics ? window.Capacitor.Plugins.Haptics : null;
  const NativeStatusBar = IS_NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar ? window.Capacitor.Plugins.StatusBar : null;

  // 统一震动接口：APK 用原生 Haptics，浏览器用 navigator.vibrate
  function haptic(pattern) {
    try {
      if (NativeHaptics) {
        // Capacitor Haptics：vibrate 接受 duration(ms)
        const duration = typeof pattern === "number" ? pattern : 30;
        NativeHaptics.vibrate({ duration });
      } else if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch (e) { /* 静默 */ }
  }

  // APK 启动时设置沉浸式状态栏（与主题色融合）
  async function setupImmersiveMode() {
    if (!NativeStatusBar) return;
    try {
      await NativeStatusBar.setStyle({ style: "DARK" });
      await NativeStatusBar.setBackgroundColor({ color: "#1a1a2e" });
    } catch (e) { /* 静默 */ }
  }

  // ---------- 应用版本号 ----------
  // 每次功能更迭时升级此版本号，同步更新 CHANGELOG 内容
  const APP_VERSION = "2.3.0";
  const APP_VERSION_DATE = "2026-08-08";
  const APP_CHANGELOG = [
    { v: "2.3.0", date: "2026-08-08", items: [
      "新增：长期任务时间地图（顶部甘特条）—— 跨日/周/月事项一眼可见",
      "新增：长期任务设定（收集箱 + AI 对话）—— 支持开始/截止日期、重复周期",
      "新增：知识评估 7 维度面板（清晰度Cl/完整性Cp/边界感B/关联度L/进化感Ev/精炼度P/节奏感Rh）",
      "新增：7 维度作为必需要素融入 AI 对话全环节（拆解/确认/复盘自动套用核心追问）",
      "新增：AI 对话工具栏「🧠 7维度」快捷参考卡，一键查看标准·编号·子维度·核心追问",
      "新增：事项重复与截止时间绑定（每日/每周/每月）",
      "优化：AI 对话环节进度条更清晰（图标+说明+分支高亮）",
    ]},
    { v: "2.2.0", date: "2026-08-02", items: [
      "新增：待办收集箱（Inbox）—— 想到什么先记下，支持分类标签 + 日期显示",
      "新增：复盘页时辰总汇总（总任务/已完成/未完成/完成率）",
      "新增：复盘页过去时辰快览导航，点击跳转到对应时辰记录页",
      "新增：任务条状 UI + 单条复选框打钩 + 删除线",
      "新增：未完成任务自动继承到下一格子",
      "新增：单条任务拖拽到指定格子",
      "修复：三才切换彻底移除 blur 滤镜，格子不再模糊",
      "优化：三才切换动画简化为纯 opacity 过渡",
    ]},
    { v: "2.1.0", date: "2026-08-02", items: [
      "优化：三才切换动画改为 opacity+transform 过渡，彻底避免闪现",
      "优化：搜索定位增强——点击结果后高亮闪烁目标格子 + 自动滚动到可视区域",
      "新增：首次使用引导流程（三步上手 + 快捷键提示）",
      "优化：统计图表 hover 交互增强（圆点放大 + 阴影 + 亮度变化）",
      "新增：年度热力图点击可跳转到对应日期搜索",
      "优化：底部安全区适配（batch-toolbar + pomodoro-bar 增加 safe-bottom）",
      "优化：极小屏适配（realm-container 高度自适应）",
    ]},
    { v: "2.0.0", date: "2026-08-02", items: [
      "新增：天·计划环节 4 个专业技能（晨间启动/日程编排/目标拆解/优先级矩阵）",
      "新增：地·记录环节 3 个专业技能（时间审计/专注度评估/中断管理）",
      "新增：人·复盘环节 3 个专业技能（GRAI复盘/效率洞察/改进闭环）",
      "新增：跨环节综合 4 个专业技能（能量节律/习惯系统/周度战略/状态管理）",
      "新增：全量 PROMPT_TEMPLATES 模板覆盖 16 个技能",
      "新增：5 个状态机环节推荐技能更新（idle/gathering/confirming/breakdown/done）",
    ]},
    { v: "1.9.3", date: "2026-07-29", items: [
      "新增：AI 发送按钮 loading 旋转动画 + 出射脉冲扩散",
      "新增：用户消息发送轨迹动画（从右下方滑入）、Bot 消息左侧滑入",
      "新增：记录「同步计划」改为带预览的确认弹窗（列出待同步格子+跳过统计）",
      "新增：全局快捷键 P/L/R 切换三才（Plan计划/记录/Review复盘）",
      "新增：Tab / Shift+Tab 正向/反向循环切换三才",
    ]},
    { v: "1.9.2", date: "2026-07-29", items: [
      "新增：AI 对话完成后自动追加「去记录」「去复盘」快捷按钮",
      "新增：记录编辑弹层「AI 追问」按钮（基于该格计划+记录自动生成上下文）",
      "新增：AI 复盘「明日建议安排」区块（含未完成项+高效时段+一键应用/复制）",
      "新增：复盘页时辰执行热力图（9 时辰记录数可视化，热点脉冲动画）",
      "新增：AI 对话快捷指令「复盘/回顾/总结」「去记录/去计划」自动切换三才",
      "新增：AI 对话快捷按钮「去记录/去复盘」（三才配色）",
      "新增：AI 对话输入框 placeholder 根据 realm 动态切换提示",
      "新增：三才切换时环节进度条颜色同步联动（紫/红/蓝）",
      "优化：复盘「应用到明日计划」自动匹配时辰格子或下一空格",
    ]},
    { v: "1.9.1", date: "2026-07-29", items: [
      "调整：三才配色改为 天=紫 / 地=红 / 人=蓝",
      "新增：记录页工具栏（同步计划/清本时辰/清全日/去复盘）",
      "新增：记录页本时辰统计行（已记录 X/9 格）",
      "新增：记录页计划任务预览（紫条小字提示）",
      "新增：计划页底部「去记录/去复盘」快捷跳转按钮",
      "新增：复盘页「导出 Markdown」按钮（含统计/计划/记录/AI复盘/反思）",
      "新增：复盘统计卡片增加「完成率」与「总花费时间」",
      "优化：AI 复盘按钮根据是否配置 API 动态显示文字",
      "优化：时间字符串解析（支持「1小时30分」「1.5h」「45min」等多种格式）",
      "优化：导出/导入 JSON 包含记录与复盘数据",
      "优化：清空当日/全部数据同步清除记录与复盘",
    ]},
    { v: "1.9.0", date: "2026-07-29", items: [
      "新增：天地人三才翻页系统（天=计划 / 地=记录 / 人=复盘）",
      "新增：3D 翻页动效 + 三色主题 + 滑动指示器",
      "新增：记录页（实际花费时间 + 实际做的事 + 备注），支持计划对照徽章",
      "新增：复盘页（统计卡片 + AI 智能总结 + 洞察 + 建议 + 亮点 + 个人反思）",
      "新增：本地兜底复盘生成（无 API Key 也能用）",
      "新增：天地人切换支持点击/上下滑/键盘 1/2/3 三种方式",
    ]},
    { v: "1.8.1", date: "2026-07-29", items: [
      "修复：点击「发送」按钮无法发送（事件误把 MouseEvent 当成 isRegenerate=true，导致 effectiveText 取空值被提前 return；Enter 提交不受影响）",
    ]},
    { v: "1.8.0", date: "2026-07-29", items: [
      "新增：AI 接口平台预设卡片（18 个主流平台一键切换）",
      "新增：免费搜索源（Wikipedia / DuckDuckGo，无需 API Key）",
      "新增：联网搜索默认开启",
      "新增：设置自动保存（无需点保存按钮）",
      "新增：版本号显示与更新日志",
      "修复：AI 对话发送失败（showToast / INPUT_HISTORY_KEY 未定义）",
      "优化：资源加版本号破浏览器缓存",
    ]},
    { v: "1.7.0", date: "2026-07-28", items: [
      "新增：环节进度指示器（状态机可视化）",
      "新增：拆解环节 6 步子步骤进度条",
      "新增：平台预设选择器样式",
      "优化：模型备选 chips 切换",
    ]},
    { v: "1.6.0", date: "2026-07-27", items: [
      "新增：专注计时器（番茄钟）",
      "新增：重复任务/周期任务",
      "新增：数据云同步（URL 编码）",
      "新增：自定义强调色与声音反馈",
    ]},
    { v: "1.5.0", date: "2026-07-26", items: [
      "新增：项目递归拆解状态机",
      "新增：方案草稿暂存",
      "新增：对话模板复用",
      "新增：提前提醒与子任务清单",
    ]},
  ];
  const DONE_KEY = "mandala-done-v2";
  const OLD_TASKS_KEY = "mandala-tasks-v1";
  const OLD_DONE_KEY = "mandala-done-v1";
  const SETTINGS_KEY = "mandala-settings-v1";
  const CHAT_KEY = "mandala-chat-v1";
  const THEME_KEY = "mandala-theme-v1";
  const NOTIFY_KEY = "mandala-notify-v1";
  const DRAFT_PLAN_KEY = "mandala-draft-plan-v1";
  const CONV_TPL_KEY = "mandala-conv-templates-v1";
  const CHECKLIST_KEY = "mandala-checklists-v1";
  const ACCENT_KEY = "mandala-accent-v1";
  const REPEAT_KEY = "mandala-repeats-v1";
  const INPUT_HISTORY_KEY = "mandala-input-history-v1";
  // 天地人三才：记录页数据 & 复盘页数据
  const RECORD_KEY = "mandala-records-v1";
  const REVIEW_KEY = "mandala-reviews-v1";
  // 长期任务（时间地图）数据
  const LONGTASK_KEY = "mandala-longtasks-v1";
  // Hermes 同步的总结/规划/洞察（L3 add_hermes_note 写入）
  const HERMES_NOTES_KEY = "mandala-hermes-notes-v1";
  // Hermes 触发的 PWA 动作队列（L3 trigger_action 写入，pullSync 拉取后消费）
  const ACTIONS_KEY = "mandala-actions-v1";
  // 任务孵化历史（完成率闭环用）
  const HATCH_HISTORY_KEY = "mandala-hatch-history-v1";

  // ---------- 知识评估 7 维度 ----------
  // 标准 编号前缀 - 子维度 - 核心追问
  const KNOWLEDGE_DIMENSIONS = [
    { code: "Cl", name: "清晰度", color: "#7c5cff",
      subs: [
        { key: "def", name: "定义清晰度", q: "能用一句话说清这个知识是什么吗？" },
        { key: "boundary", name: "边界清晰度", q: "能说清它和相似知识的区别吗？" },
        { key: "repr", name: "表征清晰度", q: "能用图形、比喻、口诀等多种方式表达它吗？" },
      ]},
    { code: "Cp", name: "完整性", color: "#4ade80",
      subs: [
        { key: "structure", name: "结构完整度", q: "有没有遗漏的子知识？根干枝叶齐全吗？" },
        { key: "steps", name: "步骤完整度", q: "操作链的每一步都能闭卷写出来吗？" },
      ]},
    { code: "B", name: "边界感", color: "#fbbf24",
      subs: [
        { key: "condition", name: "适用条件", q: "在什么条件下能用？" },
        { key: "fail", name: "失效条件", q: "在什么条件下会出错？" },
        { key: "limit", name: "极限测试", q: "推到极端参数还成立吗？" },
      ]},
    { code: "L", name: "关联度", color: "#60a5fa",
      subs: [
        { key: "upstream", name: "上下游关联", q: "它的前置知识和后续应用是什么？" },
        { key: "isomorphic", name: "同构关联", q: "和哪个知识共享相同的底层骨架？" },
        { key: "crossdomain", name: "跨域关联", q: "能迁移到其他领域或生活中吗？" },
      ]},
    { code: "Ev", name: "进化感", color: "#f87171",
      subs: [
        { key: "version", name: "版本追溯", q: "和过去比，理解变深了吗？" },
        { key: "iteration", name: "迭代方向", q: "下一步该修正、升级还是淘汰？" },
      ]},
    { code: "P", name: "精炼度", color: "#34d399",
      subs: [
        { key: "chunk", name: "组块紧凑度", q: "能压缩成多短的口诀？" },
        { key: "fluency", name: "执行流畅度", q: "能自动执行还是需要刻意回忆？" },
      ]},
    { code: "Rh", name: "节奏感", color: "#a78bfa",
      subs: [
        { key: "cycle", name: "周期", q: "固定多久检索一次？" },
        { key: "freq", name: "频率", q: "练习频率够高吗？" },
        { key: "predict", name: "预测", q: "能预判自己会在哪卡住吗？" },
        { key: "duration", name: "时长", q: "每次训练的时长合理吗？" },
        { key: "timing", name: "时机", q: "在什么状态下训练效果最好？" },
      ]},
  ];

  // 生成本维度空评估对象 { def:0, boundary:0, ... }
  function emptyEval() {
    const o = {};
    KNOWLEDGE_DIMENSIONS.forEach((d) => d.subs.forEach((s) => { o[s.key] = 0; }));
    return o;
  }

  // 计算某维度平均分（0-5）
  function dimScore(evalObj, dim) {
    const vals = dim.subs.map((s) => evalObj[s.key] || 0);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  // 长期任务重复周期选项
  const REPEAT_OPTIONS = [
    { value: "none", label: "不重复" },
    { value: "daily", label: "每日" },
    { value: "weekly", label: "每周" },
    { value: "monthly", label: "每月" },
  ];

  // 长期任务配色（循环）
  const LONGTASK_COLORS = ["#7c5cff", "#f87171", "#60a5fa", "#4ade80", "#fbbf24", "#fb923c", "#34d399", "#a78bfa"];

  // ---------- 预设技能 ----------
  // 技能体系按「天·计划 / 地·记录 / 人·复盘 / 跨环节综合」四大维度组织
  // 每个技能包含：方法论框架 + 曼陀罗时辰映射规则 + 具体执行指令
  const PRESET_SKILLS = [
    // ========== 天 · 计划环节技能 ==========
    { id: "gtd", name: "GTD", group: "plan", desc: "收集→处理→组织→回顾→执行，把任务拆成可执行的下一步行动",
      prompt: "采用 GTD 方法论：把用户任务拆解为明确的「下一步行动」，区分项目/任务/日历项，确保每格任务是单一可执行动作。" },
    { id: "eisenhower", name: "艾森豪威尔", group: "plan", desc: "按重要/紧急四象限分配，重要任务放高能时段",
      prompt: "使用艾森豪威尔矩阵：判断每个任务的重要/紧急程度。重要不紧急的任务优先安排在上午高能时段；紧急不重要任务集中批量处理；不重要不紧急任务可放晚上或省略。" },
    { id: "pomodoro", name: "番茄工作法", group: "plan", desc: "25分钟专注+5分钟休息，2格≈1个番茄钟",
      prompt: "采用番茄工作法：每 25 分钟专注 + 5 分钟休息为一个番茄钟。2 格（约26分钟）≈1个番茄钟。深度任务连续安排多个番茄钟，每 4 个番茄钟后安排较长休息。" },
    { id: "energy", name: "能量管理", group: "plan", desc: "按生理节律分配：晨间高能做深度，午后低能做杂事",
      prompt: "按能量管理法：早晨（5-9点）和上午（9-11点）安排深度工作/学习；午饭后（13-15点）安排轻量沟通/邮件；下午（15-17点）安排创意/讨论；晚上安排放松/复盘。" },
    { id: "timeblock", name: "时间块法", group: "plan", desc: "同类任务集中到同一时段，减少上下文切换",
      prompt: "采用时间块法：把同类任务集中安排在连续时段，减少上下文切换。例如所有会议放同一时辰，所有写作任务连续安排。" },
    { id: "deepwork", name: "深度工作", group: "plan", desc: "保留 2-4 小时无干扰深度时段",
      prompt: "保留深度工作时段：每天安排至少 1-2 个连续时辰（2-4小时）的深度工作，不被会议/沟通打断，处理最重要的任务。" },

    // --- 天·计划：精细化专业技能 ---
    { id: "morning_boot", name: "晨间启动", group: "plan", desc: "仪式化晨间规划，结合生物钟预测当日能量曲线，生成分层启动方案",
      prompt: "【晨间启动规划法】\n你是晨间仪式设计专家。按以下框架规划：\n\n1. 能量预测：根据用户睡眠时长（询问）、昨日强度、季节光线，预测今日能量曲线（高/中/低三档映射到 9 时辰）\n2. 晨间仪式（第1时辰 5:00-7:00）：安排 3 格启动序列——\n   - 格0-1：唤醒过渡（拉伸/冥想/喝水，轻量活动）\n   - 格2-3：意图设定（写今日 3 个 MIT 最重要任务 + 一句正能量宣言）\n   - 格4-5：信息摄取（阅读 13 分钟 / 听播客 / 查看日程）\n   - 格6-8：第一个深度任务（趁皮质醇高峰，做最难的事）\n3. 能量映射规则：\n   - 高能时段（第1-3辰）：深度创作/学习/决策\n   - 中能时段（第4-6辰）：协作/会议/沟通\n   - 低能时段（第7-9辰）：整理/复盘/轻量阅读\n4. 缓冲设计：每时辰最后 1-2 格留空作为弹性缓冲，吸收超时\n5. 输出要求：每个任务标注预估能量消耗（高/中/低），确保高能任务不超过总高能时段的 70%" },

    { id: "schedule_orchestration", name: "日程编排", group: "plan", desc: "基于任务依赖关系、认知负荷、缓冲区的多约束日程编排算法",
      prompt: "【多约束日程编排法】\n你是日程编排算法专家。按以下约束体系编排任务到曼陀罗格子：\n\n1. 依赖约束：识别任务间的依赖链（A 必须在 B 之前完成），按拓扑排序排列\n2. 认知负荷约束：\n   - 高负荷任务（写作/编程/数学）不连续超过 4 格（约 53 分钟），之后必须插入低负荷任务\n   - 同类型高负荷任务不背靠背安排，中间插入切换过渡（1 格轻量活动）\n3. 缓冲区设计：\n   - 每时辰预留最后 1 格作为「弹性缓冲」（处理超时/意外）\n   - 高密度日程（6 格以上有任务）在中间时辰强制插入 2 格休息\n4. 上下文切换最小化：\n   - 同项目/同工具的任务集中到同一时辰\n   - 不同上下文的切换至少间隔 1 格过渡\n5. 截止时间倒推：有 deadline 的任务从截止时间倒推，预留 20% 安全裕度\n6. 输出格式：每个任务标注 [负荷:高/中/低] [依赖:无/前置任务名] [缓冲:是/否]" },

    { id: "goal_decomposition", name: "目标拆解", group: "plan", desc: "OKR 驱动的目标拆解：从季度目标到可执行的 13 分钟动作单元",
      prompt: "【OKR 驱动目标拆解法】\n你是目标管理专家。按以下层级拆解用户目标：\n\n1. 目标层（Objective）：确认用户的周期目标（如「本周掌握 React Hooks」），1 句话定性描述\n2. 关键结果层（Key Results）：拆出 2-4 个可量化的关键结果（如「独立完成 3 个 Hooks 组件」「通过单元测试」），每个 KR 标注完成标准\n3. 里程碑层：每个 KR 拆为 2-3 个里程碑节点，标注预计完成日期\n4. 行动层（今日可执行）：\n   - 每个里程碑拆为可在 1-4 格内完成的行动单元\n   - 每个行动单元以动词开头，明确输入→处理→输出\n   - 标注预估格数和所属 KR\n5. 依赖排序：\n   - 基础概念类行动排在前面\n   - 实践类行动紧跟理论\n   - 综合应用排在最后\n6. 验证点：每个里程碑设置一个「检验动作」（如「不看教程手写一遍」），安排在里程碑末尾\n7. 输出要求：每个任务标注 [KR编号] [里程碑] [预估格数] [检验:是/否]" },

    { id: "priority_matrix", name: "优先级矩阵", group: "plan", desc: "加权评分 + 艾森豪威尔双维分析，量化每个任务的优先级分数",
      prompt: "【加权优先级评分法】\n你是优先级决策分析专家。对每个任务进行多维度量化评分：\n\n1. 评分维度（每项 1-5 分）：\n   - 影响值：完成此任务对目标的推进程度\n   - 紧迫值：距 deadline 的剩余时间倒数（<1天=5分，1-3天=4分，3-7天=3分，>7天=2分，无截止=1分）\n   - 依赖值：被多少后续任务依赖（0=1分，1-2=3分，3+=5分）\n   - 能量匹配值：任务所需能量与安排时段能量曲线的匹配度\n   - 努力值（反向）：完成任务所需时间/精力（5分=轻松，1分=很重）\n2. 加权公式：优先级分数 = 影响值×0.30 + 紧迫值×0.25 + 依赖值×0.20 + 能量匹配×0.15 + 努力值×0.10\n3. 分档规则：\n   - 分数 ≥4.0 → 高优先级（priority:high），安排在每日前 1/3 时辰\n   - 分数 2.5-3.9 → 中优先级（priority:medium），安排在中段时辰\n   - 分数 <2.5 → 低优先级（priority:low），安排在末段或删除\n4. 艾森豪威尔交叉验证：对高分数任务再判断重要/紧急象限，重要不紧急的优先保护深度时段\n5. 输出要求：summary 中列出 TOP 3 任务及其分数明细，tasks 数组中每个任务标注 priority 和分数" },

    // ========== 地 · 记录环节技能 ==========
    { id: "time_audit", name: "时间审计", group: "record", desc: "精确追踪时间去向，按任务类型/项目/能量消耗分类统计",
      prompt: "【时间审计分析法】\n你是时间审计专家。指导用户进行精确的时间去向追踪：\n\n1. 记录规范：每格记录必须包含三要素——\n   - actual：实际做了什么（动词开头，如「写了报告第三章」）\n   - spent：实际花费时间（精确到分钟，如「25min」）\n   - note：附加信息（中断次数/分心原因/合作者）\n2. 分类标签体系（tag 字段）：\n   - [深度] 创作类：写作/编程/设计/学习\n   - [协作] 沟通类：会议/电话/邮件/即时消息\n   - [事务] 琐事类：整理/报销/审批/通勤\n   - [恢复] 休息类：午休/散步/冥想\n   - [消耗] 被动类：刷手机/无意义等待\n3. 偏差分析：对比计划与实际记录——\n   - 计划做A实际做了B → 标记「任务漂移」\n   - 计划 30min 实际 60min → 标记「时间膨胀」\n   - 计划有任务实际空格 → 标记「任务遗漏」\n4. 审计输出：在复盘环节生成时间审计报告——\n   - 各类别时间占比（饼图数据）\n   - 深度工作总时长 vs 协作总时长比值\n   - 被动消耗时间占比（目标 <10%）\n   - 任务漂移率（目标 <20%）\n5. 改进建议：针对最大偏差类别给出 1 条具体改进动作" },

    { id: "focus_assessment", name: "专注度评估", group: "record", desc: "评估每段时间的专注深度，识别心流状态与分心模式",
      prompt: "【专注度深度评估法】\n你是专注力分析专家。对用户的每段记录进行专注度量化：\n\n1. 专注度分级（每格评定）：\n   - L4 心流：完全沉浸，忘时间，产出高质量（标记 🟢）\n   - L3 专注：注意力集中，偶有走神但快速拉回（标记 🔵）\n   - L2 浅层：能完成任务但频繁看手机/走神（标记 🟡）\n   - L1 分散：多任务切换，碎片化处理（标记 🟠）\n   - L0 无效：名义在做但实际刷手机/发呆（标记 🔴）\n2. 评估信号（从记录中推断）：\n   - spent 时间与任务复杂度匹配 → 可能高专注\n   - note 中提到「被XX打断」→ 专注被中断\n   - actual 是简单任务但 spent 很长 → 可能低专注\n   - 连续多格同类任务 → 可能进入心流\n3. 分心模式识别：\n   - 频繁中断型：记录中多次出现「被打断」\n   - 任务跳跃型：相邻格子任务类型频繁切换\n   - 拖延型：困难任务被推迟到末段时辰\n   - 过度准备型：大量时间花在「准备」而非「执行」\n4. 心流条件分析：统计出现 L4 心流的格子，分析共性条件（时段/任务类型/前置活动）\n5. 输出建议：在复盘中给出「心流触发公式」（如「上午第2辰 + 编程类 + 前1格冥想 → 80%概率心流」）" },

    { id: "interruption_mgmt", name: "中断管理", group: "record", desc: "记录中断来源与恢复成本，建立中断防护策略",
      prompt: "【中断管理分析法】\n你是中断管理专家。帮助用户追踪和分析工作中断：\n\n1. 中断记录格式（在 note 字段）：\n   - 来源标记：[P]人物中断 [M]消息中断 [E]外部事件 [I]内部冲动\n   - 恢复成本：记录从中断到重新专注的时间（如「恢复5min」）\n   - 示例：「[P]同事问问题，恢复8min」\n2. 中断分类统计：\n   - 可避免中断：社交媒体通知、无预约闲聊 → 应主动消除\n   - 不可避免中断：上级紧急需求、系统故障 → 应建立快速恢复机制\n   - 自发中断：突然想起其他事、习惯性看手机 → 应训练注意力\n3. 影响量化：\n   - 每次中断平均恢复成本 ≈ 15-23 分钟（根据 Gloria Mark 研究）\n   - 计算当日中断总成本 = 中断次数 × 平均恢复时间\n   - 与总可用时间对比，算出「中断损耗率」\n4. 防护策略建议：\n   - 高中断时段识别后，在下一日将深度任务避开该时段\n   - 设置「免打扰时辰」（连续 2 格不开消息通知）\n   - 建立中断缓冲：快速记录中断内容，5分钟内不处理，集中到低能时段批量回复\n5. 输出要求：在复盘中生成「中断热力图」——标注哪些时辰中断最多，给出针对性防护建议" },

    // ========== 人 · 复盘环节技能 ==========
    { id: "grai_review", name: "GRAI复盘", group: "review", desc: "Goal-Result-Analysis-Insight 四步深度复盘法",
      prompt: "【GRAI 深度复盘法】\n你是复盘教练。按 GRAI 框架对今日数据进行四层递进分析：\n\n1. G - Goal 回顾目标：\n   - 提取今日计划中的 TOP 3 任务\n   - 列出每个任务的原始目标（完成标准/预期产出）\n   - 标注哪些是 MIT（最重要任务）\n\n2. R - Result 评估结果：\n   - 逐项对比「计划 vs 实际记录」\n   - 量化完成度：已完成格数/计划总格数 = 完成率\n   - 标注三类结果：✓ 达成  △ 部分达成  ✗ 未达成\n   - 对未达成的任务，从记录中找「时间去哪了」\n\n3. A - Analysis 分析原因：\n   - 成功因素：哪些条件促成了高效完成？（时段/顺序/前置准备/无中断）\n   - 失败因素：用 5-Why 追问法分析根因——\n     Why1: 为什么没完成A？→ 时间被B占了\n     Why2: 为什么B花了更多时间？→ 低估了B的复杂度\n     Why3: 为什么低估？→ 没有提前拆解B的步骤\n     → 根因：规划阶段缺少任务复杂度评估\n   - 偶然 vs 必然：区分哪些是偶发因素（临时会议），哪些是系统性问题（总是低估）\n\n4. I - Insight 提炼洞察：\n   - 1 条「成功公式」：今日最高效的时段+任务+条件组合\n   - 1 条「改进杠杆」：投入最小但效果最大的改进点\n   - 1 条「认知更新」：今天发现的关于自己工作模式的新认知\n   - 明日建议：基于以上洞察，给出明日 2-3 条具体调整建议\n\n5. 输出格式：按 GRAI 四段式输出，每段用数据支撑，避免空泛" },

    { id: "efficiency_insight", name: "效率洞察", group: "review", desc: "趋势分析与模式识别，发现个人效率周期律",
      prompt: "【效率趋势洞察法】\n你是数据分析专家。基于多日曼陀罗数据，识别用户的个人效率模式：\n\n1. 时段效率曲线：\n   - 统计每个时辰（9个）的近 7 日平均完成率\n   - 识别「黄金时段」（完成率 >80% 的时辰）\n   - 识别「低谷时段」（完成率 <40% 的时辰）\n   - 生成效率曲线描述（如「双峰型：上午第2-3辰峰值，下午第6辰回升」）\n\n2. 任务类型效率：\n   - 按 tag 分类统计各类任务的完成率\n   - 找出「最容易完成的任务类型」和「最容易拖延的任务类型」\n   - 分析高完成率任务的共性条件\n\n3. 效率周期识别：\n   - 周内规律：周一到周日的效率波动模式\n   - 能量周期：连续高效日后的效率衰减拐点\n   - 恢复模式：低效日后需要多少天恢复到高效\n\n4. 偏差模式库：\n   - 时间膨胀 TOP3：哪些任务类型最容易被低估时间\n   - 任务漂移 TOP3：哪些计划任务最容易被其他事情挤占\n   - 空格集中区：哪些时辰最容易空置无记录\n\n5. 洞察输出：\n   - 「你的效率画像」：一句话总结用户的工作风格（如「晨间型深度工作者，午后需要结构化安排防止涣散」）\n   - 「最大效率杠杆」：改变哪个变量能最大化提升整体效率\n   - 「效率陷阱」：最需要警惕的效率杀手\n   - 输出格式为结构化 JSON，包含 efficiency_curve、task_analysis、patterns、recommendations 四个字段" },

    { id: "improvement_loop", name: "改进闭环", group: "review", desc: "PDCA 循环改进：从复盘洞察到明日行动的闭环转化",
      prompt: "【PDCA 改进闭环法】\n你是持续改进专家。将复盘洞察转化为可执行的明日改进方案：\n\n1. P - Plan 改进计划：\n   - 从今日复盘中提取 1-3 个具体改进点（不是「提高效率」而是「上午第2辰开始前先关掉微信通知」）\n   - 每个改进点设计可验证的成功标准（如「今日第2辰零中断」）\n   - 将改进点嵌入明日曼陀罗格子（在对应时段前置 1 格作为「改进准备」）\n\n2. D - Do 执行追踪：\n   - 在记录环节特别标注改进点的执行情况\n   - note 字段用 [改进] 前缀标记与改进相关的记录\n   - 追踪改进动作的执行率（计划改进 3 个，实际执行了几个）\n\n3. C - Check 检查验证：\n   - 对比「执行改进日」vs「未执行日」的效率数据\n   - 量化改进效果：完成率提升多少、中断减少多少、心流增加多少\n   - 判断改进是否有效，区分「真改进」和「安慰剂改进」\n\n4. A - Act 标准化固化：\n   - 有效的改进 → 固化为每日标准流程（写入对应时辰的固定任务）\n   - 无效的改进 → 废弃或重新设计\n   - 部分有效的改进 → 微调参数后继续试验\n   - 形成「个人最佳实践库」，每个有效改进用一句话记录\n\n5. 闭环输出：\n   - 今日改进执行率：X/Y\n   - 有效改进数：N 个（列出具体内容）\n   - 明日新改进：M 个（每个附验证标准）\n   - 已固化最佳实践：K 条（累计）\n   - 改进成熟度评级：探索期/验证期/固化期/优化期" },

    // ========== 跨环节综合技能 ==========
    { id: "energy_rhythm", name: "能量节律", group: "cross", desc: "基于超昼夜节律（90分钟周期）匹配任务类型与能量波峰",
      prompt: "【超昼夜节律能量管理法】\n你是生理节律与任务匹配专家。基于超昼夜节律（Ultradian Rhythm）规划任务：\n\n1. 节律映射：\n   - 人体自然节律为 90 分钟高能 + 20 分钟低谷的循环\n   - 曼陀罗每时辰 = 120 分钟 ≈ 1 个完整节律周期 + 30 分钟过渡\n   - 时辰内格 0-5（前 80 分钟）≈ 高能期 → 安排深度任务\n   - 时辰内格 6-8（后 40 分钟）≈ 低谷过渡期 → 安排轻量/休息\n\n2. 能量分级与任务匹配：\n   - T1 超高能（晨起后第1-2辰，皮质醇峰值）：战略思考/创意发散/最难任务\n   - T2 高能（上午第3-4辰）：深度执行/编程/写作\n   - T3 中能（午后第5-6辰）：协作沟通/会议/审查\n   - T4 低能（傍晚第7-8辰）：整理归档/轻量阅读/事务处理\n   - T5 恢复期（晚间第9辰）：复盘冥想/放松/社交\n\n3. 能量保护策略：\n   - 高能时段不安排会议/电话/回复消息\n   - 低能时段不安排重要决策\n   - 连续 2 个高能时辰后强制插入 1 格恢复（散步/冥想/小睡）\n   - 午后第5辰前 3 格安排为「重启仪式」（午餐+散步+咖啡）\n\n4. 个性化校准：\n   - 询问用户的晨型/夜型偏好（MEQ 量表简化版）\n   - 夜型人将 T1/T2 时段后移 1 个时辰\n   - 根据记录数据持续校准个人能量曲线\n\n5. 输出要求：每个任务标注 [能量需求:T1-T5] [节律位置:高能期/低谷期/过渡期]，确保高能任务不安排在低谷期" },

    { id: "habit_system", name: "习惯系统", group: "cross", desc: "基于行为设计学的习惯养成系统：触发-行动-奖励-追踪闭环",
      prompt: "【行为设计习惯系统】\n你是行为设计学（BJ Fogg 模型）专家。帮助用户设计和追踪习惯养成：\n\n1. 习惯设计框架（MAP 模型）：\n   - Motivation 动机：确认习惯的内在驱动力（不是「要运动」而是「想要精力充沛地工作」）\n   - Ability 能力：将习惯拆到极小（不是「健身1小时」而是「穿上跑鞋出门走5分钟」）\n   - Prompt 触发：绑定到已有锚点行为（如「刷牙后→冥想3分钟」）\n\n2. 曼陀罗习惯排布：\n   - 晨间习惯栈（第1时辰格0-3）：触发=起床 → 拉伸(1格)→喝水(1格)→冥想(1格)→写日记(1格)\n   - 工作启动习惯（第2时辰格0-1）：触发=坐到工位 → 清理桌面→查看MIT\n   - 午后重启习惯（第5时辰格0-2）：触发=午休结束 → 散步→深呼吸→设定下午目标\n   - 晚间复盘习惯（第9时辰格0-2）：触发=结束工作 → 回顾今日→规划明日→感恩记录\n\n3. 习惯追踪机制：\n   - 每个习惯任务用 tag 字段标记 [习惯]\n   - 连续打卡天数 = 连续有记录的天数\n   - 习惯强度 = 最近 7 天执行率\n   - 里程碑：7天→萌芽期 / 21天→巩固期 / 66天→稳定期 / 90天→自动化期\n\n4. 奖励设计：\n   - 即时奖励：完成习惯后立刻给予微奖励（听一首歌/伸展一下）\n   - 里程碑奖励：7天/21天/66天设定不同层级的自我奖励\n   - 在格子记录中用 note 标记 [奖励已领取]\n\n5. 习惯堆叠进阶：\n   - 已稳定的习惯（>21天）可以叠加新习惯（如「冥想后→读1页书」）\n   - 每次只叠加 1 个新习惯，避免过载\n   - 失败的习惯 → 降级到更小版本重新开始\n\n6. 输出要求：习惯任务标注 [习惯] [阶段:萌芽/巩固/稳定] [连续天数]，在复盘中生成习惯追踪仪表盘" },

    { id: "weekly_strategy", name: "周度战略", group: "cross", desc: "周维度规划与回顾：主题日设计 + 周目标拆解 + 周复盘仪式",
      prompt: "【周度战略规划法】\n你是战略规划教练。以周为单位进行高层规划与回顾：\n\n1. 周一规划仪式（周一首时辰）：\n   - 回顾上周：完成率/未完成项/最大收获/最大教训\n   - 设定本周主题：用 1-3 个关键词概括本周重心（如「深度输出周」「关系建设周」）\n   - 确定本周 3 个 O（Objective）和每个 O 的 1-2 个 KR\n   - 将周目标拆解到 7 天的曼陀罗格子中\n\n2. 主题日设计（Theme Days）：\n   - 周一：规划+启动（深度任务）\n   - 周二：执行+产出（最高强度深度工作）\n   - 周三：协作+沟通（集中会议/1on1）\n   - 周四：执行+产出（第二深度日）\n   - 周五：收尾+复盘（完成遗留+周复盘）\n   - 周六：探索+学习（兴趣驱动的学习/尝试）\n   - 周日：恢复+规划（充分休息+轻量规划）\n   - 根据用户实际工作节奏调整主题日\n\n3. 周中检查点（周三晚间第8时辰）：\n   - 检查周目标进度：已完成/进行中/未开始\n   - 调整后半周计划：未启动的任务是否需要降级或委托\n   - 识别风险：哪些任务可能延期，提前应对\n\n4. 周五复盘仪式（周五末时辰）：\n   - 数据汇总：本周总完成率/深度工作总时长/中断总成本\n   - 目标达成评估：每个 O 和 KR 的完成度\n   - 精力回顾：哪天最高效/哪天最低效/原因分析\n   - 经验提炼：本周学到的 1 条工作方法改进\n   - 下周预告：下周的主题和核心目标方向\n\n5. 月度趋势（每月最后一周复盘时）：\n   - 4 周效率趋势曲线\n   - 习惯追踪月度总结\n   - 月度目标达成率\n   - 下月战略方向调整\n\n6. 输出要求：周规划生成 7 天概览，每天标注主题和核心任务数；周复盘生成结构化报告含数据/评估/洞察/调整" },

    { id: "state_management", name: "状态管理", group: "cross", desc: "情绪与心理状态管理：压力监测 + 心理能量补给 + 心流触发",
      prompt: "【心理状态与能量管理法】\n你是心理状态管理教练。关注用户的心理能量和情绪状态对效率的影响：\n\n1. 心理能量模型（Ego Depletion 理论）：\n   - 心理能量（意志力）是有限资源，每做一次决策/抵抗诱惑都消耗\n   - 高消耗活动：抗拒诱惑/控制情绪/复杂决策/社交表演\n   - 补给活动：独处/冥想/自然散步/兴趣爱好/深度睡眠\n   - 在格子中标注每个任务的心理消耗值（高/中/低）\n\n2. 压力监测信号：\n   - 从记录中识别压力信号——\n     · 任务密度突然增加（单时辰 8+ 格有任务）\n     · 连续多日无休息格\n     · note 中出现「累」「烦」「不想做」等情绪词\n     · 深度任务完成率下降趋势\n   - 压力分级：绿色（正常）/黄色（偏高）/红色（过载）\n\n3. 心理能量补给策略：\n   - 微补给（1格≈13分钟）：冥想/深呼吸/听音乐/看窗外\n   - 中补给（2-3格）：散步/小睡/聊天/茶歇\n   - 深度补给（1个时辰）：运动/兴趣时间/自然接触\n   - 补给时机：心理能量低于 30% 时强制插入补给格\n\n4. 心流触发设计（Flow State）：\n   - 心流前置条件：明确目标 + 即时反馈 + 挑战与技能匹配\n   - 触发仪式：固定前置动作（如清理桌面→倒水→戴耳机→开始）\n   - 在格子中设计「心流触发序列」：前1格做触发仪式→后4-6格做深度任务\n   - 挑战度匹配：任务难度略高于当前技能水平（约 4% 超出）\n\n5. 情绪管理策略：\n   - 低落时：安排低难度高完成感的任务（整理/回复邮件/简单执行）\n   - 焦虑时：安排结构化任务（有明确步骤的执行类）\n   - 高昂时：安排创意类/挑战类任务（趁势突破）\n   - 拖延时：拆分任务到极小（1格即可完成的最小动作）\n\n6. 输出要求：\n   - 每个任务标注 [心理消耗:高/中/低] [情绪适配:低落/焦虑/高昂/平稳]\n   - 复盘中增加「心理状态评估」段落\n   - 高压力日自动建议插入补给格\n   - 生成「个人心流档案」：记录心流出现的条件组合" },
  ];

  const PROMPT_TEMPLATES = {
    gtd: "你是 GTD 时间管理专家。把用户的输入收集→厘清→组织→回顾→执行。每个格子必须是单一、可执行的下一步行动，以动词开头。项目类任务拆成多个步骤分布到不同格子。一个格子可以放多个相关的小任务。",
    eisenhower: "你是艾森豪威尔矩阵专家。评估每个任务的重要性和紧急性：重要紧急立即做（上午）；重要不紧急计划做（深度时段）；紧急不重要委托/批量（午后）；不重要不紧急删除或放晚上。",
    pomodoro: "你是番茄工作法教练。每 2 格约 26 分钟≈1 个番茄钟。深度任务连续安排番茄钟，每 4 个番茄钟安排 15-30 分钟长休息。休息也要安排进格子。",
    energy: "你是能量管理专家。按生理节律：晨型任务（运动/学习）放第1-2辰；深度工作放第2-4辰；沟通/会议放第4-6辰；创意/复盘放第6-8辰；放松/睡眠准备放第9辰。",
    morning_boot: "你是晨间仪式设计专家。先询问用户昨晚睡眠时长和今日首要目标，然后按晨间启动法生成分层方案：唤醒过渡→意图设定→信息摄取→第一个深度任务。每时辰最后 1-2 格留缓冲。",
    schedule_orchestration: "你是日程编排算法专家。识别任务依赖链做拓扑排序，控制认知负荷（高负荷不连续超 4 格），每时辰预留缓冲格，最小化上下文切换，有 deadline 的任务倒推预留 20% 裕度。每个任务标注 [负荷] [依赖] [缓冲]。",
    goal_decomposition: "你是 OKR 目标管理专家。将用户目标按 Objective→KR→里程碑→行动单元四层拆解。每个行动单元以动词开头，可在 1-4 格内完成。按依赖排序，里程碑末尾设检验动作。标注 [KR编号] [里程碑] [预估格数]。",
    priority_matrix: "你是优先级决策分析专家。对每个任务按影响值(0.30)+紧迫值(0.25)+依赖值(0.20)+能量匹配(0.15)+努力值(0.10)加权评分。≥4.0 高优先级安排前 1/3 时辰，2.5-3.9 中优先级中段，<2.5 低优先级末段或删除。",
    time_audit: "你是时间审计专家。指导用户每格记录 actual+spent+note 三要素，按 [深度]/[协作]/[事务]/[恢复]/[消耗] 五类标签分类。对比计划与实际，标记任务漂移/时间膨胀/任务遗漏，在复盘中生成审计报告。",
    focus_assessment: "你是专注力分析专家。对每格记录按 L0-L4 五级评定专注度（L4心流→L0无效）。从记录推断评估信号，识别分心模式（频繁中断/任务跳跃/拖延/过度准备），统计心流条件组合，输出心流触发公式。",
    interruption_mgmt: "你是中断管理专家。指导用户用 [P][M][E][I] 标记中断来源，记录恢复成本。统计中断总成本和损耗率，区分可避免/不可避免/自发中断，在复盘中生成中断热力图并给出防护策略。",
    grai_review: "你是 GRAI 复盘教练。按 Goal(回顾目标)→Result(评估结果)→Analysis(5Why分析根因)→Insight(提炼成功公式+改进杠杆+认知更新)四步进行深度复盘。每段用数据支撑，输出明日 2-3 条调整建议。",
    efficiency_insight: "你是效率数据分析专家。统计各时辰近 7 日完成率，识别黄金/低谷时段。按任务类型分析完成率，识别效率周期（周内规律/能量衰减拐点/恢复模式），输出效率画像和最大效率杠杆。",
    improvement_loop: "你是 PDCA 改进专家。将复盘洞察转化为可验证的改进计划(Plan)→执行追踪(Do)→效果验证(Check)→标准化固化(Act)。每个改进点附成功标准，追踪执行率，形成个人最佳实践库。",
    energy_rhythm: "你是超昼夜节律专家。按 90 分钟高能+20 分钟低谷的循环，将曼陀罗每时辰分为高能期(格0-5)和低谷期(格6-8)。任务按 T1-T5 能量分级匹配，高能时段禁排会议，连续 2 高能时辰后强制插入恢复格。",
    habit_system: "你是行为设计学(BJ Fogg)专家。按 MAP 模型(动机-能力-触发)设计习惯，拆到极小动作，绑定锚点行为。在曼陀罗格子中排布晨间/工作启动/午后/晚间四个习惯栈，追踪连续天数和习惯强度(7/21/66/90天里程碑)。",
    weekly_strategy: "你是战略规划教练。以周为单位：周一设定主题和 OKR，设计主题日(周一规划→周二深度→周三协作→周四深度→周五收尾→周六探索→周日恢复)，周三周中检查，周五周复盘，月末月度趋势分析。",
    state_management: "你是心理状态管理教练。基于 Ego Depletion 理论追踪心理能量消耗，从记录识别压力信号(任务密度突增/连续无休息/情绪词)，设计微/中/深度三级补给策略，建立心流触发序列，按情绪状态匹配任务类型。",
  };

  // 预设提示词分类（按状态机环节绑定）
  // 每个环节对应一段可编辑的引导提示词，状态切换时自动激活
  const PRESET_PROMPT_CATEGORIES = [
    {
      id: "stage_idle",
      stage: "idle",
      name: "待命·首次接单",
      desc: "用户刚描述任务，复述理解并询问背景",
      recommendedSkills: ["gtd", "energy", "morning_boot", "state_management"],
      isSystem: true,
      content: "你正在【待命】环节。用户刚描述了任务。\n请做两件事：\n1. 简短复述你对任务的理解（一句话）\n2. 提出 2-4 个背景问题，帮助更好地分配到曼陀罗时辰：\n   - 预计时长 / 优先级 / 截止时间 / 当前能量状态\n不要直接给方案。设置 action=\"clarify\"。",
      summaryTemplate: "已确认任务：{{任务}}；关键背景：{{要点}}。进入方案生成环节。",
    },
    {
      id: "stage_gathering",
      stage: "gathering",
      name: "收集背景→生成方案",
      desc: "用户已补充背景，生成完整方案并询问确认",
      recommendedSkills: ["timeblock", "energy", "schedule_orchestration", "energy_rhythm"],
      isSystem: true,
      content: "你正在【收集背景→生成方案】环节。用户已补充背景细节。\n请生成完整方案：\n1. 按时辰（5:00-23:00，共9时辰）分组列出任务清单\n2. 每个任务标注：时辰、格子序号、预计时长、优先级\n3. 询问\"是否按此安排？如有调整请说明\"\n设置 action=\"confirm\" 和 tasks 数组。\n可给出 1-2 个备选方案（alternatives 字段）。",
      summaryTemplate: "方案已生成：共 {{任务数}} 个任务，分布 {{时辰数}} 个时辰。进入确认环节。",
    },
    {
      id: "stage_confirming",
      stage: "confirming",
      name: "确认方案",
      desc: "用户提出调整意见，重新生成方案",
      recommendedSkills: ["eisenhower", "gtd", "priority_matrix", "schedule_orchestration"],
      isSystem: true,
      content: "你正在【确认方案】环节。用户对方案提出了调整意见。\n请重新生成方案，并标注本次调整的点。\n再次询问\"是否按此安排？\"。\n设置 action=\"confirm\" 和 tasks 数组。\n若用户明确同意（\"是\"\"可以\"\"同意\"），改设 action=\"execute\"。",
      summaryTemplate: "方案已确认：{{任务数}} 个任务将填入格子。进入执行环节。",
    },
    {
      id: "stage_project_breakdown",
      stage: "project_breakdown",
      name: "项目拆解",
      desc: "递归拆解项目为可执行学习单元",
      recommendedSkills: ["deepwork", "gtd", "timeblock", "goal_decomposition", "habit_system"],
      isSystem: true,
      content: "你正在【项目拆解】环节。用户给出项目目标（如\"学习嵌入式开发\"）。\n按 6 步推进，每轮只推进一步：\n1. 识别主要模块（如 C语言、STM32、焊锡、单片机...）\n2. 询问用户模块清单是否完整/优先级\n3. 对每个模块继续细分（C语言→指针/结构体/内存管理...）\n4. 对细分点「组块压缩」——合并为可在 13 分钟格子内完成的单元\n5. 对每个组块「深度剖析」——必须套用【知识评估 7 维度】核心追问逐项检验（见下方框架），输出每个组块在各维度的薄弱点与建议\n6. 按依赖关系和难度分配到格子\n设置 action=\"breakdown\"，返回 breakdown 树结构和下一轮问题。\n全部拆解完成且用户确认后，设 action=\"confirm\" 并把 leaf 任务放入 tasks。",
      summaryTemplate: "项目拆解完成：{{模块数}} 个模块，{{任务数}} 个可执行单元。进入确认环节。",
    },
    {
      id: "stage_done",
      stage: "done",
      name: "已完成",
      desc: "任务已填入格子，给出执行建议",
      recommendedSkills: ["pomodoro", "energy", "focus_assessment", "time_audit", "interruption_mgmt"],
      isSystem: true,
      content: "你正在【已完成】环节。任务已填入曼陀罗格子。\n请：\n1. 简要总结今日安排（2-3 句）\n2. 提示关键时间节点（如\"11:00 有重要任务，建议提前准备\"）\n3. 询问是否需要进一步调整或开始执行\n若用户要调整，回到 confirming；若要新任务，回到 idle。",
      summaryTemplate: "今日安排已就绪：{{任务数}} 个任务。开始执行。",
    },
    // 附加提示词（自定义，全局生效，不绑定特定环节）
    {
      id: "energy_focus",
      stage: "",
      name: "能量专注规划",
      desc: "以能量管理为核心，匹配任务类型与生理节律（附加）",
      recommendedSkills: ["energy", "pomodoro", "deepwork"],
      isSystem: false,
      content: "你是能量管理专家。所有任务按生理节律分配：晨间高能做深度工作/学习，午后低能做沟通/杂事，晚间做创意/复盘。优先保护深度时段不被打断。",
    },
  ];

  // 状态机环节枚举（与 chatState 对应）
  // 主线 4 环节：待命→收集→确认→完成（线性推进）
  const STAGE_ORDER = ["idle", "gathering", "confirming", "done"];
  // 分支环节：项目拆解（可从 idle 进入，完成后回到 confirming）
  const STAGE_BRANCH = "project_breakdown";

  // 搜索 API 提供商预设
  const SEARCH_PROVIDERS = {
    wikipedia: {
      name: "Wikipedia 维基百科",
      endpoint: "https://zh.wikipedia.org/w/api.php",
      needsKey: false,
      buildHeaders: () => ({ "Content-Type": "application/json" }),
      buildBody: () => null,
      buildUrl: (q) => `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=5&origin=*`,
      parse: (data) => (data.query?.search || []).map((r) => ({
        title: r.title,
        content: r.snippet.replace(/<[^>]+>/g, ""),
        url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/\s+/g, "_"))}`,
      })),
    },
    duckduckgo: {
      name: "DuckDuckGo 即时回答",
      endpoint: "https://api.duckduckgo.com/",
      needsKey: false,
      buildHeaders: () => ({ "Content-Type": "application/json" }),
      buildBody: () => null,
      buildUrl: (q) => `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&no_redirect=1&t=mandala-time`,
      parse: (data) => {
        const results = [];
        if (data.AbstractText) results.push({ title: data.Heading || "DuckDuckGo", content: data.AbstractText, url: data.AbstractURL || "" });
        (data.RelatedTopics || []).slice(0, 4).forEach((t) => {
          if (t.Text) results.push({ title: t.Text.split(" - ")[0] || "相关", content: t.Text, url: t.FirstURL || "" });
        });
        return results;
      },
    },
    tavily: {
      name: "Tavily（AI 友好）",
      endpoint: "https://api.tavily.com/search",
      needsKey: true,
      buildHeaders: (key) => ({ "Content-Type": "application/json" }),
      buildBody: (key, q) => JSON.stringify({ api_key: key, query: q, max_results: 5 }),
      parse: (data) => (data.results || []).map((r) => ({ title: r.title, content: r.content, url: r.url })),
    },
    serper: {
      name: "Serper（Google 搜索）",
      endpoint: "https://google.serper.dev/search",
      needsKey: true,
      buildHeaders: (key) => ({ "Content-Type": "application/json", "X-API-KEY": key }),
      buildBody: (key, q) => JSON.stringify({ q: q, num: 5 }),
      parse: (data) => (data.organic || []).map((r) => ({ title: r.title, content: r.snippet, url: r.link })),
    },
    bing: {
      name: "Bing Web Search",
      endpoint: "https://api.bing.microsoft.com/v7.0/search",
      needsKey: true,
      buildHeaders: (key) => ({ "Ocp-Apim-Subscription-Key": key }),
      buildBody: (key, q) => null,
      parse: (data) => (data.webPages?.value || []).map((r) => ({ title: r.name, content: r.snippet, url: r.url })),
    },
  };

  // ---------- 状态 ----------
  let state = {
    tasks: load(STORAGE_KEY, {}),
    done: load(DONE_KEY, {}),
    settings: load(SETTINGS_KEY, {
      apiUrl: "", apiKey: "", apiModel: "gpt-4o-mini",
      skills: [], customSkill: "", customPrompt: "",
      mcpEnabled: false, mcpConfig: "",
      // 提示词分类（按状态机环节绑定，可自定义增删改）
      promptCategories: PRESET_PROMPT_CATEGORIES.map((c) => ({ ...c })),
      activePromptId: "stage_idle",
      // 联网搜索配置
      searchEnabled: true,
      searchProvider: "wikipedia",
      searchApiKey: "",
      searchAutoQuery: true, // 自动根据用户输入生成搜索词
      notifyLeadMin: 0, // 提前提醒分钟数（0=到点提醒）
      soundEnabled: false, // 完成任务声音反馈
      accentColor: "", // 自定义强调色（空=默认）
      // Hermes 联动同步
      syncUrl: "", syncEnabled: false,
    }),
    theme: load(THEME_KEY, "auto"),
    notifyEnabled: load(NOTIFY_KEY, false),
    activePeriod: 0,
    editingCell: null,
    lastNotifiedCell: -1,
    lastAdvanceNotifiedCell: -1, // 提前提醒已通知的格子
    currentDate: dateToStr(new Date()),
    calMonth: null, // {year, month} 日历视图月份
    // 多轮对话状态机：idle(待命) | gathering(收集背景) | confirming(确认方案) | project_breakdown(项目拆解) | done(已规划)
    chatState: "idle",
    pendingPlan: null, // 待确认的拆解方案
    userIntent: "", // 用户原始意图
    breakdownContext: null, // 项目拆解上下文 { goal, milestones, currentMilestone }
    breakdownStep: 1, // 项目拆解子步骤序号 1-6（仅 project_breakdown 环节有效）
    undoStack: [], // 撤销栈：每次 AI 填入前记录 {date, key, prevTasks}
    lastUserText: "", // 上一次用户输入（用于重新生成）
    abortController: null, // 用于取消进行中的 AI 请求
    chatHistory: [], // 传给 AI 的对话历史 [{role, content}]
    fillMode: "append", // 填入模式：append(追加) | overwrite(覆盖)
    batchMode: false, // 批量选择模式
    batchSelected: new Set(), // 选中的 cellKey 集合
    inputHistory: [], // 输入框历史
    draftPlan: null, // 方案草稿暂存
    // 天地人三才：plan(计划) | record(记录) | review(复盘)
    realm: "plan",
    // 记录页数据：{ "2026-07-29": { "0-0": { spent: "30分钟", actual: "实际做的事", note: "" } } }
    records: load(RECORD_KEY, {}),
    // 复盘页数据：{ "2026-07-29": { summary, insights, stats, userNotes, aiGeneratedAt } }
    reviews: load(REVIEW_KEY, {}),
    // 时辰切换检测：记录上次检测到的时辰（用于触发"该记录了"提示+闪烁）
    lastPeriod: -1,
  };

  // ---------- 日期工具 ----------
  function dateToStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function strToDate(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function isToday(s) {
    return s === dateToStr(new Date());
  }

  function formatDateLabel(s) {
    const d = strToDate(s);
    const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
  }

  // ---------- 存储工具 ----------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.warn("保存失败", e); }
    // Hermes 联动：数据变更触发防抖推送（仅对已知数据键）
    if (key === STORAGE_KEY || key === DONE_KEY || key === LONGTASK_KEY || key === INBOX_KEY || key === SETTINGS_KEY || key === HERMES_NOTES_KEY) {
      scheduleSyncPush();
    }
  }

  // ---------- Hermes 联动同步（L2） ----------
  // 防抖推送：本地数据变更后 3 秒内无新变更才推送，避免高频写
  let syncPushTimer = null;
  let syncPullDone = false;
  function scheduleSyncPush() {
    if (!state.settings.syncEnabled || !state.settings.syncUrl) return;
    if (syncPushTimer) clearTimeout(syncPushTimer);
    syncPushTimer = setTimeout(pushSync, 3000);
  }
  function buildSyncPayload() {
    return {
      version: 5, exportedAt: new Date().toISOString(),
      tasks: state.tasks, done: state.done, checklists: state.checklists, repeats: state.repeats,
      records: state.records, reviews: state.reviews,
      longTasks: load(LONGTASK_KEY, []),
      inbox: load(INBOX_KEY, []),
      hermesNotes: load(HERMES_NOTES_KEY, []),
      actions: load(ACTIONS_KEY, []), // 含 consumed 状态，回写让 Hermes 端可知晓已执行
    };
  }
  async function pushSync() {
    const url = state.settings.syncUrl;
    if (!url) return;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSyncPayload()),
      });
      if (res.ok && el.syncStatus) el.syncStatus.textContent = "✓ 已同步 " + new Date().toLocaleTimeString();
    } catch (e) { /* 静默失败，不阻塞用户 */ if (el.syncStatus) el.syncStatus.textContent = "⚠ 同步失败"; }
  }
  async function pullSync() {
    if (!state.settings.syncEnabled || !state.settings.syncUrl) return;
    try {
      const res = await fetch(state.settings.syncUrl, { method: "GET" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.tasks) return;
      // 合并远程数据（与导入逻辑一致：合并不覆盖）
      Object.keys(data.tasks || {}).forEach((d) => {
        if (!state.tasks[d]) state.tasks[d] = {};
        Object.assign(state.tasks[d], data.tasks[d]);
      });
      if (data.done) Object.keys(data.done).forEach((d) => { if (!state.done[d]) state.done[d] = {}; Object.assign(state.done[d], data.done[d]); });
      if (data.longTasks) save(LONGTASK_KEY, data.longTasks);
      if (data.inbox) {
        // 合并：按 id 去重，保留本地未同步项（避免覆盖丢失）
        const local = load("mandala-inbox-v1", []);
        const existIds = new Set(local.map((x) => x.id).filter(Boolean));
        const merged = local.concat(data.inbox.filter((x) => x.id && !existIds.has(x.id)));
        save("mandala-inbox-v1", merged);
      }
      if (data.hermesNotes) {
        // 按 id 合并去重（远程不覆盖本地未同步项），与 inbox 一致策略
        const localNotes = load(HERMES_NOTES_KEY, []);
        const noteIds = new Set(localNotes.map((x) => x.id).filter(Boolean));
        const mergedNotes = localNotes.concat(
          (data.hermesNotes || []).filter((x) => x.id && !noteIds.has(x.id))
        );
        save(HERMES_NOTES_KEY, mergedNotes);
        renderHermesNotes();
      }
      if (data.inbox) {
        // 合并后刷新收集箱视图（重新加载 + 重渲染，确保 Hermes 写入的卡片可见）
        if (typeof openInbox !== "undefined" && el.inboxDialog && el.inboxDialog.open) {
          // 收集箱已打开时才需要刷新，否则下次 openInbox 会自动加载
          inboxItems = load(INBOX_KEY, []);
          updateInboxTagDatalist();
          renderInboxFilter();
          renderInboxList();
        }
      }
      syncPullDone = true;
      if (el.syncStatus) el.syncStatus.textContent = "✓ 已拉取远程数据";
      // 拉取到远程 actions 后立即消费（Hermes trigger_action 触发）
      if (data.actions) consumeActions(data.actions);
      renderAll(); // 合并后重渲染
    } catch (e) { /* 静默 */ }
  }

  // ---------- 时辰切换检测 ----------
  // 每分钟检测当前时辰是否变化，进入新时辰时提示"上一时辰有 N 个未完成"+ 闪烁
  function checkPeriodTransition() {
    if (!isToday(state.currentDate)) return;
    const cur = getCurrentPeriod();
    if (cur < 0) return;
    if (state.lastPeriod < 0) {
      // 首次初始化，仅记录不提示
      state.lastPeriod = cur;
      return;
    }
    if (cur === state.lastPeriod) return;
    // 时辰已切换：lastPeriod → cur
    const prevPeriod = state.lastPeriod;
    state.lastPeriod = cur;
    // 统计上一时辰未完成任务数
    let undoneCount = 0;
    for (let c = 0; c < CELLS_PER_PERIOD; c++) {
      const tasks = getCellTasks(prevPeriod, c);
      undoneCount += tasks.filter((t) => !t.done).length;
    }
    const prevName = PERIOD_NAMES[prevPeriod] || `第${prevPeriod + 1}时辰`;
    const curName = PERIOD_NAMES[cur] || `第${cur + 1}时辰`;
    const undoneHint = undoneCount > 0 ? `，上一时辰 ${prevName} 有 ${undoneCount} 个未完成` : "";
    toast(`时辰已转入 ${curName}${undoneHint}，可去记录页补登`, "info", 5000);
    // 触发辨识度闪烁
    triggerPeriodPulse(cur);
  }

  // ---------- Hermes 动作消费 ----------
  // 消费 Hermes 通过 trigger_action 写入的动作队列
  function consumeActions(remoteActions) {
    if (!Array.isArray(remoteActions) || !remoteActions.length) return;
    const local = load(ACTIONS_KEY, []);
    const localIds = new Set(local.map((a) => a.id).filter(Boolean));
    // 合并：仅追加本地没有的
    const merged = local.concat(remoteActions.filter((a) => a.id && !localIds.has(a.id)));
    save(ACTIONS_KEY, merged);
    // 执行未消费的动作
    const pending = merged.filter((a) => !a.consumed);
    if (!pending.length) return;
    for (const action of pending) {
      executeAction(action);
      action.consumed = true;
    }
    save(ACTIONS_KEY, merged);
    // 标记远程已消费（写回 syncUrl，下次 pushSync 会带 actions）
    // 注意：远程 consumed 状态由本地 pushSync 同步，这里仅更新本地视图
  }

  // 执行单个 Hermes 动作
  function executeAction(action) {
    const { type, payload = {}, message } = action;
    try {
      if (type === "switch_realm") {
        const realm = payload.realm;
        if (realm && ["plan", "record", "review"].includes(realm)) {
          setRealm(realm);
          toast(message || `Hermes 已切换到 ${realm === "plan" ? "计划" : realm === "record" ? "记录" : "复盘"}页`, "info", 3000);
          haptic(30); // 切页轻震
        }
      } else if (type === "toast") {
        toast(message || "Hermes 提示", "info", 4000);
        haptic(20); // 提示轻震
      } else if (type === "pulse") {
        triggerPeriodPulse(state.activePeriod);
        toast(message || "时辰提醒", "info", 3000);
      }
    } catch (e) { /* 静默，不影响其他动作 */ }
  }

  // 触发时辰切换/提醒闪烁（辨识度高）
  function triggerPeriodPulse(period) {
    // 1. 时辰切换标签闪烁
    const tabs = el.periodTabs ? el.periodTabs.querySelectorAll(".period-tab") : [];
    const targetTab = tabs[period];
    if (targetTab) {
      targetTab.classList.remove("period-pulse");
      // 强制重排以重启动画
      void targetTab.offsetWidth;
      targetTab.classList.add("period-pulse");
      setTimeout(() => targetTab.classList.remove("period-pulse"), 3000);
    }
    // 2. 九宫格边框闪烁
    if (el.mandalaGrid) {
      el.mandalaGrid.classList.remove("grid-pulse");
      void el.mandalaGrid.offsetWidth;
      el.mandalaGrid.classList.add("grid-pulse");
      setTimeout(() => el.mandalaGrid.classList.remove("grid-pulse"), 3000);
    }
    // 3. 震动反馈（APK 原生 Haptics / 浏览器 navigator.vibrate）
    haptic([60, 40, 60]);
  }
  // 渲染 Hermes 同步的总结/规划到对话区顶部（独立容器，不污染对话历史）
  const NOTE_TYPE_META = {
    summary: { icon: "📋", label: "Hermes 总结" },
    plan: { icon: "🗺️", label: "Hermes 规划" },
    insight: { icon: "💡", label: "Hermes 洞察" },
  };
  function renderHermesNotes() {
    if (!el.chatMessages) return;
    let container = document.getElementById("hermesNotesContainer");
    const notes = load(HERMES_NOTES_KEY, []);
    const today = dateToStr(new Date());
    const todays = notes.filter((n) => n.date === today);
    if (!todays.length) { if (container) container.remove(); return; }
    if (!container) {
      container = document.createElement("div");
      container.id = "hermesNotesContainer";
      container.className = "hermes-notes-container";
      el.chatMessages.insertBefore(container, el.chatMessages.firstChild);
    }
    container.innerHTML = todays.map((n) => {
      const meta = NOTE_TYPE_META[n.type] || NOTE_TYPE_META.summary;
      const time = n.at ? new Date(n.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
      return `<div class="hermes-note" data-id="${n.id}" data-type="${n.type}">
        <div class="hermes-note-head">
          <span class="hermes-note-icon">${meta.icon}</span>
          <span class="hermes-note-label">${meta.label}</span>
          <span class="hermes-note-time">${time}</span>
          <button class="hermes-note-close" data-id="${n.id}" aria-label="关闭">✕</button>
        </div>
        <div class="hermes-note-body">${escapeHtml(n.text)}</div>
      </div>`;
    }).join("");
    container.querySelectorAll(".hermes-note-close").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const all = load(HERMES_NOTES_KEY, []).filter((x) => x.id !== id);
        save(HERMES_NOTES_KEY, all);
        renderHermesNotes();
      });
    });
  }

  // ---------- 方案草稿暂存 ----------
  // 当 AI 生成方案但用户尚未确认时，自动暂存 pendingPlan，便于跨刷新/跨会话恢复
  function saveDraftPlan() {
    if (state.pendingPlan && state.pendingPlan.tasks && state.pendingPlan.tasks.length) {
      save(DRAFT_PLAN_KEY, {
        plan: state.pendingPlan,
        userIntent: state.userIntent,
        chatState: state.chatState,
        fillMode: state.fillMode,
        savedAt: new Date().toISOString(),
      });
    } else {
      clearDraftPlan();
    }
  }
  function clearDraftPlan() {
    try { localStorage.removeItem(DRAFT_PLAN_KEY); } catch (e) {}
  }
  function loadDraftPlan() {
    return load(DRAFT_PLAN_KEY, null);
  }

  // ---------- 子任务清单 ----------
  // 结构：{ [date]: { [cellKey]: [{text, done}, ...] } }
  state.checklists = load(CHECKLIST_KEY, {});
  function getCellChecklist(period, cell) {
    const day = state.checklists[state.currentDate] || {};
    return (day[cellKey(period, cell)] || []).map((c) => ({ text: c.text || "", done: !!c.done }));
  }
  function setCellChecklist(period, cell, items) {
    if (!state.checklists[state.currentDate]) state.checklists[state.currentDate] = {};
    const key = cellKey(period, cell);
    if (items && items.filter((i) => i.text.trim()).length) {
      state.checklists[state.currentDate][key] = items.filter((i) => i.text.trim()).map((i) => ({ text: i.text.trim(), done: !!i.done }));
    } else {
      delete state.checklists[state.currentDate][key];
    }
    save(CHECKLIST_KEY, state.checklists);
  }
  function toggleChecklistItem(period, cell, idx) {
    const items = getCellChecklist(period, cell);
    if (items[idx]) {
      items[idx].done = !items[idx].done;
      setCellChecklist(period, cell, items);
      // 完成时若带 dim 标记（孵化产出），提示去评分
      const it = items[idx];
      if (it.done && it.dim) {
        promptDimScore(it.dim, it.dimGoal);
      }
    }
  }

  // 维度评分提示（孵化完成回填闭环）
  function promptDimScore(dim, goal) {
    const [dc, sk] = dim.split(".");
    const meta = lookupDim(dc, sk);
    if (!meta) return;
    const goalTxt = goal ? `目标 ${goal} 星` : "自评 1-5 星";
    toast(`${dim} 练习完成（${goalTxt}）。${meta.question}`, "success", 5000);
    if (navigator.vibrate) navigator.vibrate([10, 30, 10, 30, 10]);
  }
  function checklistProgress(period, cell) {
    const items = getCellChecklist(period, cell);
    if (!items.length) return null;
    const done = items.filter((i) => i.done).length;
    return { done, total: items.length };
  }

  // ---------- 重复任务规则 ----------
  // 结构：state.repeats = { [id]: {id, sourceDate, period, cell, tasks, rule, maxCount, createdAt, appliedDates: []} }
  state.repeats = load(REPEAT_KEY, {});
  function saveRepeats() { save(REPEAT_KEY, state.repeats); }

  function addRepeatRule(sourceDate, period, cell, tasks, rule, maxCount) {
    if (!rule) return null;
    const id = "rpt_" + Date.now();
    state.repeats[id] = {
      id, sourceDate, period, cell,
      tasks: JSON.parse(JSON.stringify(tasks)),
      rule, maxCount: parseInt(maxCount, 10) || 0,
      createdAt: new Date().toISOString(),
      appliedDates: [sourceDate], // 已生成过的日期
    };
    saveRepeats();
    return id;
  }
  function removeRepeatRulesForCell(date, period, cell) {
    let removed = 0;
    Object.keys(state.repeats).forEach((id) => {
      const r = state.repeats[id];
      if (r.sourceDate === date && r.period === period && r.cell === cell) {
        delete state.repeats[id];
        removed++;
      }
    });
    if (removed) saveRepeats();
    return removed;
  }
  function getRepeatRuleForCell(date, period, cell) {
    return Object.values(state.repeats).find(
      (r) => r.sourceDate === date && r.period === period && r.cell === cell
    );
  }
  // 判断某日期是否匹配重复规则
  function dateMatchesRule(dateStr, rule, sourceDate) {
    const d = strToDate(dateStr);
    const dow = d.getDay(); // 0=日,1=一...6=六
    const src = strToDate(sourceDate);
    if (rule === "daily") return dateStr !== sourceDate;
    if (rule === "weekdays") return dow >= 1 && dow <= 5 && dateStr !== sourceDate;
    if (rule === "weekend") return (dow === 0 || dow === 6) && dateStr !== sourceDate;
    if (rule === "weekly") return dow === src.getDay() && dateStr !== sourceDate;
    return false;
  }
  // 应用所有重复规则到指定日期（幂等，已应用则跳过）
  function applyRepeatsToDate(targetDate) {
    let added = 0;
    Object.values(state.repeats).forEach((r) => {
      if (r.appliedDates.includes(targetDate)) return;
      if (!dateMatchesRule(targetDate, r.rule, r.sourceDate)) return;
      // 检查次数上限（0=无限）
      if (r.maxCount > 0 && r.appliedDates.length - 1 >= r.maxCount) return;
      // 复制任务到目标日期（追加）
      if (!state.tasks[targetDate]) state.tasks[targetDate] = {};
      const key = cellKey(r.period, r.cell);
      const existing = (state.tasks[targetDate][key] || []).map(normalizeTask);
      const merged = existing.concat(r.tasks.map(normalizeTask));
      state.tasks[targetDate][key] = merged;
      // 复制清单
      if (state.checklists[r.sourceDate] && state.checklists[r.sourceDate][key]) {
        if (!state.checklists[targetDate]) state.checklists[targetDate] = {};
        state.checklists[targetDate][key] = JSON.parse(JSON.stringify(state.checklists[r.sourceDate][key]));
      }
      r.appliedDates.push(targetDate);
      added++;
    });
    if (added) {
      save(STORAGE_KEY, state.tasks);
      save(CHECKLIST_KEY, state.checklists);
      saveRepeats();
    }
    return added;
  }
  // 切换日期时触发重复任务生成
  function refreshRepeats() {
    const today = dateToStr(new Date());
    // 为今天及未来 60 天生成（覆盖常见规划周期）
    let total = 0;
    for (let i = 0; i <= 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      total += applyRepeatsToDate(dateToStr(d));
    }
    return total;
  }

  // ---------- 旧数据迁移 ----------
  // 任务对象标准化：字符串/对象 → 对象 {text, priority, tag, estimate, deadline}
  function normalizeTask(t) {
    if (typeof t === "string") return { text: t, priority: "medium", tag: "", estimate: "", deadline: "", done: false };
    if (!t || typeof t !== "object") return { text: "", priority: "medium", tag: "", estimate: "", deadline: "", done: false };
    return {
      text: t.text || String(t.text || ""),
      priority: t.priority || "medium",
      tag: t.tag || "",
      estimate: t.estimate || "",
      deadline: t.deadline || "",
      done: !!t.done,
    };
  }

  // 提取任务文本（兼容字符串/对象）
  function taskText(t) {
    return typeof t === "string" ? t : (t && t.text) || "";
  }

  function migrateOldData() {
    const oldTasks = load(OLD_TASKS_KEY, null);
    const oldDone = load(OLD_DONE_KEY, null);
    if (oldTasks) {
      const today = dateToStr(new Date());
      const migrated = {};
      Object.keys(oldTasks).forEach((k) => {
        const v = oldTasks[k];
        if (typeof v === "string") {
          migrated[k] = v ? [v] : [];
        } else if (Array.isArray(v)) {
          migrated[k] = v;
        }
      });
      if (Object.keys(migrated).length && !state.tasks[today]) {
        state.tasks[today] = migrated;
        save(STORAGE_KEY, state.tasks);
        localStorage.removeItem(OLD_TASKS_KEY);
      }
    }
    if (oldDone) {
      const today = dateToStr(new Date());
      const migratedDone = {};
      Object.keys(oldDone).forEach((k) => { if (oldDone[k]) migratedDone[k] = true; });
      if (Object.keys(migratedDone).length && !state.done[today]) {
        state.done[today] = migratedDone;
        save(DONE_KEY, state.done);
        localStorage.removeItem(OLD_DONE_KEY);
      }
    }
    // v2→v3 迁移：任务字符串数组 → 对象数组
    const TASK_VER_KEY = "mandala-task-version";
    const curVer = load(TASK_VER_KEY, 2);
    if (curVer < 3) {
      let migratedCount = 0;
      Object.keys(state.tasks).forEach((date) => {
        const day = state.tasks[date];
        Object.keys(day).forEach((k) => {
          if (Array.isArray(day[k])) {
            day[k] = day[k].map((t) => {
              if (typeof t === "string") { migratedCount++; return normalizeTask(t); }
              return normalizeTask(t);
            });
          }
        });
      });
      save(STORAGE_KEY, state.tasks);
      save(TASK_VER_KEY, 3);
      if (migratedCount) console.log(`迁移 ${migratedCount} 个任务为对象格式`);
    }
    // v3→v4 迁移：提示词分类从 category 字段迁移到 stage 字段（按状态机环节绑定）
    const PROMPT_VER_KEY = "mandala-prompt-version";
    const promptVer = load(PROMPT_VER_KEY, 3);
    if (promptVer < 4) {
      // 旧分类 id/category → 新 stage 映射
      const oldIdToStage = {
        general: "idle",
        project: "project_breakdown",
        deep_communicate: "gathering",
      };
      const oldCategoryToStage = {
        general: "idle",
        clarify: "gathering",
        project: "project_breakdown",
      };
      const oldCats = state.settings.promptCategories || [];
      // 构建新分类列表：先放 5 个预设环节（保留用户自定义内容）
      const newCats = [];
      const usedOldIndices = new Set();
      PRESET_PROMPT_CATEGORIES.forEach((preset) => {
        // 尝试从旧分类中找匹配（按 id 或按 stage 映射）
        let matched = null;
        for (let i = 0; i < oldCats.length; i++) {
          if (usedOldIndices.has(i)) continue;
          const old = oldCats[i];
          // 直接 id 匹配
          if (old.id === preset.id) { matched = old; usedOldIndices.add(i); break; }
          // 旧 id 映射到新 stage
          if (oldIdToStage[old.id] === preset.stage) { matched = old; usedOldIndices.add(i); break; }
          // 旧 category 字段映射
          if (old.category && oldCategoryToStage[old.category] === preset.stage) { matched = old; usedOldIndices.add(i); break; }
        }
        if (matched) {
          // 保留用户自定义的 name/desc/content/recommendedSkills，但用新预设的 stage/id/isSystem/summaryTemplate
          newCats.push({
            id: preset.id,
            stage: preset.stage,
            name: matched.name || preset.name,
            desc: matched.desc || preset.desc,
            content: matched.content || preset.content,
            recommendedSkills: (matched.recommendedSkills || []).slice(),
            isSystem: true,
            summaryTemplate: preset.summaryTemplate,
          });
        } else {
          newCats.push({ ...preset });
        }
      });
      // 保留未匹配的旧分类作为附加提示词（stage=""）
      oldCats.forEach((old, i) => {
        if (usedOldIndices.has(i)) return;
        newCats.push({
          id: old.id || ("custom_" + Date.now() + "_" + i),
          stage: "",
          name: old.name || "未命名提示词",
          desc: old.desc || "",
          content: old.content || "",
          recommendedSkills: (old.recommendedSkills || []).slice(),
          isSystem: false,
        });
      });
      state.settings.promptCategories = newCats;
      // 修正 activePromptId
      const oldActive = state.settings.activePromptId;
      if (oldActive) {
        const mapped = oldIdToStage[oldActive];
        if (mapped) {
          const newCat = newCats.find((c) => c.stage === mapped);
          state.settings.activePromptId = newCat ? newCat.id : "stage_idle";
        }
      }
      if (!newCats.some((c) => c.id === state.settings.activePromptId)) {
        state.settings.activePromptId = "stage_idle";
      }
      save(SETTINGS_KEY, state.settings);
      save(PROMPT_VER_KEY, 4);
      console.log("提示词分类已迁移到 v4（按状态机环节绑定）");
    }
  }

  // 按状态机环节获取对应分类
  function getStageCategory(stage) {
    const cats = state.settings.promptCategories || [];
    return cats.find((c) => c.stage === stage) || cats.find((c) => c.id === "stage_idle") || cats[0];
  }

  // 获取当前 chatState 对应的环节分类
  function getCurrentStageCategory() {
    return getStageCategory(state.chatState);
  }

  // 获取所有附加提示词（不绑定环节的自定义分类）
  function getCustomCategories() {
    return (state.settings.promptCategories || []).filter((c) => !c.stage);
  }

  // 根据模板生成环节总结文本
  function renderStageSummary(template, context) {
    if (!template) return "";
    let out = template;
    Object.keys(context).forEach((k) => {
      out = out.replace(new RegExp("\\{\\{" + k + "\\}\\}", "g"), context[k] || "—");
    });
    // 清理未填充的占位符
    out = out.replace(/\{\{[^}]+\}\}/g, "—");
    return out;
  }

  // ---------- 日期任务访问器 ----------
  function getDayTasks(date) {
    return state.tasks[date] || {};
  }

  function getDayDone(date) {
    return state.done[date] || {};
  }

  function getCellTasks(period, cell) {
    const dayTasks = getDayTasks(state.currentDate);
    return (dayTasks[cellKey(period, cell)] || []).map(normalizeTask);
  }

  function getCellDone(period, cell) {
    const dayDone = getDayDone(state.currentDate);
    return !!dayDone[cellKey(period, cell)];
  }

  function setCellTasks(period, cell, taskArray) {
    if (!state.tasks[state.currentDate]) state.tasks[state.currentDate] = {};
    const key = cellKey(period, cell);
    if (taskArray && taskArray.length) {
      state.tasks[state.currentDate][key] = taskArray.map(normalizeTask);
    } else {
      delete state.tasks[state.currentDate][key];
    }
    save(STORAGE_KEY, state.tasks);
  }

  function setCellDone(period, cell, done) {
    if (!state.done[state.currentDate]) state.done[state.currentDate] = {};
    const key = cellKey(period, cell);
    if (done) {
      state.done[state.currentDate][key] = true;
    } else {
      delete state.done[state.currentDate][key];
    }
    save(DONE_KEY, state.done);
  }

  function addCellTask(period, cell, task) {
    const arr = getCellTasks(period, cell).slice();
    arr.push(typeof task === "string" ? normalizeTask(task) : normalizeTask(task));
    setCellTasks(period, cell, arr);
  }

  // ---------- 时间工具 ----------
  function secondsToHHMM(totalSeconds) {
    const sec = Math.floor(totalSeconds);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function nowSeconds() {
    const now = new Date();
    return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  }

  function getCurrentPeriod() {
    const now = nowSeconds();
    if (now < START_SECONDS) return -1;
    const elapsed = now - START_SECONDS;
    const period = Math.floor(elapsed / SECONDS_PER_PERIOD);
    return period >= PERIOD_COUNT ? -1 : period;
  }

  function getCurrentGlobalCell() {
    const now = nowSeconds();
    if (now < START_SECONDS) return -1;
    const elapsed = now - START_SECONDS;
    const globalCell = Math.floor(elapsed / SECONDS_PER_CELL);
    return globalCell >= PERIOD_COUNT * CELLS_PER_PERIOD ? -1 : globalCell;
  }

  function getCellRange(period, cell) {
    const start = START_SECONDS + period * SECONDS_PER_PERIOD + cell * SECONDS_PER_CELL;
    return { start, end: start + SECONDS_PER_CELL };
  }

  function getPeriodRange(period) {
    const start = START_SECONDS + period * SECONDS_PER_PERIOD;
    return { start, end: start + SECONDS_PER_PERIOD };
  }

  function cellKey(period, cell) { return `${period}-${cell}`; }

  // 通用涟漪反馈：在元素点击位置生成扩散圆
  function spawnRipple(target, ev) {
    if (!target || !target.getBoundingClientRect) return;
    const rect = target.getBoundingClientRect();
    const x = (ev && ev.clientX !== undefined ? ev.clientX : rect.left + rect.width / 2) - rect.left;
    const y = (ev && ev.clientY !== undefined ? ev.clientY : rect.top + rect.height / 2) - rect.top;
    const r = document.createElement("span");
    r.className = "ripple";
    const size = Math.max(rect.width, rect.height) * 1.1;
    r.style.cssText = `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;`;
    target.appendChild(r);
    setTimeout(() => r.remove(), 650);
  }

  // 填格动画：对指定格子触发"新任务进入"动画
  function animateCellFill(period, cell) {
    const idx = cell;
    const cellEl = el.mandalaGrid && el.mandalaGrid.children[idx];
    if (!cellEl) return;
    cellEl.classList.remove("cell-fill-anim");
    void cellEl.offsetWidth;
    cellEl.classList.add("cell-fill-anim");
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ---------- Toast ----------
  function toast(msg, type, duration) {
    const container = document.getElementById("toastContainer");
    const el = document.createElement("div");
    el.className = `toast ${type || ""}`;
    el.textContent = msg;
    el.addEventListener("click", () => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 300);
    });
    container.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) {
        el.classList.add("hide");
        setTimeout(() => el.remove(), 300);
      }
    }, duration || 2400);
  }

  // ---------- 快捷键视觉浮层 ----------
  function showKeyHint(key, label) {
    const existing = document.querySelector(".key-hint-overlay");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.className = "key-hint-overlay";
    el.innerHTML = `<div class="kh-key">${escapeHtml(key)}</div><div class="kh-label">${escapeHtml(label)}</div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  // ---------- DOM ----------
  const el = {
    clock: document.getElementById("clock"),
    currentInfo: document.getElementById("currentInfo"),
    dateLabel: document.getElementById("dateLabel"),
    periodTabs: document.getElementById("periodTabs"),
    mandalaGrid: document.getElementById("mandalaGrid"),
    mandalaTitle: document.getElementById("mandalaTitle"),
    prevPeriod: document.getElementById("prevPeriod"),
    nextPeriod: document.getElementById("nextPeriod"),
    // 天地人三才
    realmSwitcher: document.getElementById("realmSwitcher"),
    realmContainer: document.getElementById("realmContainer"),
    recordGrid: document.getElementById("recordGrid"),
    recordTitle: document.getElementById("recordTitle"),
    prevPeriodR: document.getElementById("prevPeriodR"),
    nextPeriodR: document.getElementById("nextPeriodR"),
    reviewBody: document.getElementById("reviewBody"),
    aiReviewBtn: document.getElementById("aiReviewBtn"),
    clearReviewBtn: document.getElementById("clearReviewBtn"),
    exportReviewBtn: document.getElementById("exportReviewBtn"),
    recordStatsInline: document.getElementById("recordStatsInline"),
    syncPlanBtn: document.getElementById("syncPlanBtn"),
    clearPeriodRecordBtn: document.getElementById("clearPeriodRecordBtn"),
    clearDayRecordBtn: document.getElementById("clearDayRecordBtn"),
    goReviewFromRecord: document.getElementById("goReviewFromRecord"),
    goRecordFromPlan: document.getElementById("goRecordFromPlan"),
    goReviewFromPlan: document.getElementById("goReviewFromPlan"),
    realmFab: document.getElementById("realmFab"),
    overviewGrid: document.getElementById("overviewGrid"),
    chatMessages: document.getElementById("chatMessages"),
    chatInput: document.getElementById("chatInput"),
    sendBtn: document.getElementById("sendBtn"),
    chatBadges: document.getElementById("chatBadges"),
    stageProgress: document.getElementById("stageProgress"),
    stageProgressFill: document.getElementById("stageProgressFill"),
    stageNodes: document.getElementById("stageNodes"),
    stageCurrentLabel: document.getElementById("stageCurrentLabel"),
    breakdownSteps: document.getElementById("breakdownSteps"),
    bsStepCounter: document.getElementById("bsStepCounter"),
    bsTrackFill: document.getElementById("bsTrackFill"),
    bsNodes: document.getElementById("bsNodes"),
    bsCurrentLabel: document.getElementById("bsCurrentLabel"),
    bsHint: document.getElementById("bsHint"),
    chatSection: document.querySelector(".chat-section"),
    quickToggle: document.getElementById("quickToggle"),
    themeBtn: document.getElementById("themeBtn"),
    notifyBtn: document.getElementById("notifyBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    settingsDialog: document.getElementById("settingsDialog"),
    closeSettings: document.getElementById("closeSettings"),
    apiUrl: document.getElementById("apiUrl"),
    apiKey: document.getElementById("apiKey"),
    apiKeyOptional: document.getElementById("apiKeyOptional"),
    apiKeyHint: document.getElementById("apiKeyHint"),
    apiModel: document.getElementById("apiModel"),
    platformGrid: document.getElementById("platformGrid"),
    // Hermes 联动同步
    syncUrl: document.getElementById("syncUrl"),
    syncEnabled: document.getElementById("syncEnabled"),
    syncStatus: document.getElementById("syncStatus"),
    skillList: document.getElementById("skillList"),
    skillFile: document.getElementById("skillFile"),
    skillUploadBtn: document.getElementById("skillUploadBtn"),
    skillFileName: document.getElementById("skillFileName"),
    promptFile: document.getElementById("promptFile"),
    promptUploadBtn: document.getElementById("promptUploadBtn"),
    promptFileName: document.getElementById("promptFileName"),
    activeCategoryName: document.getElementById("activeCategoryName"),
    categoryList: document.getElementById("categoryList"),
    addCategoryBtn: document.getElementById("addCategoryBtn"),
    categoryEditorOverlay: document.getElementById("categoryEditorOverlay"),
    categoryEditorTitle: document.getElementById("categoryEditorTitle"),
    categoryNameInput: document.getElementById("categoryNameInput"),
    categoryDescInput: document.getElementById("categoryDescInput"),
    categoryContentInput: document.getElementById("categoryContentInput"),
    saveCategoryBtn: document.getElementById("saveCategoryBtn"),
    cancelCategoryBtn: document.getElementById("cancelCategoryBtn"),
    searchEnabled: document.getElementById("searchEnabled"),
    searchProvider: document.getElementById("searchProvider"),
    searchApiKey: document.getElementById("searchApiKey"),
    searchAutoQuery: document.getElementById("searchAutoQuery"),
    testSearchBtn: document.getElementById("testSearchBtn"),
    searchTestResult: document.getElementById("searchTestResult"),
    mcpEnabled: document.getElementById("mcpEnabled"),
    mcpConfig: document.getElementById("mcpConfig"),
    mcpStatus: document.getElementById("mcpStatus"),
    mcpFile: document.getElementById("mcpFile"),
    mcpUploadBtn: document.getElementById("mcpUploadBtn"),
    mcpFileName: document.getElementById("mcpFileName"),
    saveSettings: document.getElementById("saveSettings"),
    storageInfo: document.getElementById("storageInfo"),
    clearTodayData: document.getElementById("clearTodayData"),
    clearAllData: document.getElementById("clearAllData"),
    taskDialog: document.getElementById("taskDialog"),
    taskDialogTitle: document.getElementById("taskDialogTitle"),
    taskTimeRange: document.getElementById("taskTimeRange"),
    taskContent: document.getElementById("taskContent"),
    taskDone: document.getElementById("taskDone"),
    closeTaskDialog: document.getElementById("closeTaskDialog"),
    taskPriority: document.getElementById("taskPriority"),
    taskTag: document.getElementById("taskTag"),
    taskEstimate: document.getElementById("taskEstimate"),
    taskDeadline: document.getElementById("taskDeadline"),
    taskChecklist: document.getElementById("taskChecklist"),
    taskRepeat: document.getElementById("taskRepeat"),
    taskRepeatCount: document.getElementById("taskRepeatCount"),
    notifyLeadMin: document.getElementById("notifyLeadMin"),
    accentColor: document.getElementById("accentColor"),
    resetAccentBtn: document.getElementById("resetAccentBtn"),
    accentPresets: document.getElementById("accentPresets"),
    soundEnabled: document.getElementById("soundEnabled"),
    testSoundBtn: document.getElementById("testSoundBtn"),
    pomodoroBar: document.getElementById("pomodoroBar"),
    pomoTime: document.getElementById("pomoTime"),
    pomoLabel: document.getElementById("pomoLabel"),
    pomoTask: document.getElementById("pomoTask"),
    pomoToggle: document.getElementById("pomoToggle"),
    pomoStop: document.getElementById("pomoStop"),
    pomoProgressCircle: document.getElementById("pomoProgressCircle"),
    startPomoBtn: document.getElementById("startPomoBtn"),
    genSyncCodeBtn: document.getElementById("genSyncCodeBtn"),
    genSyncLinkBtn: document.getElementById("genSyncLinkBtn"),
    syncCodeArea: document.getElementById("syncCodeArea"),
    importSyncBtn: document.getElementById("importSyncBtn"),
    copySyncBtn: document.getElementById("copySyncBtn"),
    saveTask: document.getElementById("saveTask"),
    deleteTask: document.getElementById("deleteTask"),
    clearChat: document.getElementById("clearChat"),
    clearGridsBtn: document.getElementById("clearGridsBtn"),
    chatSuggestions: document.getElementById("chatSuggestions"),
    todayBtn: document.getElementById("todayBtn"),
    calendarBtn: document.getElementById("calendarBtn"),
    calendarDialog: document.getElementById("calendarDialog"),
    calTitle: document.getElementById("calTitle"),
    calGrid: document.getElementById("calGrid"),
    calPrev: document.getElementById("calPrev"),
    calNext: document.getElementById("calNext"),
    statBtn: document.getElementById("statBtn"),
    statDialog: document.getElementById("statDialog"),
    statBody: document.getElementById("statBody"),
    closeStat: document.getElementById("closeStat"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    importFile: document.getElementById("importFile"),
    fabAdd: document.getElementById("fabAdd"),
    shortcutBtn: document.getElementById("shortcutBtn"),
    shortcutDialog: document.getElementById("shortcutDialog"),
    closeShortcut: document.getElementById("closeShortcut"),
    templateBtn: document.getElementById("templateBtn"),
    templateDialog: document.getElementById("templateDialog"),
    closeTemplate: document.getElementById("closeTemplate"),
    saveTemplateBtn: document.getElementById("saveTemplateBtn"),
    tplCurDate: document.getElementById("tplCurDate"),
    templateList: document.getElementById("templateList"),
    convTplDialog: document.getElementById("convTplDialog"),
    closeConvTpl: document.getElementById("closeConvTpl"),
    convTplName: document.getElementById("convTplName"),
    convTplText: document.getElementById("convTplText"),
    convTplCategory: document.getElementById("convTplCategory"),
    saveConvTplBtn: document.getElementById("saveConvTplBtn"),
    useInputConvTplBtn: document.getElementById("useInputConvTplBtn"),
    convTplList: document.getElementById("convTplList"),
    icalBtn: document.getElementById("icalBtn"),
    undoBtn: document.getElementById("undoBtn"),
    fillModeSelect: document.getElementById("fillModeSelect"),
    searchBtn: document.getElementById("searchBtn"),
    batchBtn: document.getElementById("batchBtn"),
    searchDialog: document.getElementById("searchDialog"),
    searchInput: document.getElementById("searchInput"),
    searchResults: document.getElementById("searchResults"),
    closeSearch: document.getElementById("closeSearch"),
    // 收集箱
    inboxBtn: document.getElementById("inboxBtn"),
    inboxDialog: document.getElementById("inboxDialog"),
    closeInbox: document.getElementById("closeInbox"),
    inboxInput: document.getElementById("inboxInput"),
    inboxCategory: document.getElementById("inboxCategory"),
    inboxAddBtn: document.getElementById("inboxAddBtn"),
    inboxList: document.getElementById("inboxList"),
    inboxFilter: document.getElementById("inboxFilter"),
    inboxTimeFilter: document.getElementById("inboxTimeFilter"),
    inboxTagList: document.getElementById("inboxTagList"),
    inboxTagChips: document.getElementById("inboxTagChips"),
    // 长期任务时间地图
    longtaskBar: document.getElementById("longtaskBar"),
    longtaskTimeline: document.getElementById("longtaskTimeline"),
    ltbHint: document.getElementById("ltbHint"),
    ltbAddBtn: document.getElementById("ltbAddBtn"),
    // 收集箱-长期任务模式
    inboxQuickPane: document.getElementById("inboxQuickPane"),
    inboxLongPane: document.getElementById("inboxLongPane"),
    longTitle: document.getElementById("longTitle"),
    longStart: document.getElementById("longStart"),
    longDue: document.getElementById("longDue"),
    longRepeat: document.getElementById("longRepeat"),
    longBindCell: document.getElementById("longBindCell"),
    longNote: document.getElementById("longNote"),
    longSaveBtn: document.getElementById("longSaveBtn"),
    longList: document.getElementById("longList"),
    // 长期任务详情弹窗
    longtaskDetailDialog: document.getElementById("longtaskDetailDialog"),
    ltdTitle: document.getElementById("ltdTitle"),
    ltdBody: document.getElementById("ltdBody"),
    closeLongDetail: document.getElementById("closeLongDetail"),
    // 知识评估 7 维度参考卡
    knowledgeDimDialog: document.getElementById("knowledgeDimDialog"),
    kdimGrid: document.getElementById("kdimGrid"),
    // 任务孵化
    hatchBtn: document.getElementById("hatchBtn"),
    hatchDialog: document.getElementById("hatchDialog"),
    closeHatch: document.getElementById("closeHatch"),
    hatchTaskText: document.getElementById("hatchTaskText"),
    hatchMode: document.getElementById("hatchMode"),
    hatchScene: document.getElementById("hatchScene"),
    hatchHistoryHint: document.getElementById("hatchHistoryHint"),
    hatchProgress: document.getElementById("hatchProgress"),
    hatchProgressFill: document.getElementById("hatchProgressFill"),
    hatchProgressText: document.getElementById("hatchProgressText"),
    hatchResult: document.getElementById("hatchResult"),
    hatchSummary: document.getElementById("hatchSummary"),
    hatchShortcut: document.getElementById("hatchShortcut"),
    hatchList: document.getElementById("hatchList"),
    hatchError: document.getElementById("hatchError"),
    hatchSelectAll: document.getElementById("hatchSelectAll"),
    hatchInvert: document.getElementById("hatchInvert"),
    hatchRegen: document.getElementById("hatchRegen"),
    hatchApply: document.getElementById("hatchApply"),
    hatchCancelBtn: document.getElementById("hatchCancelBtn"),
    // 复盘汇总
    reviewSummary: document.getElementById("reviewSummary"),
    reviewPeriodNav: document.getElementById("reviewPeriodNav"),
    recordPeriodNav: document.getElementById("recordPeriodNav"),
    planPeriodNav: document.getElementById("planPeriodNav"),
  };

  // ---------- 主题 ----------
  function resolveTheme() {
    if (state.theme === "auto") {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    return state.theme;
  }

  function applyTheme() {
    const resolved = resolveTheme();
    document.documentElement.setAttribute("data-theme", resolved);
    el.themeBtn.textContent = state.theme === "auto" ? "🌗" : (resolved === "dark" ? "🌙" : "☀");
    el.themeBtn.title = state.theme === "auto" ? "自动跟随系统（点击切换）" : (resolved === "dark" ? "暗色（点击切换）" : "亮色（点击切换）");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#1a1a2e" : "#ffffff");
  }

  // ---------- 自定义强调色 ----------
  const DEFAULT_ACCENTS = ["#7c5cff", "#22c1c3", "#f97316", "#ec4899", "#10b981", "#3b82f6", "#eab308"];
  function applyAccentColor(color) {
    if (!color) {
      document.documentElement.style.removeProperty("--accent");
      document.documentElement.style.removeProperty("--accent-light");
      document.documentElement.style.removeProperty("--accent-glow");
      document.documentElement.style.removeProperty("--border-active");
      return;
    }
    const root = document.documentElement.style;
    root.setProperty("--accent", color);
    root.setProperty("--accent-light", lightenHex(color, 18));
    root.setProperty("--accent-glow", hexToRgba(color, 0.4));
    root.setProperty("--border-active", hexToRgba(color, 0.6));
  }
  function hexToRgba(hex, a) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  function lightenHex(hex, amt) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    let r = Math.min(255, ((n >> 16) & 255) + amt);
    let g = Math.min(255, ((n >> 8) & 255) + amt);
    let b = Math.min(255, (n & 255) + amt);
    return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  // ---------- 声音反馈 ----------
  let audioCtx = null;
  function playDoneSound() {
    if (!state.settings.soundEnabled) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx;
      if (ctx.state === "suspended") ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(660, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.26);
    } catch (e) {}
  }

  // ---------- 专注计时器（番茄钟） ----------
  // 模式：focus(专注) | break(休息) | idle
  const POMO_PRESETS = [
    { label: "番茄钟 25/5", focus: 25, brk: 5, longBrk: 15, cycles: 4 },
    { label: "短专注 15/3", focus: 15, brk: 3, longBrk: 10, cycles: 4 },
    { label: "深度 50/10", focus: 50, brk: 10, longBrk: 20, cycles: 3 },
    { label: "曼陀罗格 13/2", focus: 13, brk: 2, longBrk: 6, cycles: 4 },
  ];
  const POMO_STATE_KEY = "mandala-pomo-state-v1";
  let pomo = {
    mode: "idle", // focus | break | idle
    remaining: 0, // 秒
    total: 0, // 当前阶段总秒数
    running: false,
    cycle: 0, // 已完成专注次数
    preset: POMO_PRESETS[0],
    taskLabel: "",
    cellRef: null, // {period, cell, date}
    timerId: null,
    endAt: 0, // 暂停时记录剩余；运行时记录结束时间戳
  };

  function loadPomoState() {
    const saved = load(POMO_STATE_KEY, null);
    if (saved && saved.mode !== "idle" && saved.remaining > 0) {
      pomo.mode = saved.mode;
      pomo.total = saved.total;
      pomo.cycle = saved.cycle || 0;
      pomo.taskLabel = saved.taskLabel || "";
      pomo.cellRef = saved.cellRef || null;
      pomo.preset = POMO_PRESETS.find((p) => p.label === saved.presetLabel) || POMO_PRESETS[0];
      // 若保存时正在运行，按 endAt 恢复剩余；否则用 remaining
      if (saved.running && saved.endAt) {
        const left = Math.round((saved.endAt - Date.now()) / 1000);
        pomo.remaining = left > 0 ? left : 0;
        if (pomo.remaining > 0) { pomo.running = true; pomo.endAt = saved.endAt; startPomoTick(); }
        else { finishPomoPhase(); return; }
      } else {
        pomo.remaining = saved.remaining;
        pomo.running = false;
      }
      showPomoBar();
      updatePomoUI();
    }
  }
  function savePomoState() {
    save(POMO_STATE_KEY, {
      mode: pomo.mode, total: pomo.total, remaining: pomo.running ? Math.max(0, Math.round((pomo.endAt - Date.now()) / 1000)) : pomo.remaining,
      running: pomo.running, cycle: pomo.cycle, taskLabel: pomo.taskLabel, cellRef: pomo.cellRef,
      presetLabel: pomo.preset.label, endAt: pomo.running ? pomo.endAt : 0,
    });
  }

  function startPomoFocus(period, cell, taskLabel) {
    pomo.mode = "focus";
    pomo.total = pomo.preset.focus * 60;
    pomo.remaining = pomo.total;
    pomo.running = true;
    pomo.endAt = Date.now() + pomo.remaining * 1000;
    pomo.taskLabel = taskLabel || "专注中";
    pomo.cellRef = (period >= 0 && cell >= 0) ? { period, cell, date: state.currentDate } : null;
    showPomoBar();
    updatePomoUI();
    startPomoTick();
    savePomoState();
  }

  function startPomoBreak(isLong) {
    pomo.mode = "break";
    pomo.total = (isLong ? pomo.preset.longBrk : pomo.preset.brk) * 60;
    pomo.remaining = pomo.total;
    pomo.running = true;
    pomo.endAt = Date.now() + pomo.remaining * 1000;
    pomo.taskLabel = isLong ? "长休息" : "短休息";
    showPomoBar();
    updatePomoUI();
    startPomoTick();
    savePomoState();
  }

  function startPomoTick() {
    if (pomo.timerId) clearInterval(pomo.timerId);
    pomo.timerId = setInterval(() => {
      if (!pomo.running) return;
      const left = Math.round((pomo.endAt - Date.now()) / 1000);
      pomo.remaining = left > 0 ? left : 0;
      updatePomoUI();
      if (pomo.remaining <= 0) {
        clearInterval(pomo.timerId); pomo.timerId = null;
        finishPomoPhase();
      }
    }, 1000);
  }

  function finishPomoPhase() {
    playDoneSound();
    if (pomo.mode === "focus") {
      pomo.cycle++;
      const isLong = pomo.cycle % pomo.preset.cycles === 0;
      notifyPomo(`🍅 专注完成！${isLong ? "长休息" : "短休息"} ${isLong ? pomo.preset.longBrk : pomo.preset.brk} 分钟`);
      toast(`🍅 专注完成（第 ${pomo.cycle} 次），开始${isLong ? "长" : "短"}休息`, "success");
      startPomoBreak(isLong);
    } else {
      notifyPomo("☕ 休息结束，开始下一个专注");
      toast("☕ 休息结束，准备下一个专注", "info");
      pomo.mode = "idle";
      pomo.running = false;
      hidePomoBar();
      savePomoState();
    }
  }

  function notifyPomo(body) {
    if (state.notifyEnabled && "Notification" in window && Notification.permission === "granted") {
      new Notification("曼陀罗专注", { body });
    }
  }

  function togglePomo() {
    if (pomo.mode === "idle") return;
    if (pomo.running) {
      // 暂停：冻结剩余时间
      pomo.remaining = Math.max(0, Math.round((pomo.endAt - Date.now()) / 1000));
      pomo.running = false;
    } else {
      // 继续
      pomo.endAt = Date.now() + pomo.remaining * 1000;
      pomo.running = true;
    }
    updatePomoUI();
    savePomoState();
  }

  function stopPomo() {
    if (!confirm("停止当前专注计时？")) return;
    if (pomo.timerId) { clearInterval(pomo.timerId); pomo.timerId = null; }
    pomo.mode = "idle"; pomo.running = false; pomo.remaining = 0;
    hidePomoBar();
    savePomoState();
    toast("已停止专注", "info");
  }

  function showPomoBar() { el.pomodoroBar.style.display = "flex"; }
  function hidePomoBar() { el.pomodoroBar.style.display = "none"; }

  function updatePomoUI() {
    const m = Math.floor(pomo.remaining / 60);
    const s = pomo.remaining % 60;
    el.pomoTime.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    el.pomoLabel.textContent = pomo.mode === "focus" ? `专注 · 第${pomo.cycle + 1}次` : pomo.taskLabel;
    el.pomoTask.textContent = pomo.taskLabel || "—";
    el.pomoToggle.textContent = pomo.running ? "⏸" : "▶";
    // 进度环
    const pct = pomo.total > 0 ? (1 - pomo.remaining / pomo.total) : 0;
    const C = 2 * Math.PI * 15.9;
    el.pomoProgressCircle.style.strokeDasharray = `${C}`;
    el.pomoProgressCircle.style.strokeDashoffset = `${C * (1 - pct)}`;
    el.pomodoroBar.classList.toggle("is-focus", pomo.mode === "focus");
    el.pomodoroBar.classList.toggle("is-break", pomo.mode === "break");
    el.pomodoroBar.classList.toggle("paused", !pomo.running);
  }

  el.pomoToggle.addEventListener("click", togglePomo);
  el.pomoStop.addEventListener("click", stopPomo);

  // 任务弹窗"开始专注"按钮
  el.startPomoBtn.addEventListener("click", () => {
    if (!state.editingCell) return;
    const { period, cell } = state.editingCell;
    const tasks = getCellTasks(period, cell);
    const label = tasks.length ? tasks.map(taskText).join("、") : "专注任务";
    // 若有预估时长，尝试匹配预设
    const est = tasks[0]?.estimate || "";
    const minMatch = est.match(/(\d+)\s*(min|分钟|m)/i);
    const hMatch = est.match(/(\d+)\s*(h|小时|hr)/i);
    let focusMin = 0;
    if (hMatch) focusMin = parseInt(hMatch[1], 10) * 60;
    else if (minMatch) focusMin = parseInt(minMatch[1], 10);
    if (focusMin > 0) {
      pomo.preset = { label: "自定义", focus: focusMin, brk: Math.max(3, Math.round(focusMin / 5)), longBrk: Math.max(10, Math.round(focusMin / 3)), cycles: 4 };
    }
    closeTaskDialog();
    startPomoFocus(period, cell, label);
    toast(`🍅 开始专注 ${pomo.preset.focus} 分钟：${label}`, "success");
  });

  // 长按 fabAdd 切换番茄钟预设（短按仍快速添加）
  let fabPressTimer = null;
  el.fabAdd.addEventListener("touchstart", () => {
    fabPressTimer = setTimeout(() => {
      fabPressTimer = null;
      cyclePomoPreset();
    }, 600);
  });
  el.fabAdd.addEventListener("touchend", () => { if (fabPressTimer) clearTimeout(fabPressTimer); });
  el.fabAdd.addEventListener("touchmove", () => { if (fabPressTimer) clearTimeout(fabPressTimer); });
  function cyclePomoPreset() {
    const idx = POMO_PRESETS.indexOf(pomo.preset);
    pomo.preset = POMO_PRESETS[(idx + 1) % POMO_PRESETS.length];
    toast(`🍅 番茄钟预设：${pomo.preset.label}`, "info");
  }

  el.themeBtn.addEventListener("click", () => {
    // auto → dark → light → auto
    const order = ["auto", "dark", "light"];
    const idx = order.indexOf(state.theme);
    state.theme = order[(idx + 1) % order.length];
    save(THEME_KEY, state.theme);
    applyTheme();
    toast(state.theme === "auto" ? "已切换到自动跟随系统" : (state.theme === "dark" ? "已切换暗色" : "已切换亮色"), "info");
  });

  // 监听系统主题变化
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
      if (state.theme === "auto") applyTheme();
    });
  }

  // ---------- 提醒 ----------
  function applyNotifyBtn() { el.notifyBtn.classList.toggle("active", state.notifyEnabled); }

  el.notifyBtn.addEventListener("click", async () => {
    if (!state.notifyEnabled) {
      if (!("Notification" in window)) { toast("浏览器不支持通知", "error"); return; }
      let permission = Notification.permission;
      if (permission !== "granted") permission = await Notification.requestPermission();
      if (permission === "granted") {
        state.notifyEnabled = true; save(NOTIFY_KEY, true); applyNotifyBtn();
        toast("已开启提醒，到点会通知你", "success");
      } else { toast("需授权通知权限", "error"); }
    } else {
      state.notifyEnabled = false; save(NOTIFY_KEY, false); applyNotifyBtn();
      toast("已关闭提醒", "info");
    }
  });

  function checkNotify() {
    if (!state.notifyEnabled || !isToday(state.currentDate)) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const now = nowSeconds();
    const leadSec = (state.settings.notifyLeadMin || 0) * 60;
    const totalCells = PERIOD_COUNT * CELLS_PER_PERIOD;

    // 1) 到点提醒：当前格子
    const currentCell = getCurrentGlobalCell();
    if (currentCell >= 0 && currentCell !== state.lastNotifiedCell) {
      const period = Math.floor(currentCell / CELLS_PER_PERIOD);
      const cell = currentCell % CELLS_PER_PERIOD;
      const tasks = getCellTasks(period, cell);
      const range = getCellRange(period, cell);
      const prog = checklistProgress(period, cell);
      const progStr = prog ? `（清单 ${prog.done}/${prog.total}）` : "";
      if (tasks.length) {
        new Notification("⏰ 曼陀罗时辰到点", {
          body: `${secondsToHHMM(range.start)} 开始：${tasks.map(taskText).join("；")}${progStr}`,
        });
      } else {
        new Notification("曼陀罗时辰", { body: `${secondsToHHMM(range.start)} - 该格子暂无任务` });
      }
      state.lastNotifiedCell = currentCell;
    }

    // 2) 提前提醒：下一格开始前 leadSec 秒
    if (leadSec > 0) {
      // 找到下一个尚未开始、且其开始时间在 now+leadSec 之内的格子
      for (let g = 0; g < totalCells; g++) {
        const period = Math.floor(g / CELLS_PER_PERIOD);
        const cell = g % CELLS_PER_PERIOD;
        const range = getCellRange(period, cell);
        const leadStart = range.start - leadSec;
        // 已进入提前窗口且尚未到点
        if (now >= leadStart && now < range.start) {
          if (g === state.lastAdvanceNotifiedCell) break;
          state.lastAdvanceNotifiedCell = g;
          const tasks = getCellTasks(period, cell);
          const minsLeft = Math.max(1, Math.round((range.start - now) / 60));
          if (tasks.length) {
            new Notification("🔔 即将开始", {
              body: `${minsLeft} 分钟后（${secondsToHHMM(range.start)}）：${tasks.map(taskText).join("；")}`,
            });
          }
          break; // 只通知最近的一个
        }
      }
    }
  }

  // ---------- 日期切换 ----------
  function updateDateLabel() {
    el.dateLabel.textContent = isToday(state.currentDate)
      ? "今天 · " + formatDateLabel(state.currentDate)
      : formatDateLabel(state.currentDate);
    el.dateLabel.classList.toggle("today", isToday(state.currentDate));
  }

  el.dateLabel.addEventListener("click", () => openCalendar());
  el.todayBtn.addEventListener("click", () => {
    state.currentDate = dateToStr(new Date());
    state.activePeriod = Math.max(0, getCurrentPeriod());
    updateDateLabel();
    renderAll();
    toast("已回到今天", "info");
  });

  // ---------- 渲染：时辰标签 ----------
  function renderPeriodTabs() {
    const currentPeriod = getCurrentPeriod();
    el.periodTabs.innerHTML = "";
    for (let i = 0; i < PERIOD_COUNT; i++) {
      const range = getPeriodRange(i);
      const tab = document.createElement("button");
      tab.className = "period-tab";
      if (i === state.activePeriod) tab.classList.add("active");
      if (i === currentPeriod && isToday(state.currentDate)) tab.classList.add("current");
      tab.textContent = `${PERIOD_GLYPHS[i]} ${secondsToHHMM(range.start)}`;
      tab.addEventListener("click", () => { state.activePeriod = i; renderAll(); });
      el.periodTabs.appendChild(tab);
    }
    const activeTab = el.periodTabs.querySelector(".period-tab.active");
    if (activeTab) activeTab.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  // ---------- 渲染：九宫格（支持多任务自适应） ----------
  function renderMandala() {
    const period = state.activePeriod;
    const range = getPeriodRange(period);
    el.mandalaTitle.textContent =
      `${PERIOD_NAMES[period]} · ${secondsToHHMM(range.start)} - ${secondsToHHMM(range.end)}`;
    // 渲染过去时辰快览导航
    renderPeriodNav(el.planPeriodNav);

    const currentGlobalCell = getCurrentGlobalCell();
    el.mandalaGrid.innerHTML = "";
    el.mandalaGrid.dataset.glyph = PERIOD_GLYPHS[period]; // 地支水印（CSS ::before）
    attachMandalaGestures();

    for (let cell = 0; cell < CELLS_PER_PERIOD; cell++) {
      const cellRange = getCellRange(period, cell);
      const tasks = getCellTasks(period, cell);
      const isDone = getCellDone(period, cell);
      const globalCellIndex = period * CELLS_PER_PERIOD + cell;

      const cellEl = document.createElement("div");
      cellEl.className = "cell";
      cellEl.dataset.cell = cell;
      cellEl.dataset.period = period;
      if (tasks.length) cellEl.classList.add("has-task");
      if (tasks.length > 1) cellEl.classList.add("multi");
      if (isDone) cellEl.classList.add("done");
      if (globalCellIndex === currentGlobalCell && isToday(state.currentDate)) cellEl.classList.add("current-cell");
      // 优先级颜色（取第一个任务的优先级代表本格）
      if (tasks.length) cellEl.classList.add("priority-" + (tasks[0].priority || "medium"));
      // 批量选择模式
      if (state.batchMode) {
        cellEl.classList.add("selectable");
        if (state.batchSelected.has(cellKey(period, cell))) cellEl.classList.add("selected-cell");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "cell-select-checkbox";
        cb.checked = state.batchSelected.has(cellKey(period, cell));
        cb.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleBatchSelect(period, cell);
        });
        cellEl.appendChild(cb);
      }

      const timeEl = document.createElement("div");
      timeEl.className = "cell-time";
      timeEl.textContent = `${secondsToHHMM(cellRange.start)} - ${secondsToHHMM(cellRange.end)}`;

      // 多任务列表（全部展示，格子内滚动）
      const contentEl = document.createElement("div");
      if (tasks.length) {
        contentEl.className = "cell-content-list";
        tasks.forEach((t, idx) => {
          const item = document.createElement("div");
          item.className = "cell-content-item task-bar" + (t.done ? " task-done" : "");
          item.dataset.idx = idx;
          item.draggable = true;

          // 复选框
          const cb = document.createElement("span");
          cb.className = "task-checkbox" + (t.done ? " checked" : "");
          cb.innerHTML = t.done ? "✓" : "";
          cb.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleTaskDone(period, cell, idx);
          });
          item.appendChild(cb);

          // 优先级竖条
          const bar = document.createElement("span");
          bar.className = "task-priority-bar " + (t.priority || "medium");
          item.appendChild(bar);

          // 任务文本
          const span = document.createElement("span");
          span.className = "task-text";
          span.textContent = taskText(t);
          item.appendChild(span);

          // 拖拽单条任务
          item.addEventListener("dragstart", (e) => {
            e.stopPropagation();
            draggingTaskSource = { period, cell, idx };
            item.classList.add("dragging-item");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(idx));
          });
          item.addEventListener("dragend", () => {
            item.classList.remove("dragging-item");
            draggingTaskSource = null;
          });

          contentEl.appendChild(item);
        });
        // 属性 meta 行
        const first = tasks[0];
        const metaParts = [];
        if (first.tag) metaParts.push(`<span class="cell-tag">${escapeHtml(first.tag)}</span>`);
        const metaBits = [];
        if (first.estimate) metaBits.push("⏱ " + escapeHtml(first.estimate));
        if (first.deadline) metaBits.push("⏰ " + escapeHtml(first.deadline.slice(5, 16).replace("T", " ")));
        if (metaBits.length || metaParts.length) {
          const meta = document.createElement("div");
          meta.className = "cell-meta-line";
          meta.innerHTML = metaParts.join("") + (metaBits.length ? `<span>${metaBits.join(" ")}</span>` : "");
          contentEl.appendChild(meta);
        }
        // 任务数标记
        if (tasks.length > 1) {
          const count = document.createElement("div");
          count.className = "cell-count";
          count.textContent = tasks.length;
          cellEl.appendChild(count);
        }
      } else {
        contentEl.className = "cell-content cell-empty";
        contentEl.textContent = "—";
      }

      const mark = document.createElement("div");
      mark.className = "cell-done-mark";
      mark.textContent = "✓";

      // 子任务清单进度徽章
      const prog = checklistProgress(period, cell);
      if (prog) {
        const badge = document.createElement("div");
        badge.className = "cell-checklist-badge" + (prog.done === prog.total ? " all-done" : "");
        badge.textContent = `☑ ${prog.done}/${prog.total}`;
        badge.title = "点击切换清单项完成状态";
        badge.addEventListener("click", (e) => {
          e.stopPropagation();
          openChecklistPopover(period, cell, badge);
        });
        cellEl.appendChild(badge);
      }

      // 重复规则徽章
      const rpt = getRepeatRuleForCell(state.currentDate, period, cell);
      if (rpt) {
        const rptBadge = document.createElement("div");
        rptBadge.className = "cell-repeat-badge";
        const label = { daily: "每天", weekdays: "工作日", weekly: "每周", weekend: "周末" }[rpt.rule] || rpt.rule;
        rptBadge.textContent = `🔁 ${label}`;
        rptBadge.title = `重复：${label}${rpt.maxCount > 0 ? `（${rpt.maxCount}次）` : "（持续）"} - 编辑任务可修改`;
        cellEl.appendChild(rptBadge);
      }

      cellEl.appendChild(timeEl);
      cellEl.appendChild(contentEl);
      cellEl.appendChild(mark);

      // 单击编辑，双击快速完成（带涟漪反馈）
      let clickTimer = null;
      cellEl.addEventListener("click", (ev) => {
        spawnRipple(cellEl, ev);
        if (clickTimer) {
          clearTimeout(clickTimer); clickTimer = null;
          if (tasks.length) toggleDone(period, cell);
        } else {
          clickTimer = setTimeout(() => {
            clickTimer = null;
            openTaskDialog(period, cell);
          }, 250);
        }
      });

      // 长按切换完成
      let pressTimer = null;
      cellEl.addEventListener("touchstart", () => {
        pressTimer = setTimeout(() => { toggleDone(period, cell); pressTimer = null; }, 500);
      });
      cellEl.addEventListener("touchend", () => { if (pressTimer) clearTimeout(pressTimer); });
      cellEl.addEventListener("touchmove", () => { if (pressTimer) clearTimeout(pressTimer); });
      cellEl.addEventListener("contextmenu", (e) => { e.preventDefault(); toggleDone(period, cell); });

      // 拖拽：所有格子都要绑定 drop 监听器，否则空格子接收不到拖入的任务
      attachDragHandlers(cellEl, period, cell);

      el.mandalaGrid.appendChild(cellEl);
    }
  }

  // ---------- 曼陀罗区域手势：左右滑动切换时辰 ----------
  let gestureBound = false;
  function attachMandalaGestures() {
    if (gestureBound) return;
    gestureBound = true;
    let startX = 0, startY = 0, startT = 0, tracking = false;
    const grid = el.mandalaGrid;
    grid.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
      tracking = true;
    }, { passive: true });
    grid.addEventListener("touchend", (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      const dt = Date.now() - startT;
      // 水平滑动为主、距离够、时间短 → 切换时辰
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 600) {
        if (dx < 0) el.nextPeriod.click();   // 左滑 → 下一时辰
        else el.prevPeriod.click();           // 右滑 → 上一时辰
      }
    }, { passive: true });
  }

  function toggleDone(period, cell) {
    const tasks = getCellTasks(period, cell);
    if (!tasks.length) { toast("该格无任务", "error"); return; }
    if (getCellDone(period, cell)) {
      setCellDone(period, cell, false);
      toast("已取消完成", "info");
    } else {
      setCellDone(period, cell, true);
      toast("已完成 ✓", "success");
      playDoneSound();
    }
    renderAll();
  }

  // 单条任务打钩/取消
  function toggleTaskDone(period, cell, idx) {
    const tasks = getCellTasks(period, cell).slice();
    if (idx < 0 || idx >= tasks.length) return;
    tasks[idx].done = !tasks[idx].done;
    setCellTasks(period, cell, tasks);

    // 如果勾选了完成，检查是否所有任务都完成 → 自动标记格子完成
    const allDone = tasks.every((t) => t.done);
    if (allDone && tasks.length > 0) {
      setCellDone(period, cell, true);
      playDoneSound();
    } else {
      setCellDone(period, cell, false);
    }

    // 如果取消勾选，检查未完成任务是否需要继承到下一格子
    if (!tasks[idx].done) {
      // 取消勾选，无需继承
    }
    renderAll();
  }

  // 未完成任务自动继承到下一格子
  function autoCarryForward() {
    const period = state.activePeriod;
    // 遍历当前时辰的所有格子（跳过最后一格）
    for (let cell = 0; cell < CELLS_PER_PERIOD - 1; cell++) {
      const tasks = getCellTasks(period, cell).slice();
      if (!tasks.length) continue;
      const isCellDone = getCellDone(period, cell);
      if (isCellDone) continue; // 整格已完成，不继承

      // 找出未完成的任务
      const undone = tasks.filter((t) => !t.done);
      if (!undone.length) continue;

      // 检查当前时间是否已过该格子
      const cellRange = getCellRange(period, cell);
      if (nowSeconds() < cellRange.end) continue; // 还没到格子结束时间

      // 继承到下一格子
      const nextCell = cell + 1;
      const nextTasks = getCellTasks(period, nextCell).slice();
      const toCarry = undone.map((t) => ({ ...t, done: false }));
      nextTasks.push(...toCarry);
      setCellTasks(period, nextCell, nextTasks);

      // 从源格子移除未完成的任务
      const remaining = tasks.filter((t) => t.done);
      setCellTasks(period, cell, remaining);
      if (remaining.length === 0) {
        setCellDone(period, cell, true);
      }
      toast(`自动继承 ${toCarry.length} 个未完成任务到下一格`, "info");
    }
    renderAll();
  }

  // ---------- 渲染：概览 ----------
  function renderOverview() {
    const currentPeriod = getCurrentPeriod();
    el.overviewGrid.innerHTML = "";
    for (let p = 0; p < PERIOD_COUNT; p++) {
      const range = getPeriodRange(p);
      const item = document.createElement("div");
      item.className = "overview-item";
      if (p === state.activePeriod) item.classList.add("active");
      if (p === currentPeriod && isToday(state.currentDate)) item.classList.add("current");

      const header = document.createElement("div");
      header.className = "overview-header";
      header.textContent = secondsToHHMM(range.start);

      const miniGrid = document.createElement("div");
      miniGrid.className = "overview-mini-grid";
      for (let c = 0; c < CELLS_PER_PERIOD; c++) {
        const miniCell = document.createElement("div");
        miniCell.className = "overview-mini-cell";
        if (getCellTasks(p, c).length) {
          miniCell.classList.add("filled");
          if (getCellDone(p, c)) miniCell.classList.add("done");
        }
        miniGrid.appendChild(miniCell);
      }

      item.appendChild(header);
      item.appendChild(miniGrid);
      item.addEventListener("click", () => {
        state.activePeriod = p; renderAll();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      el.overviewGrid.appendChild(item);
    }
  }

  // ---------- 渲染：时钟 ----------
  function renderClock() {
    const now = new Date();
    el.clock.textContent =
      `${String(now.getHours()).padStart(2, "0")}:` +
      `${String(now.getMinutes()).padStart(2, "0")}:` +
      `${String(now.getSeconds()).padStart(2, "0")}`;

    if (!isToday(state.currentDate)) {
      el.currentInfo.textContent = "查看其他日期";
      return;
    }
    const currentPeriod = getCurrentPeriod();
    const currentGlobalCell = getCurrentGlobalCell();
    if (currentPeriod < 0) {
      el.currentInfo.textContent = nowSeconds() < START_SECONDS ? "尚未开始（5:00 启动）" : "今日已结束";
    } else {
      const cellInPeriod = currentGlobalCell - currentPeriod * CELLS_PER_PERIOD;
      el.currentInfo.textContent = `第 ${currentPeriod + 1} 时辰 · 第 ${cellInPeriod + 1} 格`;
    }
  }

  function renderAll() {
    updateDateLabel();
    renderLongtaskBar();
    renderPeriodTabs();
    renderMandala();
    renderRecord();
    renderReview();
    renderOverview();
    renderClock();
    renderChatBadges();
    renderQuickToggle();
    updateAiReviewBtn();
    updateChatPlaceholder();
    updateStageProgressColor();
  }

  // 根据是否配置 API 更新复盘按钮文字
  function updateAiReviewBtn() {
    if (!el.aiReviewBtn) return;
    const hasApi = state.settings.apiUrl && state.settings.apiKey;
    el.aiReviewBtn.textContent = hasApi ? "🤖 AI 智能复盘" : "📝 生成本地复盘";
    el.aiReviewBtn.title = hasApi ? "调用 AI 结合计划与记录生成复盘" : "未配置 API，将使用本地逻辑生成复盘";
  }

  // ============================================================
  // 天地人三才翻页系统
  // ============================================================

  // 切换 realm（带翻页方向，平滑过渡）
  function setRealm(realm, reverse) {
    if (!["plan", "record", "review"].includes(realm)) return;
    if (state.realm === realm) return;
    const oldRealm = state.realm;
    state.realm = realm;
    // 进入/离开复盘 realm 时重置复盘对话阶段
    if (realm === "review") {
      state.reviewChatStage = state.reviewChatStage || "entry";
    }

    // 简化切换：直接更新容器属性，CSS 处理过渡
    if (el.realmContainer) {
      const oldPage = el.realmContainer.querySelector(`.realm-page[data-realm="${oldRealm}"]`);
      if (oldPage) oldPage.classList.add("leaving");
      el.realmContainer.dataset.realm = realm;
      // 短延迟后移除 leaving 类
      setTimeout(() => {
        if (oldPage) oldPage.classList.remove("leaving");
      }, 200);
    }

    if (el.realmSwitcher) {
      el.realmSwitcher.dataset.active = realm;
      el.realmSwitcher.querySelectorAll(".realm-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.realm === realm);
      });
    }
    if (el.realmFab) {
      el.realmFab.dataset.active = realm;
      el.realmFab.querySelectorAll(".realm-fab-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.realm === realm);
      });
    }
    // 切到记录/复盘时同步重新渲染当前时辰内容
    if (realm === "record") renderRecord();
    if (realm === "review") renderReview();
    updateChatPlaceholder();
    updateStageProgressColor();
  }

  // 三才切换时联动环节进度条颜色
  function updateStageProgressColor() {
    const stageProgress = document.getElementById("stageProgress");
    if (!stageProgress) return;
    const colorMap = {
      plan: { color: "#7c5cff", light: "#9d85ff", glow: "rgba(124, 92, 255, 0.4)" },
      record: { color: "#ef4444", light: "#f87171", glow: "rgba(239, 68, 68, 0.4)" },
      review: { color: "#3b82f6", light: "#60a5fa", glow: "rgba(59, 130, 246, 0.4)" },
    };
    const c = colorMap[state.realm] || colorMap.plan;
    stageProgress.style.setProperty("--stage-color", c.color);
    stageProgress.style.setProperty("--stage-color-light", c.light);
    stageProgress.style.setProperty("--stage-glow", c.glow);
  }

  // 根据当前 realm 动态更新 AI 对话输入框提示
  function updateChatPlaceholder() {
    if (!el.chatInput) return;
    const placeholders = {
      plan: "描述你的任务，例如：今天要写报告、健身1小时、读30分钟书…",
      record: "针对某条记录追问 AI，或描述你刚刚做的事…（点击记录格的「AI 追问」可直接带上下文）",
      review: "输入「复盘」生成今日复盘，或针对复盘内容继续追问…",
    };
    el.chatInput.placeholder = placeholders[state.realm] || placeholders.plan;
  }

  // 记录页：获取/保存单格记录
  function getCellRecord(period, cell) {
    const d = state.records[state.currentDate] || {};
    return d[period + "-" + cell] || null;
  }
  function setCellRecord(period, cell, rec) {
    if (!state.records[state.currentDate]) state.records[state.currentDate] = {};
    const key = period + "-" + cell;
    if (rec && (rec.actual || rec.spent || rec.note)) {
      state.records[state.currentDate][key] = rec;
    } else {
      delete state.records[state.currentDate][key];
    }
    save(RECORD_KEY, state.records);
  }

  // 渲染记录页
  function renderRecord() {
    if (!el.recordGrid) return;
    const period = state.activePeriod;
    const range = getPeriodRange(period);
    el.recordTitle.textContent =
      `${PERIOD_NAMES[period]} · ${secondsToHHMM(range.start)} - ${secondsToHHMM(range.end)} · 记录`;
    // 渲染过去时辰快览导航
    renderPeriodNav(el.recordPeriodNav);

    const currentGlobalCell = getCurrentGlobalCell();
    el.recordGrid.innerHTML = "";
    el.recordGrid.dataset.glyph = PERIOD_GLYPHS[period]; // 地支水印

    let recordedInPeriod = 0;
    let planInPeriod = 0;

    for (let cell = 0; cell < CELLS_PER_PERIOD; cell++) {
      const cellRange = getCellRange(period, cell);
      const record = getCellRecord(period, cell);
      const planTasks = getCellTasks(period, cell);
      const planDone = getCellDone(period, cell);
      const globalCellIndex = period * CELLS_PER_PERIOD + cell;
      if (record && (record.actual || record.spent)) recordedInPeriod++;
      if (planTasks.length) planInPeriod++;

      const cellEl = document.createElement("div");
      cellEl.className = "cell";
      cellEl.dataset.cell = cell;
      cellEl.dataset.period = period;
      if (record && (record.actual || record.spent)) cellEl.classList.add("has-record");
      if (globalCellIndex === currentGlobalCell && isToday(state.currentDate)) cellEl.classList.add("current-cell");
      // 对照徽章：有计划且完成记录→✓；有计划无记录→△
      if (planTasks.length && record && record.actual) cellEl.classList.add("compare-match");
      else if (planTasks.length && !record) cellEl.classList.add("compare-miss");
      // 标记已完成的计划
      if (planDone) cellEl.classList.add("done");

      const timeEl = document.createElement("div");
      timeEl.className = "cell-time";
      timeEl.textContent = `${secondsToHHMM(cellRange.start)} - ${secondsToHHMM(cellRange.end)}`;
      cellEl.appendChild(timeEl);

      // 计划任务预览（条状显示）
      if (planTasks.length) {
        const planList = document.createElement("div");
        planList.className = "cell-content-list";
        planTasks.forEach((t) => {
          const item = document.createElement("div");
          item.className = "cell-content-item task-bar" + (t.done ? " task-done" : "");
          const cb = document.createElement("span");
          cb.className = "task-checkbox" + (t.done ? " checked" : "");
          cb.innerHTML = t.done ? "✓" : "";
          const bar = document.createElement("span");
          bar.className = "task-priority-bar " + (t.priority || "medium");
          const span = document.createElement("span");
          span.className = "task-text";
          span.textContent = taskText(t);
          item.appendChild(cb);
          item.appendChild(bar);
          item.appendChild(span);
          planList.appendChild(item);
        });
        cellEl.appendChild(planList);
      }

      const contentEl = document.createElement("div");
      contentEl.className = "cell-content";
      if (record && (record.actual || record.spent)) {
        if (record.spent) {
          const spent = document.createElement("div");
          spent.className = "record-spent";
          spent.innerHTML = `⏱ ${escapeHtml(record.spent)}`;
          contentEl.appendChild(spent);
        }
        if (record.actual) {
          const actual = document.createElement("div");
          actual.className = "record-actual";
          actual.textContent = record.actual;
          contentEl.appendChild(actual);
        }
        if (record.note) {
          const note = document.createElement("div");
          note.className = "record-note";
          note.style.cssText = "font-size:11px;color:var(--text-muted);margin-top:4px;font-style:italic;";
          note.textContent = "📝 " + record.note;
          contentEl.appendChild(note);
        }
      } else if (!planTasks.length) {
        const empty = document.createElement("div");
        empty.className = "record-empty";
        empty.textContent = "点击记录";
        contentEl.appendChild(empty);
      }
      cellEl.appendChild(contentEl);

      // 点击编辑记录
      cellEl.addEventListener("click", () => openRecordEditor(period, cell));
      cellEl.addEventListener("dblclick", () => {
        // 双击直接快速记录"完成"，与计划同步
        if (planTasks.length && !record) {
          setCellRecord(period, cell, {
            spent: "~" + Math.round((SECONDS_PER_CELL / 60)) + "分钟",
            actual: planTasks.map((t) => taskText(t)).join("; "),
            note: ""
          });
          renderRecord();
          toast("已记录完成", "success");
        }
      });
      el.recordGrid.appendChild(cellEl);
    }

    // 更新本时辰统计
    if (el.recordStatsInline) {
      el.recordStatsInline.textContent = `本时辰 ${recordedInPeriod}/9 格已记录 · 计划 ${planInPeriod} 格`;
    }
  }

  // 记录编辑弹层（轻量内联表单）
  function openRecordEditor(period, cell) {
    const existing = getCellRecord(period, cell) || { spent: "", actual: "", note: "" };
    const cellRange = getCellRange(period, cell);
    const planTasks = getCellTasks(period, cell);

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.cssText = "position:fixed;inset:0;background:var(--overlay);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;";
    const dialog = document.createElement("div");
    dialog.style.cssText = "background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;max-width:420px;width:100%;max-height:90vh;overflow:auto;";
    const planHint = planTasks.length
      ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;padding:8px;background:var(--bg-tertiary);border-radius:6px;">📋 计划: ${escapeHtml(planTasks.map((t) => taskText(t)).join("; "))}</div>`
      : "";
    dialog.innerHTML = `
      <h3 style="font-size:15px;margin-bottom:10px;color:#f87171;">📝 记录实际执行</h3>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">
        ${secondsToHHMM(cellRange.start)} - ${secondsToHHMM(cellRange.end)}
      </div>
      ${planHint}
      <div style="margin-bottom:10px;">
        <label style="font-size:12px;color:var(--text-secondary);">实际花费时间 <span style="font-size:10px;color:var(--text-muted);">(Enter 保存)</span></label>
        <input type="text" id="recSpent" value="${escapeHtml(existing.spent || "")}" placeholder="如 30分钟 / 1小时" style="width:100%;padding:8px;margin-top:4px;border-radius:6px;border:1px solid var(--border);" />
      </div>
      <div style="margin-bottom:10px;">
        <label style="font-size:12px;color:var(--text-secondary);">实际做了什么 <span style="font-size:10px;color:var(--text-muted);">(Ctrl+Enter 保存)</span></label>
        <textarea id="recActual" rows="3" placeholder="描述实际发生的事…" style="width:100%;padding:8px;margin-top:4px;border-radius:6px;border:1px solid var(--border);resize:vertical;">${escapeHtml(existing.actual || "")}</textarea>
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-size:12px;color:var(--text-secondary);">备注（可选）</label>
        <input type="text" id="recNote" value="${escapeHtml(existing.note || "")}" placeholder="感受/卡点/收获" style="width:100%;padding:8px;margin-top:4px;border-radius:6px;border:1px solid var(--border);" />
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
        <button id="recAskAi" style="padding:8px 14px;border-radius:6px;background:rgba(124,92,255,0.15);color:#9d85ff;font-size:12px;border:1px solid rgba(124,92,255,0.3);">🤖 AI 追问</button>
        <button id="recDel" style="padding:8px 14px;border-radius:6px;background:var(--bg-tertiary);color:var(--danger);font-size:12px;">删除</button>
        <button id="recCancel" style="padding:8px 14px;border-radius:6px;background:var(--bg-tertiary);color:var(--text-secondary);font-size:12px;">取消 <span style="font-size:10px;opacity:0.6;">(Esc)</span></button>
        <button id="recSave" style="padding:8px 16px;border-radius:6px;background:linear-gradient(135deg,#ef4444,#f87171);color:#fff;font-weight:600;font-size:12px;">保存</button>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const save = () => {
      const rec = {
        spent: dialog.querySelector("#recSpent").value.trim(),
        actual: dialog.querySelector("#recActual").value.trim(),
        note: dialog.querySelector("#recNote").value.trim(),
      };
      setCellRecord(period, cell, rec);
      renderRecord();
      toast("记录已保存", "success");
      overlay.remove();
    };
    const close = () => overlay.remove();
    dialog.querySelector("#recCancel").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    dialog.querySelector("#recDel").addEventListener("click", () => {
      setCellRecord(period, cell, null);
      renderRecord();
      toast("已删除记录", "info");
      close();
    });
    dialog.querySelector("#recSave").addEventListener("click", save);

    // 键盘快捷键：Esc 关闭，Enter 保存
    dialog.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "Enter" && !e.shiftKey && e.target.id !== "recActual") {
        e.preventDefault(); save(); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (e.target.id === "recActual") { e.preventDefault(); save(); return; }
      }
    });

    // AI 追问：基于该格计划+记录发起对话（增强上下文：带当前时辰前后3格）
    dialog.querySelector("#recAskAi").addEventListener("click", () => {
      const rec = {
        spent: dialog.querySelector("#recSpent").value.trim(),
        actual: dialog.querySelector("#recActual").value.trim(),
        note: dialog.querySelector("#recNote").value.trim(),
      };
      if (rec.actual || rec.spent) setCellRecord(period, cell, rec);
      close();
      setRealm("plan");
      const range = getCellRange(period, cell);
      const time = `${secondsToHHMM(range.start)}-${secondsToHHMM(range.end)}`;
      const planText = planTasks.length ? planTasks.map((t) => taskText(t)).join("; ") : "（无计划）";
      const recText = `实际:${rec.actual || "（无）"} 花费:${rec.spent || "（无）"}${rec.note ? " 备注:" + rec.note : ""}`;
      // 收集当前时辰前后3格数据作为上下文
      const nearby = [];
      for (let c = Math.max(0, cell - 3); c <= Math.min(CELLS_PER_PERIOD - 1, cell + 3); c++) {
        if (c === cell) continue;
        const n = getCellRecord(period, c);
        const p = getCellTasks(period, c);
        if (n || p.length) {
          const r = getCellRange(period, c);
          nearby.push(`[格${c} ${secondsToHHMM(r.start)}-${secondsToHHMM(r.end)}] 计划:${p.map((t) => taskText(t)).join(";") || "无"} 记录:${n ? n.actual || "无" : "无"}`);
        }
      }
      const nearbyText = nearby.length ? "\n邻近时段:\n" + nearby.join("\n") : "";
      const prompt = `针对第${period + 1}时辰 [${time}] 格${cell}的执行情况进行追问分析：\n计划：${planText}\n记录：${recText}${nearbyText}\n请帮我分析执行偏差原因、是否需要调整后续安排，或给出优化建议。`;
      fillInput(prompt);
      toast("已填入 AI 对话框（含邻近时段上下文），点击发送即可追问", "info");
      const chatSection = document.querySelector(".chat-section");
      if (chatSection) chatSection.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => { if (el.chatInput) el.chatInput.focus(); }, 400);
    });
    setTimeout(() => dialog.querySelector("#recSpent").focus(), 50);
  }

  // ---------- 复盘页 ----------
  function getDayReview(date) {
    return state.reviews[date] || null;
  }
  function setDayReview(date, data) {
    state.reviews[date] = data;
    save(REVIEW_KEY, state.reviews);
  }
  function clearDayReview(date) {
    delete state.reviews[date];
    save(REVIEW_KEY, state.reviews);
  }

  // 时辰总汇总
  function renderReviewSummary() {
    if (!el.reviewSummary) return;
    const dayTasks = getDayTasks(state.currentDate);
    const dayDone = getDayDone(state.currentDate);
    let filled = 0, doneCount = 0, totalTasks = 0, undoneTasks = 0;
    Object.keys(dayTasks).forEach((k) => {
      if (dayTasks[k].length) {
        filled++;
        totalTasks += dayTasks[k].length;
        if (dayDone[k]) doneCount++;
        dayTasks[k].forEach((t) => { if (!t.done) undoneTasks++; });
      }
    });
    const doneRate = filled ? Math.round((doneCount / filled) * 100) : 0;
    el.reviewSummary.innerHTML = `
      <div class="summary-card">
        <div class="summary-num">${totalTasks}</div>
        <div class="summary-label">总任务</div>
      </div>
      <div class="summary-card success">
        <div class="summary-num">${doneCount}</div>
        <div class="summary-label">已完成格</div>
      </div>
      <div class="summary-card warning">
        <div class="summary-num">${undoneTasks}</div>
        <div class="summary-label">未完成任务</div>
      </div>
      <div class="summary-card ${doneRate >= 80 ? 'success' : doneRate >= 50 ? 'warning' : 'danger'}">
        <div class="summary-num">${doneRate}%</div>
        <div class="summary-label">完成率</div>
      </div>`;
  }

  // 过去时辰快览导航（计划/记录/复盘页通用）
  function renderPeriodNav(targetEl) {
    if (!targetEl) return;
    const curPeriod = getCurrentPeriod();
    const isTodayDate = isToday(state.currentDate);
    const currentRealm = state.realm;
    targetEl.innerHTML = "";
    for (let p = 0; p < PERIOD_COUNT; p++) {
      const range = getPeriodRange(p);
      let pFilled = 0, pDone = 0, pUndone = 0;
      for (let c = 0; c < CELLS_PER_PERIOD; c++) {
        const tasks = getCellTasks(p, c);
        if (tasks.length) {
          pFilled++;
          if (getCellDone(p, c)) pDone++;
          tasks.forEach((t) => { if (!t.done) pUndone++; });
        }
      }
      const isPast = isTodayDate && (curPeriod >= 0 && p < curPeriod);
      const isCurrent = isTodayDate && p === curPeriod;
      const hasUndone = isPast && pUndone > 0;
      const item = document.createElement("div");
      item.className = "period-nav-item" +
        (isPast ? " past" : "") +
        (isCurrent ? " current" : "") +
        (hasUndone ? " has-undone" : "");
      item.innerHTML = `
        <div class="pni-time">${secondsToHHMM(range.start)}</div>
        <div class="pni-stats ${pDone === pFilled && pFilled > 0 ? 'done' : ''}">${pDone}/${pFilled}</div>`;
      item.title = `第 ${p + 1} 时辰 · ${secondsToHHMM(range.start)}-${secondsToHHMM(range.end)}\n计划 ${pFilled} 格，完成 ${pDone} 格${hasUndone ? `\n⚠ ${pUndone} 个未完成任务` : ''}`;
      item.addEventListener("click", () => {
        state.activePeriod = p;
        // 在计划页点击过去的时辰 → 跳转到记录页
        // 在记录/复盘页点击 → 留在当前页
        if (currentRealm === "plan" && isPast) {
          setRealm("record");
        }
        renderAll();
        toast(`已跳转到第 ${p + 1} 时辰${currentRealm === "plan" && isPast ? " · 记录页" : ""}`, "info");
      });
      targetEl.appendChild(item);
    }
  }

  // 渲染复盘页
  function renderReview() {
    if (!el.reviewBody) return;
    renderReviewSummary();
    renderPeriodNav(el.reviewPeriodNav);
    const review = getDayReview(state.currentDate);
    if (!review) {
      el.reviewBody.innerHTML = `<div class="review-empty">尚无复盘内容。点击「AI 智能复盘」结合计划与记录生成总结</div>`;
      return;
    }

    // 统计卡片
    const stats = review.stats || computeReviewStats();
    // 时辰热力图：9 时辰每格的记录数
    const heatmapHtml = renderReviewHeatmap();
    const statsHtml = `
      <div class="review-stats">
        <div class="review-stat-card">
          <div class="review-stat-value">${stats.plannedCells}</div>
          <div class="review-stat-label">计划格数</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value">${stats.recordedCells}</div>
          <div class="review-stat-label">已记录</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value">${stats.doneCount}</div>
          <div class="review-stat-label">已完成</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value">${stats.matchRate}%</div>
          <div class="review-stat-label">吻合率</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value">${stats.completionRate || 0}%</div>
          <div class="review-stat-label">完成率</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value" style="font-size:16px;">${stats.totalSpentText || "0分钟"}</div>
          <div class="review-stat-label">总花费</div>
        </div>
      </div>
      ${heatmapHtml}
    `;

    // 各区块
    let sectionsHtml = "";
    if (review.summary) {
      sectionsHtml += `
        <div class="review-section">
          <div class="review-section-title">📖 整体总结</div>
          <div class="review-section-body">${escapeHtml(review.summary)}</div>
        </div>
      `;
    }
    if (Array.isArray(review.insights) && review.insights.length) {
      sectionsHtml += `
        <div class="review-section">
          <div class="review-section-title">💡 洞察与发现</div>
          <div class="review-section-body"><ul>${review.insights.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></div>
        </div>
      `;
    }
    if (Array.isArray(review.suggestions) && review.suggestions.length) {
      sectionsHtml += `
        <div class="review-section">
          <div class="review-section-title">🎯 改进建议</div>
          <div class="review-section-body"><ul>${review.suggestions.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></div>
        </div>
      `;
    }
    if (Array.isArray(review.highlights) && review.highlights.length) {
      sectionsHtml += `
        <div class="review-section">
          <div class="review-section-title">✨ 亮点</div>
          <div class="review-section-body"><ul>${review.highlights.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></div>
        </div>
      `;
    }
    // 明日建议安排
    if (review.tomorrowPlan) {
      const tp = review.tomorrowPlan;
      const itemsHtml = (tp.items && tp.items.length)
        ? `<div class="tomorrow-items">${tp.items.map((it) => `
            <div class="tomorrow-item">
              <span class="tomorrow-time">${escapeHtml(it.time || "")}</span>
              <span class="tomorrow-content">${escapeHtml(it.content || "")}</span>
            </div>`).join("")}
          </div>`
        : `<div style="font-size:12px;color:var(--text-muted);">无具体任务项</div>`;
      sectionsHtml += `
        <div class="review-section tomorrow-section">
          <div class="review-section-title">🌅 明日建议安排</div>
          <div class="review-section-body">
            ${itemsHtml}
            ${tp.tip ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;padding:8px;background:rgba(59,130,246,0.08);border-radius:6px;">💡 ${escapeHtml(tp.tip)}</div>` : ""}
            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
              <button class="tool-btn tomorrow-apply-btn" id="tomorrowApplyBtn" style="background:linear-gradient(135deg,#7c5cff,#9d85ff);color:#fff;border:none;padding:6px 14px;">📅 应用到明日计划</button>
              <button class="tool-btn tomorrow-copy-btn" id="tomorrowCopyBtn" style="background:var(--bg-hover);color:var(--text-secondary);padding:6px 14px;">📋 复制到 AI 对话</button>
            </div>
          </div>
        </div>
      `;
    }

    // 手动备注区
    const userNotes = review.userNotes || "";
    const notesHtml = `
      <div class="review-section">
        <div class="review-section-title">✍️ 我的反思</div>
        <textarea class="review-notes" id="reviewUserNotes" placeholder="写下你的反思、下次可改进的点…">${escapeHtml(userNotes)}</textarea>
      </div>
    `;

    const aiInfo = review.aiGeneratedAt
      ? `<div style="font-size:11px;color:var(--text-muted);margin-top:12px;text-align:right;">🤖 AI 生成于 ${escapeHtml(review.aiGeneratedAt)}</div>`
      : "";

    el.reviewBody.innerHTML = statsHtml + sectionsHtml + notesHtml + aiInfo;

    // 监听备注输入（防抖保存）
    const notesEl = el.reviewBody.querySelector("#reviewUserNotes");
    if (notesEl) {
      let t;
      notesEl.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => {
          review.userNotes = notesEl.value;
          setDayReview(state.currentDate, review);
        }, 600);
      });
    }
    // 明日建议 → 应用到明日计划
    const applyBtn = el.reviewBody.querySelector("#tomorrowApplyBtn");
    if (applyBtn) applyBtn.addEventListener("click", () => {
      const tp = review.tomorrowPlan;
      if (!tp || !tp.items || !tp.items.length) {
        toast("无明日建议项可应用", "info");
        return;
      }
      // 计算明日日期
      const tomorrow = new Date(state.currentDate + "T00:00:00");
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);
      if (!confirm(`将 ${tp.items.length} 项明日建议应用到 ${tomorrowStr} 的计划？\n（会自动匹配时辰格子，无匹配时间则放到下一空格）`)) return;
      let applied = 0;
      tp.items.forEach((it) => {
        // 尝试根据时间匹配时辰和格子
        const startMatch = (it.time || "").match(/^(\d{1,2}):(\d{2})/);
        let period = -1, cell = -1;
        if (startMatch) {
          const totalMin = parseInt(startMatch[1]) * 60 + parseInt(startMatch[2]);
          const matchInfo = findCellByTime(totalMin * 60);
          if (matchInfo) { period = matchInfo.period; cell = matchInfo.cell; }
        }
        // 没匹配上则找下一空格
        if (period < 0 || cell < 0) {
          const empty = findNextEmptyCell(tomorrowStr);
          if (empty) { period = empty.period; cell = empty.cell; }
        }
        if (period >= 0 && cell >= 0 && it.content) {
          addCellTaskAt(tomorrowStr, period, cell, it.content);
          applied++;
        }
      });
      toast(`已应用 ${applied} 项到 ${tomorrowStr}，可切换日期查看`, "success");
    });
    // 明日建议 → 复制到 AI 对话
    const copyBtn = el.reviewBody.querySelector("#tomorrowCopyBtn");
    if (copyBtn) copyBtn.addEventListener("click", () => {
      const tp = review.tomorrowPlan;
      if (!tp) return;
      const lines = (tp.items || []).map((it) => `[${it.time || ""}] ${it.content || ""}`);
      const prompt = `基于今日复盘的明日建议安排：\n${lines.join("\n")}\n${tp.tip || ""}\n请帮我优化这些任务的时辰安排，并补充可能遗漏的事项。`;
      setRealm("plan");
      fillInput(prompt);
      toast("已复制到 AI 对话框", "info");
      const chatSection = document.querySelector(".chat-section");
      if (chatSection) chatSection.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => { if (el.chatInput) el.chatInput.focus(); }, 400);
    });
    // 绑定热力图点击
    bindHeatmapClicks();
  }

  // 根据秒数找对应时辰和格子
  function findCellByTime(sec) {
    for (let p = 0; p < PERIOD_COUNT; p++) {
      for (let c = 0; c < CELLS_PER_PERIOD; c++) {
        const range = getCellRange(p, c);
        if (sec >= range.start && sec < range.end) return { period: p, cell: c };
      }
    }
    return null;
  }
  // 找指定日期的下一空格
  function findNextEmptyCell(date) {
    for (let p = 0; p < PERIOD_COUNT; p++) {
      for (let c = 0; c < CELLS_PER_PERIOD; c++) {
        const tasks = (state.tasks[date] || {})[p + "-" + c] || [];
        if (!tasks.length) return { period: p, cell: c };
      }
    }
    return null;
  }
  // 指定日期添加格子任务
  function addCellTaskAt(date, period, cell, content) {
    if (!state.tasks[date]) state.tasks[date] = {};
    if (!state.tasks[date][period + "-" + cell]) state.tasks[date][period + "-" + cell] = [];
    state.tasks[date][period + "-" + cell].push({ text: content, done: false });
    save(STORAGE_KEY, state.tasks);
  }

  // 计算今日统计
  function computeReviewStats() {
    const date = state.currentDate;
    const dayTasks = state.tasks[date] || {};
    const dayDone = state.done[date] || {};
    const dayRecords = state.records[date] || {};

    let plannedCells = 0, doneCount = 0, recordedCells = 0, matchCount = 0;
    let totalSpentMin = 0; // 估算总花费分钟
    Object.keys(dayTasks).forEach((key) => {
      if (dayTasks[key] && dayTasks[key].length) {
        plannedCells++;
        if (dayDone[key]) doneCount++;
        if (dayRecords[key] && dayRecords[key].actual) {
          recordedCells++;
          matchCount++;
        }
      }
    });
    // 也算有记录但无计划的
    Object.keys(dayRecords).forEach((key) => {
      if (dayRecords[key] && dayRecords[key].actual && (!dayTasks[key] || !dayTasks[key].length)) {
        recordedCells++;
      }
      // 累计花费时间（解析 "30分钟" "1小时" "1.5h" 等）
      const spent = dayRecords[key] && dayRecords[key].spent;
      if (spent) totalSpentMin += parseSpentToMinutes(spent);
    });
    const matchRate = plannedCells ? Math.round((matchCount / plannedCells) * 100) : 0;
    const completionRate = plannedCells ? Math.round((doneCount / plannedCells) * 100) : 0;
    return {
      plannedCells, recordedCells, doneCount, matchRate, matchCount,
      totalSpentMin, completionRate,
      totalSpentText: formatMinutes(totalSpentMin)
    };
  }

  // 解析花费时间字符串为分钟数
  function parseSpentToMinutes(s) {
    if (!s) return 0;
    let m = 0;
    // "X小时" "Xh"
    const hMatch = s.match(/([\d.]+)\s*(?:小时|h|hr|hour)/i);
    if (hMatch) m += parseFloat(hMatch[1]) * 60;
    // "X分钟" "Xmin" "Xm"
    const minMatch = s.match(/([\d.]+)\s*(?:分钟|min|m(?!s))/i);
    if (minMatch) m += parseFloat(minMatch[1]);
    // 纯数字默认分钟
    if (!hMatch && !minMatch) {
      const num = parseFloat(s);
      if (!isNaN(num)) m = num;
    }
    return m;
  }

  // 格式化分钟为可读时间
  function formatMinutes(min) {
    if (!min) return "0分钟";
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    if (h && m) return `${h}小时${m}分`;
    if (h) return `${h}小时`;
    return `${m}分钟`;
  }

  // 复盘页时辰热力图：9 时辰记录数可视化
  function renderReviewHeatmap() {
    const date = state.currentDate;
    const dayTasks = state.tasks[date] || {};
    const dayRecords = state.records[date] || {};
    const dayDone = state.done[date] || {};
    let maxRec = 0;
    const periodStats = [];
    for (let p = 0; p < PERIOD_COUNT; p++) {
      let planned = 0, recorded = 0, done = 0;
      for (let c = 0; c < CELLS_PER_PERIOD; c++) {
        const key = p + "-" + c;
        if (dayTasks[key] && dayTasks[key].length) planned++;
        if (dayRecords[key] && dayRecords[key].actual) recorded++;
        if (dayDone[key]) done++;
      }
      if (recorded > maxRec) maxRec = recorded;
      periodStats.push({ planned, recorded, done });
    }
    if (maxRec === 0) return ""; // 无记录时不显示
    return `
      <div class="review-heatmap">
        <div class="heatmap-title">🔥 时辰执行热力图 <span class="heatmap-hint">点击格跳转记录</span></div>
        <div class="heatmap-grid">
          ${periodStats.map((s, i) => {
            const intensity = maxRec ? s.recorded / maxRec : 0;
            const alpha = 0.15 + intensity * 0.7;
            const range = getPeriodRange(i);
            const isHot = intensity >= 0.7;
            return `
              <div class="heatmap-cell ${isHot ? "hot" : ""}" data-period="${i}" style="background:rgba(59,130,246,${alpha});" title="${PERIOD_NAMES[i]} ${secondsToHHMM(range.start)}-${secondsToHHMM(range.end)}\n计划${s.planned}格 / 记录${s.recorded}格 / 完成${s.done}格\n点击跳转">
                <div class="heatmap-name">${PERIOD_NAMES[i]}</div>
                <div class="heatmap-time">${secondsToHHMM(range.start)}</div>
                <div class="heatmap-count">${s.recorded}</div>
              </div>
            `;
          }).join("")}
        </div>
        <div class="heatmap-legend">
          <span>少</span>
          <div class="heatmap-legend-bar"></div>
          <span>多</span>
        </div>
      </div>
    `;
  }

  // 绑定热力图点击事件（在 renderReview 后调用）
  function bindHeatmapClicks() {
    if (!el.reviewBody) return;
    el.reviewBody.querySelectorAll(".heatmap-cell[data-period]").forEach((c) => {
      c.addEventListener("click", () => {
        const p = parseInt(c.dataset.period, 10);
        if (isNaN(p)) return;
        state.activePeriod = p;
        setRealm("record");
        toast(`已跳转到第 ${p + 1} 时辰记录页`, "info");
      });
    });
  }

  // AI 智能复盘
  async function generateAiReview() {
    if (!el.aiReviewBtn) return;
    const date = state.currentDate;

    try {
      // 显示加载
      el.reviewBody.innerHTML = `
        <div class="review-loading">
          <div class="review-spinner"></div>
          <div>正在结合计划与记录生成复盘…</div>
        </div>
      `;

      // 收集今日数据
      const dayTasks = state.tasks[date] || {};
    const dayDone = state.done[date] || {};
    const dayRecords = state.records[date] || {};

    const planItems = [];
    const recordItems = [];
    for (let p = 0; p < PERIOD_COUNT; p++) {
      for (let c = 0; c < CELLS_PER_PERIOD; c++) {
        const key = p + "-" + c;
        const range = getCellRange(p, c);
        const time = `${secondsToHHMM(range.start)}-${secondsToHHMM(range.end)}`;
        const tasks = (dayTasks[key] || []).map((t) => taskText(t));
        const done = !!dayDone[key];
        const rec = dayRecords[key];
        if (tasks.length) {
          planItems.push(`[${time}] ${tasks.join("; ")}${done ? "(✓已完成)" : "(未完成)"}`);
        }
        if (rec && (rec.actual || rec.spent)) {
          recordItems.push(`[${time}] 花费:${rec.spent || "-"} 实际:${rec.actual || "-"}${rec.note ? " 备注:" + rec.note : ""}`);
        }
      }
    }

    if (!planItems.length && !recordItems.length) {
      el.reviewBody.innerHTML = `<div class="review-empty">今日尚无计划与记录数据，无法生成复盘</div>`;
      return;
    }

    const stats = computeReviewStats();
    const prompt = `请基于以下今日曼陀罗时辰数据生成复盘总结。

【计划】（共${planItems.length}格，完成${stats.doneCount}格）：
${planItems.join("\n") || "（无）"}

【记录】（共${recordItems.length}格）：
${recordItems.join("\n") || "（无）"}

【统计】计划格数:${stats.plannedCells} 已记录:${stats.recordedCells} 完成数:${stats.doneCount} 吻合率:${stats.matchRate}%

请用 JSON 格式返回（仅返回 JSON，不要 markdown 代码块）：
{
  "summary": "整体总结，2-4句，分析今日执行情况、节奏、效率",
  "insights": ["洞察1", "洞察2", "洞察3"],
  "suggestions": ["改进建议1", "改进建议2"],
  "highlights": ["亮点1", "亮点2"],
  "tomorrowPlan": {
    "items": [{"time": "7:00-7:13", "content": "明日要做的任务1"}, {"time": "9:00-9:13", "content": "明日要做的任务2"}],
    "tip": "基于今日数据给明日安排的建议"
  }
}`;

    try {
      let parsed;
      const useAi = state.settings.apiUrl && state.settings.apiKey;
      if (useAi) {
        const result = await callAiApi(prompt, "done", () => {});
        // callAiApi 返回 {html, ...}，从 html 中提取 JSON
        let text = result.html || "";
        text = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        // 尝试提取 JSON
        const m = text.match(/\{[\s\S]*\}/);
        if (m) text = m[0];
        parsed = JSON.parse(text);
      } else {
        // 本地模式：根据数据生成模板化复盘
        parsed = generateLocalReview(planItems, recordItems, stats);
      }
      parsed.stats = stats;
      parsed.userNotes = (getDayReview(date) || {}).userNotes || "";
      parsed.aiGeneratedAt = new Date().toLocaleString("zh-CN");
      setDayReview(date, parsed);
      renderReview();
      toast("复盘已生成", "success");
    } catch (err) {
      // 兜底：用本地逻辑生成
      const parsed = generateLocalReview(planItems, recordItems, stats);
      parsed.stats = stats;
      parsed.userNotes = (getDayReview(date) || {}).userNotes || "";
      parsed.aiGeneratedAt = new Date().toLocaleString("zh-CN") + " (本地)";
      setDayReview(date, parsed);
      renderReview();
      toast("AI 失败，已用本地逻辑生成: " + (err.message || ""), "info");
    }
    } catch (outerErr) {
      // 外层兜底：数据收集或渲染异常
      el.reviewBody.innerHTML = `<div class="review-empty">复盘生成失败：${escapeHtml(outerErr.message || "未知错误")}。请检查数据后重试。</div>`;
      toast("复盘生成异常，已恢复", "error");
    }
  }

  // 本地兜底复盘生成
  function generateLocalReview(planItems, recordItems, stats) {
    const summary = `今日共规划 ${stats.plannedCells} 格任务，实际记录 ${stats.recordedCells} 格，完成 ${stats.doneCount} 格，计划-记录吻合率 ${stats.matchRate}%。${
      stats.matchRate >= 80 ? "整体执行与计划高度吻合，节奏稳定。" :
      stats.matchRate >= 50 ? "部分任务按计划完成，仍有改进空间。" :
      "实际执行与计划偏差较大，建议复盘原因。"
    }`;
    const insights = [];
    if (stats.doneCount < stats.plannedCells * 0.5) insights.push("完成率偏低，可能任务过载或专注不足，建议减少同时段任务数。");
    if (stats.recordedCells < stats.plannedCells * 0.5) insights.push("记录覆盖不足，建议每完成一格即时记录，便于复盘。");
    if (stats.matchRate >= 80) insights.push("计划与实际高度吻合，时间预估能力较强。");
    if (recordItems.length > planItems.length * 0.5 && stats.matchRate < 50) insights.push("记录显示实际做了较多计划外事项，可能临时插入任务较多。");
    if (!insights.length) insights.push("数据较为均衡，继续保持当前节奏。");

    const suggestions = [
      "明日按今日实际节奏调整任务密度",
      "高能时段优先安排重要任务",
      "每完成一格立即记录，避免遗忘"
    ];
    const highlights = [];
    if (stats.doneCount > 0) highlights.push(`完成 ${stats.doneCount} 格任务`);
    if (stats.matchRate >= 70) highlights.push("时间预估准确");
    if (recordItems.length >= planItems.length * 0.7) highlights.push("记录习惯良好");
    if (!highlights.length) highlights.push("坚持记录已是良好开端");

    // 明日建议安排：基于今日未完成项 + 高效时段
    const tomorrowPlan = generateTomorrowSuggestion(planItems, recordItems, stats);

    return { summary, insights, suggestions, highlights, tomorrowPlan };
  }

  // 生成明日建议（本地逻辑）
  function generateTomorrowSuggestion(planItems, recordItems, stats) {
    const items = [];
    // 1) 今日未完成的任务（从 planItems 中解析出未完成项）
    planItems.forEach((line) => {
      if (line.includes("(未完成)")) {
        const m = line.match(/\[(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\]\s*(.+?)\(未完成\)/);
        if (m) items.push({ time: m[1] + "-" + m[2], content: m[3].split("; ")[0] });
      }
    });
    // 2) 高效时段（吻合的格子）下次继续保持
    const matchedTimes = [];
    recordItems.forEach((line) => {
      const m = line.match(/\[(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\]\s*花费:([^ ]*?)\s*实际:([^ ]*)/);
      if (m && m[4] && m[4] !== "（无）") matchedTimes.push(m[1] + "-" + m[2]);
    });
    const tip = matchedTimes.length > 3
      ? `今日高效时段：${matchedTimes.slice(0, 3).join("、")}，建议明日相似时段安排重要任务。`
      : "今日高效时段记录不足，建议明日每完成一格即记录，便于识别个人节奏。";
    return { items, tip, baseDate: state.currentDate };
  }

  // ---------- 快捷切换栏 ----------
  function renderQuickToggle() {
    el.quickToggle.innerHTML = "";
    // 组块化：按「天/地/人/跨环节」分组，去掉每个 chip 的小圆点（晃眼）
    const GROUPS = [
      { id: "plan",   label: "天·计划", icon: "☀" },
      { id: "record", label: "地·记录", icon: "◎" },
      { id: "review", label: "人·复盘", icon: "✦" },
      { id: "cross",  label: "跨环节",  icon: "⇄" },
    ];
    const byGroup = { plan: [], record: [], review: [], cross: [] };
    PRESET_SKILLS.forEach((s) => {
      const g = byGroup[s.group] ? s.group : "cross";
      byGroup[g].push(s);
    });

    const toggleSkill = (skill, active) => {
      let skills = state.settings.skills.slice();
      if (active) {
        skills = skills.filter((x) => x !== skill.id);
      } else {
        skills.push(skill.id);
      }
      state.settings.skills = skills;
      save(SETTINGS_KEY, state.settings);
      renderQuickToggle();
      renderChatBadges();
      toast(active ? `已关闭 ${skill.name}` : `已启用 ${skill.name}`, "info");
    };

    GROUPS.forEach((g) => {
      const items = byGroup[g.id];
      if (!items.length) return;
      const groupEl = document.createElement("div");
      groupEl.className = "qt-group";
      const labelEl = document.createElement("span");
      labelEl.className = "qt-group-label";
      labelEl.innerHTML = `<span class="qt-group-icon">${g.icon}</span>${g.label}`;
      groupEl.appendChild(labelEl);
      const chipsEl = document.createElement("div");
      chipsEl.className = "qt-group-chips";
      items.forEach((skill) => {
        const active = state.settings.skills.includes(skill.id);
        const chip = document.createElement("span");
        chip.className = "qt-chip" + (active ? " active" : "");
        chip.textContent = skill.name;
        chip.title = skill.desc;
        chip.addEventListener("click", () => toggleSkill(skill, active));
        chipsEl.appendChild(chip);
      });
      groupEl.appendChild(chipsEl);
      el.quickToggle.appendChild(groupEl);
    });

    // MCP 独立一块
    const mcpGroup = document.createElement("div");
    mcpGroup.className = "qt-group qt-group-mcp";
    const mcpLabel = document.createElement("span");
    mcpLabel.className = "qt-group-label";
    mcpLabel.innerHTML = `<span class="qt-group-icon">⌘</span>外部`;
    mcpGroup.appendChild(mcpLabel);
    const mcpChips = document.createElement("div");
    mcpChips.className = "qt-group-chips";
    const mcpActive = state.settings.mcpEnabled && state.settings.mcpConfig;
    const mcpChip = document.createElement("span");
    mcpChip.className = "qt-chip" + (mcpActive ? " active" : "");
    mcpChip.textContent = "MCP";
    mcpChip.title = "Model Context Protocol";
    mcpChip.addEventListener("click", () => {
      if (!state.settings.mcpConfig) {
        toast("请先在设置中配置 MCP", "error");
        return;
      }
      state.settings.mcpEnabled = !state.settings.mcpEnabled;
      save(SETTINGS_KEY, state.settings);
      renderQuickToggle();
      renderChatBadges();
      toast(state.settings.mcpEnabled ? "已启用 MCP" : "已关闭 MCP", "info");
    });
    mcpChips.appendChild(mcpChip);
    mcpGroup.appendChild(mcpChips);
    el.quickToggle.appendChild(mcpGroup);
  }

  // ---------- 任务编辑弹窗（多任务） ----------
  function openTaskDialog(period, cell) {
    state.editingCell = { period, cell };
    const range = getCellRange(period, cell);
    el.taskTimeRange.textContent = `${secondsToHHMM(range.start)} - ${secondsToHHMM(range.end)}`;
    const tasks = getCellTasks(period, cell);
    el.taskContent.value = tasks.map(taskText).join("\n");
    el.taskDone.checked = getCellDone(period, cell);
    // 属性：取第一个任务的属性作为默认（本格统一）
    const first = tasks[0];
    el.taskPriority.value = first?.priority || "medium";
    el.taskTag.value = first?.tag || "";
    el.taskEstimate.value = first?.estimate || "";
    el.taskDeadline.value = first?.deadline || "";
    const checklist = getCellChecklist(period, cell);
    el.taskChecklist.value = checklist.map((i) => {
      let line = (i.done ? "☑ " : "☐ ") + i.text;
      if (i.dim) line += ` #${i.dim}${i.dimGoal ? `→${i.dimGoal}` : ""}#`;
      return line;
    }).join("\n");
    // 重复规则
    const rpt = getRepeatRuleForCell(state.currentDate, period, cell);
    el.taskRepeat.value = rpt ? rpt.rule : "";
    el.taskRepeatCount.value = rpt ? String(rpt.maxCount) : "0";
    el.taskDialogTitle.textContent = `编辑任务 · 第${period + 1}辰 第${cell + 1}格`;
    el.taskDialog.showModal();
    setTimeout(() => el.taskContent.focus(), 50);
  }

  function closeTaskDialog() { el.taskDialog.close(); state.editingCell = null; }

  el.saveTask.addEventListener("click", () => {
    if (!state.editingCell) return;
    const { period, cell } = state.editingCell;
    const texts = el.taskContent.value.split("\n").map((s) => s.trim()).filter(Boolean);
    // 统一应用属性
    const meta = {
      priority: el.taskPriority.value,
      tag: el.taskTag.value.trim(),
      estimate: el.taskEstimate.value.trim(),
      deadline: el.taskDeadline.value,
    };
    const tasks = texts.map((t) => ({ text: t, ...meta }));
    setCellTasks(period, cell, tasks);
    // 子任务清单：支持 ☑/☐/✓/x 前缀标记完成状态
    const clLines = el.taskChecklist.value.split("\n").map((s) => s.trim()).filter(Boolean);
    const checklist = clLines.map((line) => {
      // 解析维度标记 ` #Cl.def→3#`（孵化写入，完成时可回填评分）
      let dim = null, dimGoal = null, text = line;
      const dimMatch = line.match(/\s*#(\w+)\.(\w+)(?:→(\d+))?#\s*$/);
      if (dimMatch) {
        dim = `${dimMatch[1]}.${dimMatch[2]}`;
        dimGoal = dimMatch[3] ? parseInt(dimMatch[3], 10) : null;
        text = line.replace(/\s*#\w+\.\w+(?:→\d+)?#\s*$/, "");
      }
      const m = text.match(/^([☑☐✓√xX])\s*(.*)$/);
      let done = false;
      if (m) {
        done = /[☑✓√]/.test(m[1]);
        text = m[2];
      }
      const item = { text, done };
      if (dim) {
        item.dim = dim;
        if (dimGoal) item.dimGoal = dimGoal;
      }
      return item;
    });
    setCellChecklist(period, cell, checklist);
    // 重复规则：先清旧的，再按选择加新的
    removeRepeatRulesForCell(state.currentDate, period, cell);
    const rule = el.taskRepeat.value;
    const maxCount = parseInt(el.taskRepeatCount.value, 10) || 0;
    if (rule && tasks.length) {
      addRepeatRule(state.currentDate, period, cell, tasks, rule, maxCount);
      const n = refreshRepeats();
      toast(`已保存，重复规则已应用到未来 ${n} 个日期`, "success");
    } else {
      toast("已保存", "success");
    }
    if (el.taskDone.checked && tasks.length) {
      setCellDone(period, cell, true);
    } else {
      setCellDone(period, cell, false);
    }
    closeTaskDialog();
    renderAll();
  });

  el.deleteTask.addEventListener("click", () => {
    if (!state.editingCell) return;
    const { period, cell } = state.editingCell;
    setCellTasks(period, cell, []);
    setCellDone(period, cell, false);
    setCellChecklist(period, cell, []);
    const removed = removeRepeatRulesForCell(state.currentDate, period, cell);
    closeTaskDialog();
    renderAll();
    toast(removed ? "已删除，重复规则已取消" : "已删除", "info");
  });

  el.closeTaskDialog.addEventListener("click", closeTaskDialog);
  el.taskDialog.addEventListener("click", (e) => { if (e.target === el.taskDialog) closeTaskDialog(); });

  // ---------- 任务孵化（Hatch）----------
  // 复用 TJ decompose 的编排哲学：estimate → main → grow → risk 四步流式
  // 输出有序可执行动作链（带 est_min/depends_on/risk），写入 checklist
  const HATCH_MODE_CFG = {
    lite:   { min: 3, max: 5,  label: "lite" },
    medium: { min: 5, max: 8,  label: "medium" },
    zen:    { min: 8, max: 12, label: "zen" },
  };
  const HATCH_SCENES = {
    learn: {
      label: "学习",
      focus: "理解性步骤：先建立认知框架再深入细节",
      rules: "步骤要包含「检索/对比/复述/应用」四类学习动作；每步标注预期理解的深度（表面/机制/迁移）",
    },
    exec: {
      label: "执行",
      focus: "顺序动作链：每步可独立产出物",
      rules: "每步必须是具体动作（动词开头）；单步 15-30 分钟可完成；产出可验证",
    },
    decide: {
      label: "决策",
      focus: "信息收集 → 选项对比 → 决策标准 → 选择",
      rules: "前 2 步聚焦信息收集和选项列举；中间步骤列利弊和决策标准；最后 1 步是明确选择动作",
    },
    checklist: {
      label: "清单",
      focus: "并列检查项，无严格顺序",
      rules: "步骤之间无依赖（depends_on 一律 null）；每步是一个独立检查项；总数偏多没关系",
    },
    drill: {
      label: "薄弱补强",
      focus: "针对 7 维度薄弱子维度生成定向练习",
      rules: "每个薄弱子维度生成 1-2 个步骤；步骤必须直接回应该子维度的核心追问；target_dim 必填；dim_goal = 当前分+1（封顶5）",
    },
  };

  // 自动识别场景（关键词路由）
  function detectHatchScene(taskText) {
    const t = taskText.toLowerCase();
    if (/(学|读|研究|理解|掌握|弄懂|搞懂|复习|预习)/.test(t)) return "learn";
    if (/(选|决定|对比|选择|评估.*方案|权衡)/.test(t)) return "decide";
    if (/(准备|组织|策划|整理|检查|盘点|核对)/.test(t)) return "checklist";
    return "exec";
  }

  // 7 维度薄弱项识别（≤ threshold 视为薄弱）
  function findWeakDims(evalObj, threshold = 2) {
    if (!evalObj) return [];
    const weak = [];
    KNOWLEDGE_DIMENSIONS.forEach((d) => {
      d.subs.forEach((s) => {
        const v = evalObj[s.key] || 0;
        if (v <= threshold && v >= 0) {
          weak.push({
            dim: d.code, dimName: d.name, dimColor: d.color,
            sub: s.key, subName: s.name, question: s.q,
            score: v, goal: Math.min(5, v + 1),
          });
        }
      });
    });
    return weak.sort((a, b) => a.score - b.score).slice(0, 5);
  }

  // 根据维度 code+sub 查找维度元信息
  function lookupDim(dimCode, subKey) {
    const d = KNOWLEDGE_DIMENSIONS.find((x) => x.code === dimCode);
    if (!d) return null;
    const s = d.subs.find((x) => x.key === subKey);
    if (!s) return null;
    return { dim: d.code, dimName: d.name, dimColor: d.color, sub: s.key, subName: s.name, question: s.q };
  }

  // 7 维度标准练习模板（0 token 命中即用，未命中走 LLM）
  const HATCH_DIM_TEMPLATES = {
    "Cl.def": (task) => `用一句话定义「${task}」，再对比一个最易混淆的概念，说清两者区别`,
    "Cl.boundary": (task) => `列举「${task}」的 3 个边界条件：什么情况下它成立/不成立`,
    "Cl.repr": (task) => `用图形或比喻重新表达「${task}」，画一张示意图或找一个生活类比`,
    "Cp.structure": (task) => `画出「${task}」的知识结构树（根干枝叶），检查是否有遗漏子知识`,
    "Cp.steps": (task) => `闭卷写出「${task}」的完整操作链，每步不能跳过`,
    "B.condition": (task) => `列出「${task}」的 3 个适用条件，每条配一个真实例子`,
    "B.fail": (task) => `列举「${task}」失效的 3 种场景，分析为什么失效`,
    "B.limit": (task) => `把「${task}」推到极端参数，观察它还成立吗，记录临界点`,
    "L.upstream": (task) => `梳理「${task}」的前置知识（必须先会什么）和后续应用（能做什么）`,
    "L.isomorphic": (task) => `找出一个和「${task}」共享相同底层骨架的知识，对比结构`,
    "L.crossdomain": (task) => `把「${task}」迁移到另一个领域或生活场景，给出具体应用`,
    "Ev.version": (task) => `记录你对「${task}」理解的 3 个版本（过去/现在/预期未来），对比深化点`,
    "Ev.iteration": (task) => `判断「${task}」下一步该修正、升级还是淘汰，给出理由`,
    "P.chunk": (task) => `把「${task}」压缩成一句口诀或一个记忆钩子，越短越好`,
    "P.fluency": (task) => `对「${task}」做 3 次闭卷快速复述，记录从刻意回忆到自动执行的转变点`,
    "Rh.cycle": (task) => `为「${task}」设定检索周期（如 1/3/7 天），写下第一次复习日期`,
    "Rh.freq": (task) => `统计本周「${task}」的练习次数，若 <3 次则排进下周计划`,
    "Rh.predict": (task) => `预判「${task}」中你最可能卡住的 2 个点，各写一个应急方案`,
    "Rh.duration": (task) => `评估「${task}」每次训练的合理时长，过短/过长都调整`,
    "Rh.timing": (task) => `找出你训练「${task}」状态最好的时段（如清晨/夜深），固定下来`,
  };

  // 自动选档（基于任务文本长度 + 关键词）
  function autoHatchMode(taskText) {
    const len = taskText.length;
    if (/(论文|项目|设计|重构|策划|开发|搭建)/.test(taskText)) return "zen";
    if (len < 8) return "lite";
    if (len > 20) return "zen";
    return "medium";
  }

  // 任务文本哈希（历史命中用，简易 djb2）
  function hashTaskText(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return "h" + (h >>> 0).toString(36);
  }

  // 孵化历史读写
  function loadHatchHistory() { return load(HATCH_HISTORY_KEY, []); }
  function saveHatchHistory(list) { save(HATCH_HISTORY_KEY, list); }
  function findHatchHistory(taskHash) {
    const list = loadHatchHistory();
    return list.find((h) => h.task_hash === taskHash);
  }
  function recordHatchHistory(taskHash, taskText, result, acceptedCount) {
    const list = loadHatchHistory();
    const existing = list.find((h) => h.task_hash === taskHash);
    const entry = {
      task_hash: taskHash,
      task_text: taskText,
      last_mode: result.mode,
      last_scene: result.scene,
      accepted_count: acceptedCount,
      total_count: (result.steps || []).length,
      est_total_min: result.est_total_min || 0,
      created_at: Date.now(),
    };
    if (existing) Object.assign(existing, entry);
    else list.push(entry);
    // 只保留最近 50 条
    while (list.length > 50) list.shift();
    saveHatchHistory(list);
  }

  // 核心 LLM 调用（不走 chat 历史，独立请求）
  async function callHatchLLM(systemPrompt, userPrompt, signal) {
    const { apiUrl, apiKey, apiModel } = state.settings;
    if (!apiUrl || !apiKey) throw new Error("请先在设置中配置 AI API");
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: apiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
        stream: false,
      }),
      signal,
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(formatApiError(resp.status, errText));
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "";
  }

  // 从 LLM 输出中提取 JSON（容错：去 markdown 围栏 + 找第一个 { 到最后 }）
  function extractJSON(text) {
    if (!text) return null;
    let t = text.trim();
    // 去掉 ```json ... ``` 围栏
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try { return JSON.parse(t.slice(start, end + 1)); }
    catch (e) { return null; }
  }

  // 单次合并调用（4 步合一，省 token，速度更快）
  function buildHatchPrompt(taskText, mode, scene, context, weakDims) {
    const cfg = HATCH_MODE_CFG[mode];
    const sc = HATCH_SCENES[scene];
    const isDrill = scene === "drill";

    const schemaFields = [
      '"text":"具体动作"',
      '"est_min":15',
      '"depends_on":null',
      '"risk":"low"',
      '"risk_note":""',
      '"why":"为什么必要"',
    ];
    if (isDrill || scene === "learn") {
      schemaFields.push('"target_dim":"维度.子维度（如 Cl.def，drill 必填，learn 选填）"');
      schemaFields.push('"dim_goal":3');
      schemaFields.push('"verify":"完成自检标准（如：能脱稿讲2分钟）"');
    }

    const systemPrompt = [
      "你是任务拆解专家。把用户的粗粒度任务拆成可执行子任务。",
      "只输出 JSON，不要解释、不要 markdown 围栏。",
      "",
      "【硬规则】",
      "1. 每个子任务必须是具体动作（动词开头：写/查/调/发/对齐/读/列...）",
      `2. 总步数 ${cfg.min}-${cfg.max}，单步可在 15-30 分钟完成（超了继续拆）`,
      "3. 按执行顺序排列，标注依赖（depends_on 为前一步的 index，从 0 开始；无依赖为 null）",
      "4. 标注 est_min（预估分钟，15-30）、risk（low/med/high）",
      "5. risk=med/high 时 risk_note 必填（说明卡点和应急方案）",
      "6. why 一句话说明这步为什么必要",
      "",
      `【场景：${sc.label}】`,
      `重点：${sc.focus}`,
      `附加规则：${sc.rules}`,
    ];

    if (isDrill && weakDims && weakDims.length) {
      systemPrompt.push("");
      systemPrompt.push("【该任务当前 7 维度薄弱项（每步必须针对其中一项）】");
      weakDims.forEach((w) => {
        systemPrompt.push(`- ${w.dim}.${w.sub}=${w.score}（${w.dimName}·${w.subName}）：${w.question} → 目标提升到 ${w.goal} 分`);
      });
      systemPrompt.push("每个薄弱项生成 1-2 个步骤，步骤的 target_dim 和 dim_goal 必须对应上述薄弱项。");
      systemPrompt.push("verify 字段给出可自检的完成标准（达成即可认为该子维度提升到 dim_goal）。");
    } else if (scene === "learn") {
      systemPrompt.push("");
      systemPrompt.push("【学习场景可选标注】若步骤明显对应某 7 维度（Cl清晰度/Cp完整性/B边界感/L关联度/Ev进化感/P精炼度/Rh节奏感），可填 target_dim 帮助后续评估。");
    }

    systemPrompt.push("");
    systemPrompt.push("【输出 schema】");
    systemPrompt.push(`{"complexity":"simple|standard|complex","est_total_min":数字,"first_blocker":"最可能卡住的点","shortcut":"可选捷径（可空）","steps":[{${schemaFields.join(",")}}]}`);

    const userPrompt = [
      `任务：${taskText}`,
      context ? `背景：${context}` : "",
      `档位：${mode}（目标 ${cfg.min}-${cfg.max} 步）`,
      `场景：${scene}（${sc.label}）`,
      "",
      "请按 schema 输出。",
    ].filter(Boolean).join("\n");

    return { systemPrompt: systemPrompt.join("\n"), userPrompt };
  }

  // 孵化状态
  const hatchState = {
    running: false,
    abortController: null,
    taskText: "",
    taskHash: "",
    mode: "medium",
    scene: "exec",
    result: null,
    acceptedSet: null, // Set of selected step indices
    longTaskId: null,  // 关联长期任务 id（drill 模式用）
    weakDims: null,    // 薄弱维度列表（drill 模式用）
  };

  function showHatchProgress(step, text) {
    el.hatchProgress.hidden = false;
    el.hatchResult.hidden = true;
    el.hatchError.hidden = true;
    el.hatchProgressFill.style.width = (step * 25) + "%";
    el.hatchProgressText.textContent = text;
    el.hatchProgress.querySelectorAll(".hatch-step").forEach((s) => {
      const n = parseInt(s.dataset.step, 10);
      s.classList.toggle("active", n === step);
      s.classList.toggle("done", n < step);
    });
  }

  function renderHatchResult(result) {
    hatchState.result = result;
    el.hatchProgress.hidden = true;
    el.hatchResult.hidden = false;
    el.hatchError.hidden = true;

    // 摘要
    const totalMin = result.est_total_min || (result.steps || []).reduce((s, x) => s + (x.est_min || 0), 0);
    const highRisk = (result.steps || []).filter((s) => s.risk === "high").length;
    const medRisk = (result.steps || []).filter((s) => s.risk === "med").length;
    const riskClass = highRisk ? "hatch-summary-risk-high" : (medRisk ? "hatch-summary-risk-med" : "hatch-summary-risk-low");
    const riskText = highRisk ? `高 ${highRisk}` : (medRisk ? `中 ${medRisk}` : "低");
    el.hatchSummary.innerHTML = `
      <div class="hatch-summary-row"><span class="hatch-summary-label">总步数</span><span class="hatch-summary-value">${(result.steps || []).length}</span></div>
      <div class="hatch-summary-row"><span class="hatch-summary-label">预估时长</span><span class="hatch-summary-value">${totalMin} 分钟（约 ${(totalMin / 60).toFixed(1)}h）</span></div>
      <div class="hatch-summary-row"><span class="hatch-summary-label">风险等级</span><span class="hatch-summary-value ${riskClass}">${riskText}</span></div>
      ${result.first_blocker ? `<div class="hatch-summary-row"><span class="hatch-summary-label">最可能卡点</span><span class="hatch-summary-value">${escapeHtml(result.first_blocker)}</span></div>` : ""}
    `;

    // 捷径
    if (result.shortcut && result.shortcut.trim()) {
      el.hatchShortcut.hidden = false;
      el.hatchShortcut.textContent = result.shortcut;
    } else {
      el.hatchShortcut.hidden = true;
    }

    // 步骤列表
    hatchState.acceptedSet = new Set((result.steps || []).map((_, i) => i)); // 默认全选
    el.hatchList.innerHTML = "";
    (result.steps || []).forEach((step, idx) => {
      const item = document.createElement("label");
      item.className = "hatch-item";
      const riskTag = step.risk ? `<span class="hatch-tag hatch-tag-risk-${step.risk}">${({low:"低风险",med:"中风险",high:"高风险"})[step.risk] || step.risk}</span>` : "";
      const depTag = (step.depends_on !== null && step.depends_on !== undefined) ? `<span class="hatch-tag hatch-tag-dep">← 依赖${step.depends_on + 1}</span>` : "";
      const minTag = step.est_min ? `<span class="hatch-tag">${step.est_min}min</span>` : "";
      // 维度徽章（带颜色）
      let dimTag = "";
      if (step.target_dim) {
        const [dc, sk] = step.target_dim.split(".");
        const meta = lookupDim(dc, sk);
        if (meta) {
          const goalTxt = step.dim_goal ? `→${step.dim_goal}` : "";
          dimTag = `<span class="hatch-tag hatch-tag-dim" style="background:${meta.dimColor}22;color:${meta.dimColor};" title="${meta.dimName}·${meta.subName}：${meta.question}">${step.target_dim}${goalTxt}</span>`;
        }
      }
      item.innerHTML = `
        <input type="checkbox" checked data-idx="${idx}" />
        <div class="hatch-item-body">
          <div class="hatch-item-head">
            <span class="hatch-item-idx">${idx + 1}</span>
            <span class="hatch-item-text">${escapeHtml(step.text)}</span>
          </div>
          <div class="hatch-item-meta">${minTag}${depTag}${riskTag}${dimTag}</div>
          ${step.verify ? `<div class="hatch-item-verify">✓ ${escapeHtml(step.verify)}</div>` : ""}
          ${step.risk_note && (step.risk === "med" || step.risk === "high") ? `<div class="hatch-item-risk-note">⚠ ${escapeHtml(step.risk_note)}</div>` : ""}
          ${step.why ? `<div class="hatch-item-meta" style="margin-top:2px;color:var(--text-muted);">为什么：${escapeHtml(step.why)}</div>` : ""}
        </div>
      `;
      const cb = item.querySelector("input");
      cb.addEventListener("change", () => {
        if (cb.checked) hatchState.acceptedSet.add(idx);
        else hatchState.acceptedSet.delete(idx);
      });
      el.hatchList.appendChild(item);
    });
  }

  function showHatchError(msg) {
    el.hatchProgress.hidden = true;
    el.hatchResult.hidden = true;
    el.hatchError.hidden = false;
    el.hatchError.textContent = msg;
  }

  async function runHatch(taskText, mode, scene, context, longTaskId, forceLLM) {
    if (hatchState.running) return;
    if (!state.settings.apiUrl || !state.settings.apiKey) {
      showHatchError("请先在设置中配置 AI API（apiUrl + apiKey）");
      return;
    }
    hatchState.running = true;
    hatchState.taskText = taskText;
    hatchState.taskHash = hashTaskText(taskText);
    hatchState.mode = mode;
    hatchState.scene = scene;
    hatchState.longTaskId = longTaskId || null;
    el.hatchBtn.disabled = true;
    el.hatchBtn.classList.add("loading");

    // drill 场景：读关联长期任务的 eval，识别薄弱维度
    let weakDims = null;
    if (scene === "drill") {
      if (!longTaskId) {
        showHatchError("drill 场景需要关联长期任务");
        hatchState.running = false;
        el.hatchBtn.disabled = false;
        el.hatchBtn.classList.remove("loading");
        return;
      }
      const lt = longTasks.find((x) => x.id === longTaskId);
      if (!lt) {
        showHatchError("未找到关联的长期任务");
        hatchState.running = false;
        el.hatchBtn.disabled = false;
        el.hatchBtn.classList.remove("loading");
        return;
      }
      if (!lt.eval) lt.eval = emptyEval();
      weakDims = findWeakDims(lt.eval, 2);
      hatchState.weakDims = weakDims;
      if (!weakDims.length) {
        // 全维度 ≥3，提示已掌握
        showHatchError(`「${lt.title}」7 维度评分均 ≥3，无明显薄弱项。建议归档或提升到 4-5 分精通。`);
        hatchState.running = false;
        el.hatchBtn.disabled = false;
        el.hatchBtn.classList.remove("loading");
        return;
      }
      // 模板库优先：若薄弱维度都能命中模板，0 token 直接生成（forceLLM 时跳过，走个性化）
      const templated = forceLLM ? null : tryTemplateHatch(taskText, weakDims);
      if (templated) {
        showHatchProgress(4, "④ 模板命中（0 token）…");
        await sleep(300);
        templated.mode = mode;
        templated.scene = scene;
        renderHatchResult(templated);
        if (navigator.vibrate) navigator.vibrate(30);
        hatchState.running = false;
        el.hatchBtn.disabled = false;
        el.hatchBtn.classList.remove("loading");
        return;
      }
    }

    // 历史提示
    const hist = findHatchHistory(hatchState.taskHash);
    if (hist) {
      el.hatchHistoryHint.hidden = false;
      const completionRate = hist.total_count ? Math.round(hist.accepted_count / hist.total_count * 100) : 0;
      const ageHours = Math.round((Date.now() - hist.created_at) / 3600000);
      let suggestion = "";
      if (completionRate < 50) suggestion = " · 上次拆得太细，建议这次降档";
      else if (completionRate === 100) suggestion = " · 上次拆得很准，可复用";
      el.hatchHistoryHint.textContent = `📊 上次孵化（${ageHours}h 前）：${hist.total_count} 步，接受 ${hist.accepted_count} 条，完成率 ${completionRate}%${suggestion}`;
    } else {
      el.hatchHistoryHint.hidden = true;
    }

    try {
      showHatchProgress(1, "① 估时判级…");
      await sleep(150);
      showHatchProgress(2, "② 主干拆分…");
      await sleep(150);
      showHatchProgress(3, "③ 步骤细化…");

      const { systemPrompt, userPrompt } = buildHatchPrompt(taskText, mode, scene, context, weakDims);
      hatchState.abortController = new AbortController();
      const timeoutId = setTimeout(() => hatchState.abortController.abort(), 60000);

      const raw = await callHatchLLM(systemPrompt, userPrompt, hatchState.abortController.signal);
      clearTimeout(timeoutId);

      showHatchProgress(4, "④ 风险预判…");
      await sleep(200);

      const parsed = extractJSON(raw);
      if (!parsed || !Array.isArray(parsed.steps) || !parsed.steps.length) {
        throw new Error("AI 输出格式异常，未能解析出步骤。请重试或换档位。");
      }
      parsed.mode = mode;
      parsed.scene = scene;
      parsed.longTaskId = longTaskId || null;

      renderHatchResult(parsed);
      // 轻震动反馈
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (err) {
      if (err.name === "AbortError") {
        showHatchError("请求已取消或超时（60秒）。可降档重试。");
      } else {
        showHatchError(err.message || "孵化失败，请重试");
      }
    } finally {
      hatchState.running = false;
      hatchState.abortController = null;
      el.hatchBtn.disabled = false;
      el.hatchBtn.classList.remove("loading");
    }
  }

  // 模板库优先命中：薄弱维度全部有模板时，0 token 生成
  function tryTemplateHatch(taskText, weakDims) {
    if (!weakDims || !weakDims.length) return null;
    const steps = [];
    let totalMin = 0;
    weakDims.forEach((w, idx) => {
      const key = `${w.dim}.${w.sub}`;
      const tpl = HATCH_DIM_TEMPLATES[key];
      if (!tpl) return; // 有未命中的，整体回退 LLM
      const text = tpl(taskText);
      const est = 20;
      totalMin += est;
      steps.push({
        text,
        est_min: est,
        depends_on: null,
        risk: w.score <= 1 ? "med" : "low",
        risk_note: w.score <= 1 ? `${w.dimName}·${w.subName} 仅 ${w.score} 分，可能需要先补前置知识` : "",
        why: `${w.dim}.${w.sub} 当前 ${w.score} 分，目标 ${w.goal}`,
        target_dim: key,
        dim_goal: w.goal,
        verify: `完成后到长期任务详情页给 ${w.dim}.${w.sub} 评 ${w.goal} 星自检`,
      });
    });
    if (steps.length !== weakDims.length) return null; // 未全部命中
    return {
      complexity: weakDims.length > 3 ? "complex" : "standard",
      est_total_min: totalMin,
      first_blocker: weakDims[0] ? `${weakDims[0].dimName}·${weakDims[0].subName}（${weakDims[0].score}分）` : "",
      shortcut: "全部命中 7 维度标准模板，0 token 生成。可点「重新生成」走 LLM 个性化。",
      steps,
    };
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function openHatchDialog() {
    // 取当前任务弹窗第一行任务文本作为孵化对象
    const text = el.taskContent.value.split("\n").map((s) => s.trim()).filter(Boolean)[0] || "";
    if (!text) {
      toast("请先输入任务内容", "error");
      return;
    }
    el.hatchTaskText.textContent = text;
    el.hatchMode.value = "auto";
    el.hatchScene.value = "auto";
    el.hatchProgress.hidden = true;
    el.hatchResult.hidden = true;
    el.hatchError.hidden = true;
    el.hatchHistoryHint.hidden = true;
    el.hatchDialog.showModal();
    // 自动启动一次
    const mode = autoHatchMode(text);
    const scene = detectHatchScene(text);
    el.hatchMode.value = mode;
    el.hatchScene.value = scene;
    runHatch(text, mode, scene, buildHatchContext());
  }

  // 构建孵化上下文（今日已做 + 关联长期任务）
  function buildHatchContext() {
    const parts = [];
    const todayTasks = getCellTasks ? getDayTasks(state.currentDate) : null;
    if (todayTasks) {
      const doneCount = Object.values(getDayDone(state.currentDate) || {}).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
      if (doneCount) parts.push(`今日已完成 ${doneCount} 项任务`);
    }
    return parts.join("；");
  }

  function closeHatchDialog() {
    if (hatchState.abortController) {
      try { hatchState.abortController.abort(); } catch (e) {}
    }
    el.hatchDialog.close();
  }

  // 加入清单：追加到 taskChecklist 末尾，保留原有内容
  // 带 target_dim 的步骤在行尾追加 ` #Cl.def→3#` 标记，saveTask 时解析为 item.dim
  function applyHatchToChecklist() {
    if (!hatchState.result || !hatchState.acceptedSet) return;
    const acceptedSteps = (hatchState.result.steps || [])
      .filter((_, i) => hatchState.acceptedSet.has(i));
    if (!acceptedSteps.length) {
      toast("未选择任何步骤", "info");
      return;
    }
    // 编码：纯文本步骤直接用；带 target_dim 的追加 ` #Dim.Sub→goal#`
    const newLines = acceptedSteps.map((s) => {
      let line = s.text;
      if (s.target_dim) {
        const goal = s.dim_goal ? `→${s.dim_goal}` : "";
        line += ` #${s.target_dim}${goal}#`;
      }
      return line;
    });
    const existing = el.taskChecklist.value.split("\n").map((s) => s.trim()).filter(Boolean);
    const before = existing.length;
    // 去重（按纯文本，忽略 dim 标记和完成前缀）
    const existingSet = new Set(existing.map((s) => s.replace(/^[☑☐✓√xX]\s*/, "").replace(/\s*#\w+\.\w+(→\d+)?#\s*$/, "")));
    const newOnes = newLines.filter((t) => !existingSet.has(t.replace(/\s*#\w+\.\w+(→\d+)?#\s*$/, "")));
    if (!newOnes.length) {
      toast("所选步骤已在清单中", "info");
      return;
    }
    el.taskChecklist.value = [...existing, ...newOnes].join("\n");
    // 记录历史（用于完成率闭环）
    recordHatchHistory(hatchState.taskHash, hatchState.taskText, hatchState.result, newOnes.length);
    const dimCount = acceptedSteps.filter((s) => s.target_dim).length;
    toast(`已加入 ${newOnes.length} 条到清单${dimCount ? `（含 ${dimCount} 条维度练习）` : ""}`, "success");
    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    closeHatchDialog();
  }

  el.hatchBtn.addEventListener("click", openHatchDialog);
  el.closeHatch.addEventListener("click", closeHatchDialog);
  el.hatchCancelBtn.addEventListener("click", closeHatchDialog);
  el.hatchDialog.addEventListener("click", (e) => { if (e.target === el.hatchDialog) closeHatchDialog(); });

  el.hatchSelectAll.addEventListener("click", () => {
    if (!hatchState.result) return;
    hatchState.acceptedSet = new Set((hatchState.result.steps || []).map((_, i) => i));
    el.hatchList.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = true; });
  });
  el.hatchInvert.addEventListener("click", () => {
    if (!hatchState.result) return;
    const newSet = new Set();
    el.hatchList.querySelectorAll("input[type=checkbox]").forEach((cb, i) => {
      cb.checked = !cb.checked;
      if (cb.checked) newSet.add(i);
    });
    hatchState.acceptedSet = newSet;
  });
  el.hatchRegen.addEventListener("click", () => {
    // 重新生成：温度通过加随机后缀变相提升（避免完全相同结果）
    if (!hatchState.taskText) return;
    const mode = el.hatchMode.value === "auto" ? autoHatchMode(hatchState.taskText) : el.hatchMode.value;
    const scene = el.hatchScene.value === "auto" ? detectHatchScene(hatchState.taskText) : el.hatchScene.value;
    // 降档重试逻辑：如果上次失败过，这里不变档；正常重新生成保持同档
    // drill 场景强制走 LLM（绕过模板库），便于个性化
    const forceLLM = scene === "drill";
    runHatch(hatchState.taskText + (forceLLM ? "（个性化）" : " "), mode, scene, buildHatchContext(), hatchState.longTaskId, forceLLM);
  });
  el.hatchApply.addEventListener("click", applyHatchToChecklist);

  // 模式/场景手动切换后自动重跑
  el.hatchMode.addEventListener("change", () => {
    if (!hatchState.taskText || hatchState.running) return;
    const mode = el.hatchMode.value === "auto" ? autoHatchMode(hatchState.taskText) : el.hatchMode.value;
    const scene = el.hatchScene.value === "auto" ? detectHatchScene(hatchState.taskText) : el.hatchScene.value;
    runHatch(hatchState.taskText, mode, scene, buildHatchContext());
  });
  el.hatchScene.addEventListener("change", () => {
    if (!hatchState.taskText || hatchState.running) return;
    const scene = el.hatchScene.value === "auto" ? detectHatchScene(hatchState.taskText) : el.hatchScene.value;
    if (scene === "drill" && !hatchState.longTaskId) {
      toast("🎯 薄弱补强需从长期任务详情页进入（需读取 7 维度评分）", "info", 4000);
      el.hatchScene.value = "auto";
      return;
    }
    const mode = el.hatchMode.value === "auto" ? autoHatchMode(hatchState.taskText) : el.hatchMode.value;
    runHatch(hatchState.taskText, mode, scene, buildHatchContext(), hatchState.longTaskId);
  });

  // ---------- 子任务清单弹出层 ----------
  let activePopover = null;
  function openChecklistPopover(period, cell, anchorEl) {
    closeChecklistPopover();
    const items = getCellChecklist(period, cell);
    if (!items.length) return;
    const pop = document.createElement("div");
    pop.className = "checklist-popover";
    pop.innerHTML = `<div class="checklist-popover-title">子任务清单</div>`;
    items.forEach((it, idx) => {
      const row = document.createElement("label");
      row.className = "checklist-row" + (it.done ? " done" : "");
      let dimBadge = "";
      if (it.dim) {
        const [dc, sk] = it.dim.split(".");
        const meta = lookupDim(dc, sk);
        if (meta) {
          const goalTxt = it.dimGoal ? `→${it.dimGoal}` : "";
          dimBadge = `<span class="hatch-tag hatch-tag-dim" style="background:${meta.dimColor}22;color:${meta.dimColor};font-size:10px;" title="${meta.dimName}·${meta.subName}：${meta.question}">${it.dim}${goalTxt}</span>`;
        }
      }
      row.innerHTML = `<input type="checkbox" ${it.done ? "checked" : ""}><span>${escapeHtml(it.text)}</span>${dimBadge}`;
      row.querySelector("input").addEventListener("change", () => {
        toggleChecklistItem(period, cell, idx);
        row.classList.toggle("done");
        renderMandala();
        renderOverview();
      });
      pop.appendChild(row);
    });
    const editBtn = document.createElement("button");
    editBtn.className = "checklist-edit-btn";
    editBtn.textContent = "✏ 编辑清单";
    editBtn.addEventListener("click", () => {
      closeChecklistPopover();
      openTaskDialog(period, cell);
    });
    pop.appendChild(editBtn);
    document.body.appendChild(pop);
    // 定位到锚点附近
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      pop.style.position = "fixed";
      let top = r.bottom + 4;
      let left = r.left;
      // 防止溢出右侧
      const popW = Math.max(160, pop.offsetWidth);
      if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
      if (left < 8) left = 8;
      if (top + pop.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - pop.offsetHeight - 4);
      pop.style.top = top + "px";
      pop.style.left = left + "px";
    }
    activePopover = pop;
    // 点击外部关闭
    setTimeout(() => {
      document.addEventListener("click", closeChecklistPopoverOnOutside, true);
    }, 0);
  }
  function closeChecklistPopoverOnOutside(e) {
    if (activePopover && !activePopover.contains(e.target) && !e.target.classList.contains("cell-checklist-badge")) {
      closeChecklistPopover();
    }
  }
  function closeChecklistPopover() {
    if (activePopover) { activePopover.remove(); activePopover = null; }
    document.removeEventListener("click", closeChecklistPopoverOnOutside, true);
  }

  // ---------- 时辰导航 ----------
  el.prevPeriod.addEventListener("click", () => {
    state.activePeriod = (state.activePeriod - 1 + PERIOD_COUNT) % PERIOD_COUNT; renderAll();
  });
  el.nextPeriod.addEventListener("click", () => {
    state.activePeriod = (state.activePeriod + 1) % PERIOD_COUNT; renderAll();
  });
  // 记录页时辰导航（与计划页同步）
  if (el.prevPeriodR) el.prevPeriodR.addEventListener("click", () => {
    state.activePeriod = (state.activePeriod - 1 + PERIOD_COUNT) % PERIOD_COUNT; renderAll();
  });
  if (el.nextPeriodR) el.nextPeriodR.addEventListener("click", () => {
    state.activePeriod = (state.activePeriod + 1) % PERIOD_COUNT; renderAll();
  });

  // ---------- 天地人三才切换 ----------
  if (el.realmSwitcher) {
    el.realmSwitcher.dataset.active = "plan";
    el.realmSwitcher.querySelectorAll(".realm-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.realm;
        const order = ["plan", "record", "review"];
        const reverse = order.indexOf(target) < order.indexOf(state.realm);
        setRealm(target, reverse);
      });
    });
    // 上下滑切换三才（在切换器条上）
    let sX = 0, sY = 0, sT = 0, tracking = false;
    el.realmSwitcher.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      sX = e.touches[0].clientX; sY = e.touches[0].clientY; sT = Date.now();
      tracking = true;
    }, { passive: true });
    el.realmSwitcher.addEventListener("touchend", (e) => {
      if (!tracking) return;
      tracking = false;
      const dy = e.changedTouches[0].clientY - sY;
      const dx = e.changedTouches[0].clientX - sX;
      const dt = Date.now() - sT;
      if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) && dt < 500) {
        const order = ["plan", "record", "review"];
        const idx = order.indexOf(state.realm);
        const next = dy < 0 ? Math.min(idx + 1, 2) : Math.max(idx - 1, 0);
        if (next !== idx) setRealm(order[next], next < idx);
      }
    }, { passive: true });
  }
  // 复盘按钮
  if (el.aiReviewBtn) el.aiReviewBtn.addEventListener("click", generateAiReview);
  if (el.clearReviewBtn) el.clearReviewBtn.addEventListener("click", () => {
    if (!confirm("清空今日复盘内容？")) return;
    clearDayReview(state.currentDate);
    renderReview();
    toast("复盘已清空", "info");
  });
  // 导出复盘
  if (el.exportReviewBtn) el.exportReviewBtn.addEventListener("click", () => {
    const review = getDayReview(state.currentDate);
    const stats = computeReviewStats();
    const date = state.currentDate;
    const dayTasks = state.tasks[date] || {};
    const dayRecords = state.records[date] || {};
    const planLines = [], recordLines = [];
    for (let p = 0; p < PERIOD_COUNT; p++) {
      for (let c = 0; c < CELLS_PER_PERIOD; c++) {
        const key = p + "-" + c;
        const range = getCellRange(p, c);
        const time = `${secondsToHHMM(range.start)}-${secondsToHHMM(range.end)}`;
        const tasks = (dayTasks[key] || []).map((t) => taskText(t));
        const rec = dayRecords[key];
        if (tasks.length) planLines.push(`  [${time}] ${tasks.join("; ")}`);
        if (rec && (rec.actual || rec.spent)) {
          recordLines.push(`  [${time}] 花费:${rec.spent || "-"} 实际:${rec.actual || "-"}${rec.note ? " 备注:" + rec.note : ""}`);
        }
      }
    }
    const md = `# 曼陀罗时辰 · 复盘 ${date}

## 📊 统计
- 计划格数: ${stats.plannedCells}
- 已记录: ${stats.recordedCells}
- 已完成: ${stats.doneCount} (完成率 ${stats.completionRate}%)
- 吻合率: ${stats.matchRate}%
- 总花费时间: ${stats.totalSpentText}

## 📖 计划
${planLines.join("\n") || "  （无）"}

## 📝 记录
${recordLines.join("\n") || "  （无）"}

## 💡 AI 复盘
${review ? (review.summary || "") : "（未生成）"}

${review && review.insights ? "### 洞察\n" + review.insights.map((i) => `- ${i}`).join("\n") : ""}

${review && review.suggestions ? "### 建议\n" + review.suggestions.map((i) => `- ${i}`).join("\n") : ""}

${review && review.highlights ? "### 亮点\n" + review.highlights.map((i) => `- ${i}`).join("\n") : ""}

## ✍️ 我的反思
${review && review.userNotes ? review.userNotes : "（无）"}
`;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mandala-review-${date}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("复盘已导出为 Markdown", "success");
  });
  // 记录页工具栏
  if (el.syncPlanBtn) el.syncPlanBtn.addEventListener("click", () => {
    const period = state.activePeriod;
    // 预计算将同步的格子（计划存在 + 无实际记录）
    const pending = [];
    const skippedDone = [];
    const skippedEmpty = [];
    for (let cell = 0; cell < CELLS_PER_PERIOD; cell++) {
      const planTasks = getCellTasks(period, cell);
      const existing = getCellRecord(period, cell);
      if (!planTasks.length) { skippedEmpty.push(cell); continue; }
      if (existing && existing.actual) { skippedDone.push(cell); continue; }
      const range = getCellRange(period, cell);
      pending.push({
        cell,
        time: `${secondsToHHMM(range.start)}-${secondsToHHMM(range.end)}`,
        text: planTasks.map((t) => taskText(t)).join("; "),
      });
    }
    if (!pending.length) {
      toast(skippedDone.length ? "本时辰计划均已记录，无需同步" : "本时辰无计划可同步", "info");
      return;
    }
    // 预览确认弹窗
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay sync-confirm-overlay";
    overlay.style.cssText = "position:fixed;inset:0;background:var(--overlay);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;";
    const dialog = document.createElement("div");
    dialog.className = "sync-confirm-dialog";
    dialog.style.cssText = "background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;max-width:460px;width:100%;max-height:90vh;overflow:auto;animation:fadeUp 0.25s ease;";
    const listHtml = pending.map((p, i) => `
      <li class="sync-item" style="display:flex;gap:8px;padding:8px 10px;border-radius:6px;background:var(--bg-tertiary);margin-bottom:6px;align-items:flex-start;">
        <span class="sync-idx" style="flex-shrink:0;width:20px;height:20px;border-radius:50%;background:var(--accent);color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center;margin-top:1px;">${i + 1}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px;">⏱ ${p.time}</div>
          <div style="font-size:13px;color:var(--text-primary);word-break:break-word;">${escapeHtml(p.text)}</div>
        </div>
      </li>`).join("");
    const skipInfo = (skippedDone.length || skippedEmpty.length)
      ? `<div style="font-size:11px;color:var(--text-muted);margin-top:10px;padding:8px;background:var(--bg-hover);border-radius:6px;">${
        skippedDone.length ? `✓ 已有记录跳过 ${skippedDone.length} 格` : ""
      }${skippedDone.length && skippedEmpty.length ? " · " : ""}${
        skippedEmpty.length ? `○ 无计划跳过 ${skippedEmpty.length} 格` : ""
      }</div>` : "";
    dialog.innerHTML = `
      <h3 style="font-size:15px;margin-bottom:6px;color:var(--accent-light);">⬇ 同步计划到记录</h3>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">将以下 <b style="color:var(--accent-light);">${pending.length}</b> 格计划任务复制为已完成记录（已记录的格子保持不变）。</p>
      <ul style="list-style:none;padding:0;margin:0;max-height:40vh;overflow:auto;">${listHtml}</ul>
      ${skipInfo}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button id="syncCancel" style="padding:8px 14px;border-radius:6px;background:var(--bg-tertiary);color:var(--text-secondary);font-size:12px;">取消</button>
        <button id="syncOk" style="padding:8px 18px;border-radius:6px;background:linear-gradient(135deg,var(--accent),var(--accent-light));color:#fff;font-weight:600;font-size:12px;">✓ 确认同步 ${pending.length} 格</button>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const close = () => {
      overlay.style.animation = "toastOut 0.2s ease forwards";
      setTimeout(() => overlay.remove(), 200);
    };
    dialog.querySelector("#syncCancel").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    dialog.querySelector("#syncOk").addEventListener("click", () => {
      let count = 0;
      for (const p of pending) {
        const planTasks = getCellTasks(period, p.cell);
        setCellRecord(period, p.cell, {
          spent: "~" + Math.round(SECONDS_PER_CELL / 60) + "分钟",
          actual: planTasks.map((t) => taskText(t)).join("; "),
          note: ""
        });
        count++;
      }
      renderRecord();
      toast(`已同步 ${count} 格计划到记录`, "success");
      close();
    });
  });
  if (el.clearPeriodRecordBtn) el.clearPeriodRecordBtn.addEventListener("click", () => {
    if (!confirm("清空本时辰所有记录？")) return;
    const period = state.activePeriod;
    if (!state.records[state.currentDate]) return;
    for (let cell = 0; cell < CELLS_PER_PERIOD; cell++) {
      delete state.records[state.currentDate][period + "-" + cell];
    }
    save(RECORD_KEY, state.records);
    renderRecord();
    toast("本时辰记录已清空", "info");
  });
  if (el.clearDayRecordBtn) el.clearDayRecordBtn.addEventListener("click", () => {
    if (!confirm("清空今日所有记录？（不影响计划和复盘）")) return;
    delete state.records[state.currentDate];
    save(RECORD_KEY, state.records);
    renderRecord();
    toast("今日记录已清空", "info");
  });
  if (el.goReviewFromRecord) el.goReviewFromRecord.addEventListener("click", () => {
    setRealm("review");
  });
  if (el.goRecordFromPlan) el.goRecordFromPlan.addEventListener("click", () => setRealm("record"));
  if (el.goReviewFromPlan) el.goReviewFromPlan.addEventListener("click", () => setRealm("review"));
  // 底部浮动三才切换条
  if (el.realmFab) {
    el.realmFab.dataset.active = "plan";
    el.realmFab.querySelectorAll(".realm-fab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.realm;
        const order = ["plan", "record", "review"];
        const reverse = order.indexOf(target) < order.indexOf(state.realm);
        setRealm(target, reverse);
      });
    });
  }
  // 三才页左右滑动手势切换
  if (el.realmContainer) {
    let sx = 0, sy = 0, st = 0, tracking = false;
    el.realmContainer.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
      tracking = true;
    }, { passive: true });
    el.realmContainer.addEventListener("touchend", (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      const dt = Date.now() - st;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 500) {
        const order = ["plan", "record", "review"];
        const idx = order.indexOf(state.realm);
        const next = dx < 0 ? Math.min(idx + 1, 2) : Math.max(idx - 1, 0);
        if (next !== idx) setRealm(order[next], next < idx);
      }
    }, { passive: true });
  }

  // ---------- 设置弹窗 ----------
  el.settingsBtn.addEventListener("click", () => {
    el.apiUrl.value = state.settings.apiUrl || "";
    el.apiKey.value = state.settings.apiKey || "";
    el.apiModel.value = state.settings.apiModel || "gpt-4o-mini";
    el.syncUrl.value = state.settings.syncUrl || "";
    el.syncEnabled.checked = !!state.settings.syncEnabled;
    el.syncStatus.textContent = state.settings.syncEnabled ? "已启用 → " + (state.settings.syncUrl || "/api/sync") : "未启用";
    el.mcpEnabled.checked = !!state.settings.mcpEnabled;
    el.mcpConfig.value = state.settings.mcpConfig || "";
    el.skillFileName.textContent = state.settings.customSkill ? "已加载自定义技能" : "未选择";
    el.promptFileName.textContent = state.settings._promptFileName || "未选择";
    el.mcpFileName.textContent = state.settings._mcpFileName || "未选择";
    el.searchEnabled.checked = !!state.settings.searchEnabled;
    el.searchProvider.value = state.settings.searchProvider || "wikipedia";
    updateSearchKeyVisibility();
    el.searchApiKey.value = state.settings.searchApiKey || "";
    el.searchAutoQuery.checked = state.settings.searchAutoQuery !== false;
    el.notifyLeadMin.value = String(state.settings.notifyLeadMin || 0);
    el.accentColor.value = state.settings.accentColor || "#7c5cff";
    el.soundEnabled.checked = !!state.settings.soundEnabled;
    renderAccentPresets();
    renderCategoryList();
    renderSkillList();
    renderPlatformGrid();
    validateMcp();
    updateStorageInfo();
    el.settingsDialog.showModal();
  });

  el.closeSettings.addEventListener("click", () => el.settingsDialog.close());
  el.settingsDialog.addEventListener("click", (e) => { if (e.target === el.settingsDialog) el.settingsDialog.close(); });

  document.querySelectorAll(".settings-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      document.querySelectorAll(".settings-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".settings-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`.settings-panel[data-panel="${target}"]`).classList.add("active");
    });
  });

  // ---------- 强调色交互 ----------
  function renderAccentPresets() {
    el.accentPresets.innerHTML = "";
    DEFAULT_ACCENTS.forEach((c) => {
      const dot = document.createElement("button");
      dot.className = "accent-preset-dot";
      dot.style.background = c;
      dot.title = c;
      dot.setAttribute("aria-label", "选择强调色 " + c);
      dot.addEventListener("click", () => {
        el.accentColor.value = c;
        applyAccentColor(c);
      });
      el.accentPresets.appendChild(dot);
    });
  }
  el.accentColor.addEventListener("input", () => applyAccentColor(el.accentColor.value));
  el.resetAccentBtn.addEventListener("click", () => {
    el.accentColor.value = "#7c5cff";
    applyAccentColor("");
    toast("已恢复默认强调色", "info");
  });
  el.testSoundBtn.addEventListener("click", () => {
    const prev = state.settings.soundEnabled;
    state.settings.soundEnabled = true;
    playDoneSound();
    state.settings.soundEnabled = prev;
  });

  function renderSkillList() {
    el.skillList.innerHTML = "";
    PRESET_SKILLS.forEach((skill) => {
      const enabled = state.settings.skills.includes(skill.id);
      const item = document.createElement("label");
      item.className = "skill-item" + (enabled ? " enabled" : "");
      item.innerHTML = `
        <input type="checkbox" class="skill-check" ${enabled ? "checked" : ""} data-id="${skill.id}" />
        <div class="skill-info">
          <div class="skill-name">${escapeHtml(skill.name)}</div>
          <div class="skill-desc">${escapeHtml(skill.desc)}</div>
        </div>`;
      const cb = item.querySelector(".skill-check");
      cb.addEventListener("change", () => {
        const id = cb.dataset.id;
        let skills = state.settings.skills.slice();
        if (cb.checked) { if (!skills.includes(id)) skills.push(id); item.classList.add("enabled"); }
        else { skills = skills.filter((s) => s !== id); item.classList.remove("enabled"); }
        state.settings.skills = skills;
        save(SETTINGS_KEY, state.settings);
      });
      el.skillList.appendChild(item);
    });
  }

  // ---------- AI 平台预设 ----------
  // 覆盖国内外主流云端 + 本地服务，均使用 OpenAI 兼容的 /v1/chat/completions 接口
  const AI_PLATFORMS = [
    { id: "openai",      name: "OpenAI GPT",       emoji: "🟢", url: "https://api.openai.com/v1/chat/completions",                       model: "gpt-4o-mini",                  type: "cloud", alt: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
    { id: "claude",      name: "Anthropic Claude", emoji: "🟠", url: "https://api.anthropic.com/v1/chat/completions",                     model: "claude-3-5-sonnet-20241022",   type: "cloud", alt: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"] },
    { id: "deepseek",    name: "DeepSeek 深度求索", emoji: "🔵", url: "https://api.deepseek.com/v1/chat/completions",                      model: "deepseek-chat",                type: "cloud", alt: ["deepseek-chat", "deepseek-reasoner"] },
    { id: "glm",         name: "智谱 GLM",          emoji: "🟣", url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",             model: "glm-4-flash",                  type: "cloud", alt: ["glm-4-flash", "glm-4", "glm-4-air", "glm-4-plus"] },
    { id: "qwen",        name: "通义千问 Qwen",     emoji: "🟡", url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-turbo",                  type: "cloud", alt: ["qwen-turbo", "qwen-plus", "qwen-max", "qwen-long"] },
    { id: "moonshot",    name: "Moonshot Kimi",     emoji: "🌙", url: "https://api.moonshot.cn/v1/chat/completions",                      model: "moonshot-v1-8k",               type: "cloud", alt: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"] },
    { id: "yi",          name: "零一万物 Yi",       emoji: "🟢", url: "https://api.lingyiwanwu.com/v1/chat/completions",                  model: "yi-large",                     type: "cloud", alt: ["yi-large", "yi-medium", "yi-spark"] },
    { id: "baichuan",    name: "百川 Baichuan",     emoji: "🐉", url: "https://api.baichuan-ai.com/v1/chat/completions",                  model: "Baichuan4",                    type: "cloud", alt: ["Baichuan4", "Baichuan3-Turbo", "Baichuan2-53B-Chat"] },
    { id: "minimax",     name: "MiniMax",           emoji: "🟥", url: "https://api.minimax.chat/v1/text/chatcompletion_v2",              model: "abab6.5s-chat",                type: "cloud", alt: ["abab6.5s-chat", "abab6.5-chat", "abab5.5s-chat"] },
    { id: "siliconflow", name: "硅基流动",          emoji: "🔮", url: "https://api.siliconflow.cn/v1/chat/completions",                   model: "Qwen/Qwen2.5-7B-Instruct",     type: "free",  alt: ["Qwen/Qwen2.5-7B-Instruct", "deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"] },
    { id: "stepfun",     name: "阶跃星辰 Step",     emoji: "⭐", url: "https://api.stepfun.com/v1/chat/completions",                     model: "step-1-8k",                    type: "cloud", alt: ["step-1-8k", "step-1-32k", "step-1-128k", "step-2-16k"] },
    { id: "spark",       name: "讯飞星火",          emoji: "✨", url: "https://spark-api-open.xf-yun.com/v1/chat/completions",            model: "generalv3.5",                  type: "cloud", alt: ["generalv3.5", "generalv3", "spark-v3.5"] },
    { id: "groq",        name: "Groq",              emoji: "⚡", url: "https://api.groq.com/openai/v1/chat/completions",                  model: "llama-3.1-8b-instant",         type: "free",  alt: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "mixtral-8x7b-32768"] },
    { id: "openrouter",  name: "OpenRouter",        emoji: "🛰", url: "https://openrouter.ai/api/v1/chat/completions",                   model: "openai/gpt-4o-mini",           type: "cloud", alt: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "google/gemini-flash-1.5"] },
    { id: "together",    name: "Together AI",       emoji: "🤝", url: "https://api.together.xyz/v1/chat/completions",                    model: "meta-llama/Llama-3-8b-chat-hf", type: "cloud", alt: ["meta-llama/Llama-3-8b-chat-hf", "meta-llama/Llama-3-70b-chat-hf"] },
    { id: "ollama",      name: "Ollama 本地",       emoji: "🦙", url: "http://localhost:11434/v1/chat/completions",                      model: "qwen2.5:7b",                   type: "local", alt: ["qwen2.5:7b", "llama3.1:8b", "phi3:mini", "gemma2:9b"] },
    { id: "lmstudio",    name: "LM Studio 本地",    emoji: "🎧", url: "http://localhost:1234/v1/chat/completions",                       model: "local-model",                  type: "local", alt: ["local-model"] },
    { id: "vllm",        name: "vLLM 本地",         emoji: "🏭", url: "http://localhost:8000/v1/chat/completions",                       model: "meta-llama/Llama-3-8b-chat-hf", type: "local", alt: ["meta-llama/Llama-3-8b-chat-hf"] },
    { id: "hermes",      name: "Hermes 智能体",     emoji: "🪽", url: "http://localhost:8002/v1/chat/completions",                       model: "hermes",                       type: "local", alt: ["hermes", "gpt-4o-mini", "qwen2.5:7b"] },
    { id: "custom",      name: "自定义",            emoji: "⚙️", url: "",                                                                 model: "",                             type: "cloud", alt: [] },
  ];

  const PLATFORM_TYPE_LABEL = { cloud: "云端", local: "本地", free: "免费额度" };

  function matchPlatformId() {
    const url = (state.settings.apiUrl || "").trim();
    if (!url) return "custom";
    // 精确匹配优先
    const exact = AI_PLATFORMS.find((p) => p.id !== "custom" && p.url === url);
    if (exact) return exact.id;
    // 前缀匹配（用户改了模型但没改地址）
    const prefix = AI_PLATFORMS.find((p) => p.id !== "custom" && p.url && url.startsWith(p.url.replace(/\/chat\/completions.*$/, "")));
    return prefix ? prefix.id : "custom";
  }

  function renderPlatformGrid() {
    const grid = el.platformGrid;
    if (!grid) return;
    const currentId = matchPlatformId();
    grid.innerHTML = "";
    AI_PLATFORMS.forEach((p) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "platform-card" + (p.id === currentId ? " selected" : "");
      card.dataset.id = p.id;
      const tagText = PLATFORM_TYPE_LABEL[p.type] || "";
      card.innerHTML = `
        <div class="platform-name"><span class="platform-emoji">${p.emoji}</span>${escapeHtml(p.name)}</div>
        <div class="platform-meta">${p.id === "custom" ? "手动填写地址/模型" : escapeHtml(p.model)}</div>
        ${tagText ? `<span class="platform-tag ${p.type}">${tagText}</span>` : ""}
      `;
      card.addEventListener("click", () => applyPlatform(p));
      grid.appendChild(card);
    });
    const countEl = document.getElementById("platformCount");
    if (countEl) countEl.textContent = String(AI_PLATFORMS.length - 1);
    // 渲染备选模型
    renderModelChips(currentId);
  }

  function renderModelChips(platformId) {
    const group = document.getElementById("modelAlternativesGroup");
    const chipsEl = document.getElementById("modelChips");
    if (!group || !chipsEl) return;
    const p = AI_PLATFORMS.find((x) => x.id === platformId);
    if (!p || !p.alt || p.alt.length === 0) {
      group.style.display = "none";
      return;
    }
    group.style.display = "";
    const currentModel = (el.apiModel.value || "").trim();
    chipsEl.innerHTML = "";
    p.alt.forEach((m) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "model-chip" + (m === currentModel ? " active" : "");
      chip.textContent = m;
      chip.addEventListener("click", () => {
        el.apiModel.value = m;
        state.settings.apiModel = m;
        save(SETTINGS_KEY, state.settings);
        renderModelChips(platformId);
        renderChatBadges();
      });
      chipsEl.appendChild(chip);
    });
  }

  function applyPlatform(p) {
    if (p.id !== "custom") {
      if (p.url) el.apiUrl.value = p.url;
      if (p.model) el.apiModel.value = p.model;
      state.settings.apiUrl = p.url;
      state.settings.apiModel = p.model;
    }
    // 本地部署通常无需 key，给出提示
    const isLocal = p.type === "local";
    el.apiKeyOptional.textContent = isLocal ? "（本地可留空）" : "（必填）";
    el.apiKeyHint.textContent = isLocal
      ? "本地部署无需 API Key，确保服务已启动"
      : "在对应平台控制台获取 API Key";
    save(SETTINGS_KEY, state.settings);
    renderPlatformGrid();
    renderChatBadges();
    toast(`已切换到 ${p.name}`, "success");
  }

  // 手动编辑地址/模型时，实时刷新卡片选中状态与备选模型
  if (el.apiUrl) el.apiUrl.addEventListener("input", () => renderPlatformGrid());
  if (el.apiModel) el.apiModel.addEventListener("input", () => {
    const id = matchPlatformId();
    renderModelChips(id);
  });

  // 搜索源切换时，动态显隐 API Key 输入框
  function updateSearchKeyVisibility() {
    const provider = SEARCH_PROVIDERS[el.searchProvider.value];
    const needsKey = provider?.needsKey !== false;
    const keyGroup = document.getElementById("searchApiKeyGroup");
    const hint = document.getElementById("searchProviderHint");
    const keyOptional = document.getElementById("searchKeyOptional");
    if (keyGroup) keyGroup.style.display = needsKey ? "" : "none";
    if (hint) hint.textContent = needsKey
      ? "在对应平台控制台获取 API Key"
      : "✓ 当前为免费搜索源，无需 API Key 即可使用";
    if (keyOptional) keyOptional.textContent = needsKey ? "（必填）" : "（免费源可留空）";
  }
  if (el.searchProvider) el.searchProvider.addEventListener("change", updateSearchKeyVisibility);

  // ---------- 提示词分类管理（按状态机环节分组） ----------
  function renderCategoryList() {
    const cats = state.settings.promptCategories || [];
    const activeId = state.settings.activePromptId;
    const activeCat = cats.find((c) => c.id === activeId) || cats[0] || {};
    el.activeCategoryName.textContent = activeCat.name || "—";

    // 渲染状态机环节列表（主线 + 分支分组）
    const stageList = document.getElementById("stageList");
    if (stageList) {
      stageList.innerHTML = "";
      const stageLabels = { idle: "① 待命", gathering: "② 收集", confirming: "③ 确认", project_breakdown: "🔗 分支", done: "④ 完成" };

      // 主线环节（按顺序：待命→收集→确认→完成）
      STAGE_ORDER.forEach((stage) => {
        const cat = cats.find((c) => c.stage === stage);
        if (!cat) return;
        const item = document.createElement("div");
        item.className = "stage-item" + (cat.id === activeId ? " active" : "");
        item.innerHTML = `
          <div class="stage-item-info">
            <div class="stage-item-name">${escapeHtml(cat.name)} <span class="stage-badge">${stageLabels[stage] || stage}</span></div>
            <div class="stage-item-desc">${escapeHtml(cat.desc || "")}</div>
          </div>
          <div class="stage-item-actions">
            <button class="stage-item-btn" data-edit="${cat.id}" title="编辑">✏</button>
          </div>`;
        const editBtn = item.querySelector("[data-edit]");
        if (editBtn) editBtn.addEventListener("click", (e) => { e.stopPropagation(); openCategoryEditor(cat.id); });
        item.addEventListener("click", () => {
          state.settings.activePromptId = cat.id;
          save(SETTINGS_KEY, state.settings);
          renderCategoryList();
          renderChatBadges();
        });
        stageList.appendChild(item);
      });

      // 分支环节（项目拆解，独立分组）
      const branchCat = cats.find((c) => c.stage === STAGE_BRANCH);
      if (branchCat) {
        const divider = document.createElement("div");
        divider.className = "stage-divider";
        divider.innerHTML = '<span class="stage-divider-text">分支环节（可选）</span>';
        stageList.appendChild(divider);

        const item = document.createElement("div");
        item.className = "stage-item branch-item" + (branchCat.id === activeId ? " active" : "");
        item.innerHTML = `
          <div class="stage-item-info">
            <div class="stage-item-name">${escapeHtml(branchCat.name)} <span class="stage-badge branch">${stageLabels[STAGE_BRANCH] || STAGE_BRANCH}</span></div>
            <div class="stage-item-desc">${escapeHtml(branchCat.desc || "")}</div>
          </div>
          <div class="stage-item-actions">
            <button class="stage-item-btn" data-edit="${branchCat.id}" title="编辑">✏</button>
          </div>`;
        const editBtn = item.querySelector("[data-edit]");
        if (editBtn) editBtn.addEventListener("click", (e) => { e.stopPropagation(); openCategoryEditor(branchCat.id); });
        item.addEventListener("click", () => {
          state.settings.activePromptId = branchCat.id;
          save(SETTINGS_KEY, state.settings);
          renderCategoryList();
          renderChatBadges();
        });
        stageList.appendChild(item);
      }
    }

    // 渲染附加提示词列表
    const customList = document.getElementById("customCatList");
    if (customList) {
      customList.innerHTML = "";
      const customCats = cats.filter((c) => !c.stage);
      if (customCats.length === 0) {
        customList.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px;">暂无附加提示词</div>';
      } else {
        customCats.forEach((cat) => {
          const item = document.createElement("div");
          item.className = "stage-item" + (cat.id === activeId ? " active" : "");
          item.innerHTML = `
            <div class="stage-item-info">
              <div class="stage-item-name">${escapeHtml(cat.name)}</div>
              <div class="stage-item-desc">${escapeHtml(cat.desc || "")}</div>
            </div>
            <div class="stage-item-actions">
              <button class="stage-item-btn" data-edit="${cat.id}" title="编辑">✏</button>
              <button class="stage-item-btn" data-del="${cat.id}" title="删除">🗑</button>
            </div>`;
          const editBtn = item.querySelector("[data-edit]");
          if (editBtn) editBtn.addEventListener("click", (e) => { e.stopPropagation(); openCategoryEditor(cat.id); });
          const delBtn = item.querySelector("[data-del]");
          if (delBtn) delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!confirm(`删除附加提示词「${cat.name}」？`)) return;
            const idx = cats.findIndex((c) => c.id === cat.id);
            if (idx >= 0) cats.splice(idx, 1);
            if (state.settings.activePromptId === cat.id) state.settings.activePromptId = "stage_idle";
            save(SETTINGS_KEY, state.settings);
            renderCategoryList();
            renderChatBadges();
            toast("已删除", "info");
          });
          customList.appendChild(item);
        });
      }
    }
  }

  let editingCategoryId = null;
  let editingSelectedSkills = [];

  function openCategoryEditor(catId) {
    const cat = (state.settings.promptCategories || []).find((c) => c.id === catId);
    if (!cat) { toast("未找到分类", "error"); return; }
    editingCategoryId = catId;
    el.categoryEditorTitle.textContent = cat.isSystem ? `编辑环节：${cat.name}` : "编辑附加提示词";
    el.categoryNameInput.value = cat.name || "";
    el.categoryDescInput.value = cat.desc || "";
    el.categoryContentInput.value = cat.content || "";
    const summaryInput = document.getElementById("categorySummaryInput");
    if (summaryInput) summaryInput.value = cat.summaryTemplate || "";
    // 环节总结模板字段仅对系统环节显示
    const summaryGroup = document.getElementById("summaryTemplateGroup");
    if (summaryGroup) summaryGroup.style.display = cat.isSystem ? "block" : "none";
    // Skill 多选 chips
    editingSelectedSkills = (cat.recommendedSkills || []).slice();
    renderSkillChips();
    el.categoryEditorOverlay.classList.add("show");
  }

  function renderSkillChips() {
    const container = document.getElementById("categorySkillChips");
    if (!container) return;
    container.innerHTML = "";
    PRESET_SKILLS.forEach((skill) => {
      const selected = editingSelectedSkills.includes(skill.id);
      const chip = document.createElement("button");
      chip.className = "skill-chip" + (selected ? " selected" : "");
      chip.textContent = skill.name;
      chip.addEventListener("click", () => {
        if (editingSelectedSkills.includes(skill.id)) {
          editingSelectedSkills = editingSelectedSkills.filter((s) => s !== skill.id);
        } else {
          editingSelectedSkills.push(skill.id);
        }
        renderSkillChips();
      });
      container.appendChild(chip);
    });
  }

  el.addCategoryBtn.addEventListener("click", () => {
    editingCategoryId = null;
    el.categoryEditorTitle.textContent = "新增附加提示词";
    el.categoryNameInput.value = "";
    el.categoryDescInput.value = "";
    el.categoryContentInput.value = "";
    const summaryInput = document.getElementById("categorySummaryInput");
    if (summaryInput) summaryInput.value = "";
    const summaryGroup = document.getElementById("summaryTemplateGroup");
    if (summaryGroup) summaryGroup.style.display = "none";
    editingSelectedSkills = [];
    renderSkillChips();
    el.categoryEditorOverlay.classList.add("show");
  });
  el.cancelCategoryBtn.addEventListener("click", () => { el.categoryEditorOverlay.classList.remove("show"); });
  el.categoryEditorOverlay.addEventListener("click", (e) => {
    if (e.target === el.categoryEditorOverlay) el.categoryEditorOverlay.classList.remove("show");
  });
  el.saveCategoryBtn.addEventListener("click", () => {
    const name = el.categoryNameInput.value.trim();
    const content = el.categoryContentInput.value.trim();
    if (!name || !content) { toast("名称和内容不能为空", "error"); return; }
    const summaryInput = document.getElementById("categorySummaryInput");
    const summaryTemplate = summaryInput ? summaryInput.value.trim() : "";
    if (editingCategoryId) {
      const cat = state.settings.promptCategories.find((c) => c.id === editingCategoryId);
      if (cat) {
        cat.name = name; cat.desc = el.categoryDescInput.value.trim();
        cat.content = content; cat.recommendedSkills = editingSelectedSkills.slice();
        if (cat.isSystem) cat.summaryTemplate = summaryTemplate;
      }
    } else {
      const newCat = {
        id: "custom_" + Date.now(),
        stage: "",
        name, desc: el.categoryDescInput.value.trim(),
        isSystem: false, content, recommendedSkills: editingSelectedSkills.slice(),
      };
      state.settings.promptCategories.push(newCat);
    }
    save(SETTINGS_KEY, state.settings);
    el.categoryEditorOverlay.classList.remove("show");
    renderCategoryList();
    renderChatBadges();
    toast("已保存", "success");
  });
  // 恢复默认
  const resetBtn = document.getElementById("resetCategoryBtn");
  if (resetBtn) resetBtn.addEventListener("click", () => {
    if (!editingCategoryId) { toast("仅可恢复预设环节", "error"); return; }
    const preset = PRESET_PROMPT_CATEGORIES.find((c) => c.id === editingCategoryId);
    if (!preset) { toast("非预设环节，无法恢复", "error"); return; }
    if (!confirm(`恢复「${preset.name}」为默认内容？当前自定义将丢失。`)) return;
    const cat = state.settings.promptCategories.find((c) => c.id === editingCategoryId);
    if (cat) {
      cat.name = preset.name; cat.desc = preset.desc;
      cat.content = preset.content; cat.recommendedSkills = preset.recommendedSkills.slice();
      cat.summaryTemplate = preset.summaryTemplate;
    }
    save(SETTINGS_KEY, state.settings);
    openCategoryEditor(editingCategoryId); // 刷新编辑器内容
    renderCategoryList();
    toast("已恢复默认", "info");
  });

  el.testSearchBtn.addEventListener("click", async () => {
    // 先同步当前输入到 state
    state.settings.searchEnabled = el.searchEnabled.checked;
    state.settings.searchProvider = el.searchProvider.value;
    updateSearchKeyVisibility();
    state.settings.searchApiKey = el.searchApiKey.value;
    state.settings.searchAutoQuery = el.searchAutoQuery.checked;
    await testSearch();
  });

  el.skillUploadBtn.addEventListener("click", () => el.skillFile.click());
  el.skillFile.addEventListener("change", async () => {
    const file = el.skillFile.files[0]; if (!file) return;
    state.settings.customSkill = await file.text();
    state.settings._skillFileName = file.name;
    el.skillFileName.textContent = file.name;
    save(SETTINGS_KEY, state.settings);
    toast("技能文件已加载", "success");
  });

  el.promptUploadBtn.addEventListener("click", () => el.promptFile.click());
  el.promptFile.addEventListener("change", async () => {
    const file = el.promptFile.files[0]; if (!file) return;
    const content = await file.text();
    // 载入到当前激活分类
    const cat = (state.settings.promptCategories || []).find((c) => c.id === state.settings.activePromptId);
    if (cat) {
      cat.content = content;
      save(SETTINGS_KEY, state.settings);
      renderCategoryList();
      toast(`已载入到分类「${cat.name}」`, "success");
    }
    state.settings._promptFileName = file.name;
    el.promptFileName.textContent = file.name;
  });

  el.mcpUploadBtn.addEventListener("click", () => el.mcpFile.click());
  el.mcpFile.addEventListener("change", async () => {
    const file = el.mcpFile.files[0]; if (!file) return;
    el.mcpConfig.value = await file.text();
    state.settings._mcpFileName = file.name;
    el.mcpFileName.textContent = file.name;
    validateMcp();
    save(SETTINGS_KEY, state.settings);
    toast("MCP 配置已加载", "success");
  });

  function validateMcp() {
    const txt = el.mcpConfig.value.trim();
    if (!txt) { el.mcpStatus.textContent = "—"; el.mcpStatus.style.color = ""; return false; }
    try {
      const obj = JSON.parse(txt);
      const servers = obj.mcpServers || obj.servers || obj;
      const count = Object.keys(servers).length;
      el.mcpStatus.textContent = `✓ JSON 有效，${count} 个服务器`;
      el.mcpStatus.style.color = "var(--success)";
      return true;
    } catch (e) {
      el.mcpStatus.textContent = `✗ JSON 错误：${e.message}`;
      el.mcpStatus.style.color = "var(--danger)";
      return false;
    }
  }
  el.mcpConfig.addEventListener("input", validateMcp);

  el.saveSettings.addEventListener("click", () => {
    syncSettingsFromForm();
    el.settingsDialog.close();
    renderAll();
    toast("设置已保存", "success");
  });

  // 自动保存：表单字段变更时立即同步并持久化（无需点"保存设置"按钮）
  function syncSettingsFromForm() {
    state.settings.apiUrl = el.apiUrl.value.trim();
    state.settings.apiKey = el.apiKey.value.trim();
    state.settings.apiModel = el.apiModel.value.trim() || "gpt-4o-mini";
    state.settings.syncUrl = el.syncUrl.value.trim();
    state.settings.syncEnabled = el.syncEnabled.checked;
    state.settings.mcpEnabled = el.mcpEnabled.checked;
    state.settings.mcpConfig = el.mcpConfig.value;
    state.settings.searchEnabled = el.searchEnabled.checked;
    state.settings.searchProvider = el.searchProvider.value;
    state.settings.searchApiKey = el.searchApiKey.value;
    state.settings.searchAutoQuery = el.searchAutoQuery.checked;
    state.settings.notifyLeadMin = parseInt(el.notifyLeadMin.value, 10) || 0;
    state.settings.soundEnabled = el.soundEnabled.checked;
    state.settings.accentColor = el.accentColor.value !== "#7c5cff" ? el.accentColor.value : "";
    save(SETTINGS_KEY, state.settings);
    renderChatBadges();
  }
  // 监听所有设置字段变更（input/change），自动保存
  ["apiUrl", "apiKey", "apiModel", "mcpConfig", "searchApiKey", "notifyLeadMin", "accentColor"].forEach((id) => {
    const e = el[id];
    if (e) e.addEventListener("input", syncSettingsFromForm);
  });
  ["mcpEnabled", "searchEnabled", "searchProvider", "searchAutoQuery", "soundEnabled"].forEach((id) => {
    const e = el[id];
    if (e) e.addEventListener("change", syncSettingsFromForm);
  });

  // ---------- 数据管理 ----------
  function updateStorageInfo() {
    const dates = Object.keys(state.tasks);
    let totalCells = 0, totalTasks = 0;
    dates.forEach((d) => {
      const day = state.tasks[d];
      Object.keys(day).forEach((k) => { totalCells++; totalTasks += day[k].length; });
    });
    el.storageInfo.textContent = `${dates.length} 天 · ${totalCells} 个任务格 · ${totalTasks} 条任务`;
  }

  el.clearTodayData.addEventListener("click", () => {
    if (!confirm(`清空 ${state.currentDate} 的所有任务、记录与复盘？`)) return;
    delete state.tasks[state.currentDate];
    delete state.done[state.currentDate];
    delete state.checklists[state.currentDate];
    delete state.records[state.currentDate];
    delete state.reviews[state.currentDate];
    save(STORAGE_KEY, state.tasks);
    save(DONE_KEY, state.done);
    save(CHECKLIST_KEY, state.checklists);
    save(RECORD_KEY, state.records);
    save(REVIEW_KEY, state.reviews);
    renderAll();
    updateStorageInfo();
    toast("已清空当日（含记录与复盘）", "info");
  });

  el.clearAllData.addEventListener("click", () => {
    if (!confirm("清空所有日期的所有数据？此操作不可恢复！")) return;
    state.tasks = {}; state.done = {}; state.checklists = {}; state.repeats = {};
    state.records = {}; state.reviews = {};
    state.chatState = "idle";
    state.pendingPlan = null;
    state.userIntent = "";
    save(STORAGE_KEY, state.tasks);
    save(DONE_KEY, state.done);
    save(CHECKLIST_KEY, state.checklists);
    save(REPEAT_KEY, state.repeats);
    save(RECORD_KEY, state.records);
    save(REVIEW_KEY, state.reviews);
    localStorage.removeItem(CHAT_KEY);
    el.chatMessages.innerHTML = "";
    clearSuggestions();
    addBotMessage("所有数据已清空。");
    renderAll();
    updateStorageInfo();
    toast("已清空全部", "info");
  });

  // ---------- 对话徽章 ----------
  function renderChatBadges() {
    el.chatBadges.innerHTML = "";
    if (state.settings.apiUrl && state.settings.apiKey) addBadge("AI");
    else addBadge("本地");
    // 当前激活分类
    const cat = getActiveCategory();
    if (cat) addBadge(cat.name);
    state.settings.skills.forEach((id) => {
      const skill = PRESET_SKILLS.find((s) => s.id === id);
      if (skill) addBadge(skill.name);
    });
    if (state.settings.customPrompt) addBadge("提示词");
    if (state.settings.mcpEnabled && state.settings.mcpConfig) addBadge("MCP");
    if (state.settings.searchEnabled && (state.settings.searchApiKey || !SEARCH_PROVIDERS[state.settings.searchProvider]?.needsKey)) addBadge("🔍联网");
    // 同步刷新环节进度指示器
    renderStageProgress();
    // 同步更新分支按钮显隐
    updateBranchButtonVisibility();
  }

  // 更新分支按钮（返回主线）显隐
  function updateBranchButtonVisibility() {
    const returnBtn = document.querySelector(".chip-branch-return");
    const branchBtn = document.querySelector(".chip-branch");
    if (!returnBtn) return;
    const inBreakdown = state.chatState === "project_breakdown";
    returnBtn.style.display = inBreakdown ? "" : "none";
    if (branchBtn) branchBtn.classList.toggle("active", inBreakdown);
  }

  // ---------- 环节进度指示器（状态机可视化） ----------
  // 环节简短显示名（用于节点标签）
  const STAGE_SHORT_NAMES = {
    idle: "💤 待命",
    gathering: "📥 收集",
    confirming: "✅ 确认",
    project_breakdown: "🔗 拆解",
    done: "🎯 完成",
  };
  const STAGE_DESC = {
    idle: "等待你描述今日任务",
    gathering: "正在收集背景信息",
    confirming: "方案已就绪，待你确认",
    project_breakdown: "项目拆解中（分支环节）",
    done: "已规划完成",
  };

  let _lastRenderedStage = null;
  let stageNodesBuilt = false;

  function renderStageProgress() {
    if (!el.stageProgress) return;
    const curStage = state.chatState || "idle";
    const isBranch = curStage === STAGE_BRANCH;
    // 分支环节时进度条映射回主线位置（拆解完成后回到 confirming）
    const effectiveStage = isBranch ? "confirming" : curStage;
    // 仅在环节切换时触发闪烁动画与日志
    const isTransition = _lastRenderedStage !== null && _lastRenderedStage !== curStage;

    // 设置 data-stage 切换配色
    el.stageProgress.setAttribute("data-stage", curStage);

    // 构建节点（首次或环节列表变化时）
    if (!stageNodesBuilt) {
      el.stageNodes.innerHTML = "";
      STAGE_ORDER.forEach((st) => {
        const node = document.createElement("div");
        node.className = "stage-node";
        node.dataset.stage = st;
        node.innerHTML =
          '<div class="stage-node-dot"></div>' +
          '<div class="stage-node-label">' + (STAGE_SHORT_NAMES[st] || st) + '</div>';
        el.stageNodes.appendChild(node);
      });
      stageNodesBuilt = true;
    }

    // 计算进度：当前环节在主线 STAGE_ORDER 中的位置
    const idx = STAGE_ORDER.indexOf(effectiveStage);
    const total = STAGE_ORDER.length;
    // fill 宽度：到达当前节点中心
    const fillPercent = total > 1 ? (idx / (total - 1)) * 100 : 0;
    el.stageProgressFill.style.width = fillPercent + "%";

    // 更新各节点状态：passed / current
    const nodes = el.stageNodes.querySelectorAll(".stage-node");
    nodes.forEach((node) => {
      const st = node.dataset.stage;
      const nodeIdx = STAGE_ORDER.indexOf(st);
      node.classList.remove("passed", "current", "branch-active");
      if (nodeIdx < idx) node.classList.add("passed");
      else if (nodeIdx === idx) node.classList.add("current");
      // 分支环节激活时，confirming 节点显示分支状态
      if (isBranch && st === "confirming") {
        node.classList.remove("current");
        node.classList.add("branch-active");
      }
    });

    // 更新当前环节文字标签（分支环节特殊标记）+ 描述
    const cat = getStageCategory(curStage);
    let labelText = cat ? cat.name : (STAGE_SHORT_NAMES[curStage] || curStage);
    if (isBranch) labelText = "🔗 " + labelText;
    const desc = STAGE_DESC[curStage] || "";
    el.stageCurrentLabel.innerHTML = `<span class="stage-label-main">${escapeHtml(labelText)}</span>${desc ? `<span class="stage-label-desc">${escapeHtml(desc)}</span>` : ""}`;

    // 切换闪烁动画：移除再添加以重启动画
    if (isTransition) {
      el.stageProgress.classList.remove("transitioning");
      // 强制重排以重启动画
      void el.stageProgress.offsetWidth;
      el.stageProgress.classList.add("transitioning");
      console.log(`[状态机] 环节切换：${_lastRenderedStage} → ${curStage}`);
    }

    _lastRenderedStage = curStage;

    // 同步刷新拆解子步骤进度
    renderBreakdownSteps();
  }

  // ---------- 拆解环节子步骤进度（6 步细分可视化） ----------
  // 对应 stage_project_breakdown 提示词中的 6 步推进
  const BREAKDOWN_STEPS = [
    { step: 1, name: "识别模块", label: "识别主要模块", hint: "将项目目标拆分为主要学习/执行模块" },
    { step: 2, name: "确认清单", label: "确认模块清单", hint: "确认模块是否完整、调整优先级" },
    { step: 3, name: "逐模块细分", label: "逐模块细分", hint: "对每个模块继续细分（如 C语言→指针/结构体/内存管理）" },
    { step: 4, name: "组块压缩", label: "组块压缩", hint: "合并为可在 13 分钟格子内完成的单元" },
    { step: 5, name: "深度剖析", label: "深度剖析", hint: "学习目标 / 关键概念 / 实践练习 / 检验方式" },
    { step: 6, name: "分配格子", label: "按依赖分配格子", hint: "按依赖关系和难度分配到曼陀罗时辰" },
  ];

  let _lastBreakdownStep = null;
  let bsNodesBuilt = false;

  function renderBreakdownSteps() {
    if (!el.breakdownSteps) return;
    const inBreakdown = state.chatState === "project_breakdown";
    // 显隐：仅在拆解环节显示
    el.breakdownSteps.hidden = !inBreakdown;
    if (!inBreakdown) {
      _lastBreakdownStep = null;
      return;
    }

    const curStep = Math.max(1, Math.min(6, state.breakdownStep || 1));
    const isTransition = _lastBreakdownStep !== null && _lastBreakdownStep !== curStep;

    // 计数器
    if (el.bsStepCounter) el.bsStepCounter.textContent = `${curStep}/6`;

    // 构建节点（首次）
    if (!bsNodesBuilt) {
      el.bsNodes.innerHTML = "";
      BREAKDOWN_STEPS.forEach((s) => {
        const node = document.createElement("div");
        node.className = "bs-node";
        node.dataset.step = s.step;
        node.innerHTML =
          '<div class="bs-node-dot"></div>' +
          '<div class="bs-node-label">' + s.name + '</div>';
        el.bsNodes.appendChild(node);
      });
      bsNodesBuilt = true;
    }

    // 填充宽度
    const fillPercent = ((curStep - 1) / (BREAKDOWN_STEPS.length - 1)) * 100;
    el.bsTrackFill.style.width = fillPercent + "%";

    // 节点状态
    const nodes = el.bsNodes.querySelectorAll(".bs-node");
    nodes.forEach((node) => {
      const s = parseInt(node.dataset.step, 10);
      node.classList.remove("passed", "current");
      if (s < curStep) node.classList.add("passed");
      else if (s === curStep) node.classList.add("current");
    });

    // 当前步骤标签与提示
    const cur = BREAKDOWN_STEPS[curStep - 1];
    el.bsCurrentLabel.textContent = cur.label;
    el.bsHint.textContent = cur.hint;

    // 切换闪烁动画
    if (isTransition) {
      el.breakdownSteps.classList.remove("step-transition");
      void el.breakdownSteps.offsetWidth;
      el.breakdownSteps.classList.add("step-transition");
      console.log(`[状态机] 拆解子步骤：${_lastBreakdownStep} → ${curStep}（${cur.label}）`);
    }

    _lastBreakdownStep = curStep;
  }

  function addBadge(text) {
    const b = document.createElement("span");
    b.className = "chat-badge";
    b.textContent = text;
    el.chatBadges.appendChild(b);
  }

  // ---------- 轻量 Markdown 渲染 ----------
  function renderMarkdown(text) {
    if (!text) return "";
    let html = escapeHtml(text);
    // 代码块 ```...```
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) =>
      `<pre class="md-code"><code>${code.replace(/\n$/, "")}</code></pre>`);
    // 行内代码 `code`
    html = html.replace(/`([^`\n]+)`/g, '<code class="md-inline">$1</code>');
    // 加粗 **text** 或 __text__
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    // 斜体 *text* 或 _text_
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    // 标题 ### / ## / #
    html = html.replace(/^###\s+(.+)$/gm, '<div class="md-h3">$1</div>');
    html = html.replace(/^##\s+(.+)$/gm, '<div class="md-h2">$1</div>');
    html = html.replace(/^#\s+(.+)$/gm, '<div class="md-h1">$1</div>');
    // 无序列表 - / *
    html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    // 有序列表 1.
    html = html.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li class="md-ol">$1</li>');
    // 引用 >
    html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');
    // 换行
    html = html.replace(/\n/g, "<br>");
    // 修复连续 ul 合并
    html = html.replace(/<\/ul><br><ul>/g, "");
    html = html.replace(/<br>(<li>)/g, "$1");
    return html;
  }

  // ---------- 对话 ----------
  function addMessage(role, content, isMarkdown) {
    const wrap = document.createElement("div");
    wrap.className = `message ${role}`;
    const inner = document.createElement("div");
    inner.className = "message-content";
    if (isMarkdown && role === "bot") {
      inner.innerHTML = renderMarkdown(content);
    } else {
      inner.innerHTML = content;
    }
    // 时间戳
    const time = document.createElement("div");
    time.className = "message-time";
    time.textContent = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    wrap.appendChild(inner);
    wrap.appendChild(time);
    // 复制按钮（仅 bot）
    if (role === "bot") {
      const copyBtn = document.createElement("button");
      copyBtn.className = "msg-copy-btn";
      copyBtn.textContent = "复制";
      copyBtn.addEventListener("click", () => {
        const text = inner.textContent || "";
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = "已复制";
          setTimeout(() => { copyBtn.textContent = "复制"; }, 1500);
        });
      });
      wrap.appendChild(copyBtn);
    }
    el.chatMessages.appendChild(wrap);
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    save(CHAT_KEY, el.chatMessages.innerHTML);
    return wrap;
  }

  function addUserMessage(text) { return addMessage("user", escapeHtml(text)); }
  function addBotMessage(html, isMarkdown) { return addMessage("bot", html, isMarkdown); }

  function restoreChat() {
    const saved = load(CHAT_KEY, null);
    if (saved) {
      el.chatMessages.innerHTML = saved;
      el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    }
  }

  el.clearChat.addEventListener("click", () => {
    if (!confirm("清空所有对话记录？")) return;
    el.chatMessages.innerHTML = "";
    addBotMessage("对话已清空。告诉我你今天要做的事情吧。");
    localStorage.removeItem(CHAT_KEY);
    state.chatState = "idle";
    state.pendingPlan = null;
    state.userIntent = "";
    state.chatHistory = [];
    state.breakdownContext = null;
    clearDraftPlan();
    clearSuggestions();
    renderDraftBanner();
    toast("对话已清空", "info");
  });

  el.chatInput.addEventListener("input", () => {
    el.chatInput.style.height = "auto";
    el.chatInput.style.height = Math.min(el.chatInput.scrollHeight, 100) + "px";
  });

  el.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  el.sendBtn.addEventListener("click", () => handleSend());

  // ---------- 版本号与更新日志 ----------
  const VERSION_SEEN_KEY = "mandala-version-seen-v1";
  function renderVersionBadge() {
    const badge = document.getElementById("versionBadge");
    if (!badge) return;
    badge.textContent = "v" + APP_VERSION;
    // 检测是否为新版本（首次访问该版本时高亮 3 次脉冲）
    const seen = localStorage.getItem(VERSION_SEEN_KEY);
    if (seen !== APP_VERSION) {
      badge.classList.add("new");
      localStorage.setItem(VERSION_SEEN_KEY, APP_VERSION);
    }
  }
  function renderChangelog() {
    const body = document.getElementById("changelogBody");
    const verEl = document.getElementById("changelogVersion");
    if (!body) return;
    if (verEl) verEl.textContent = "v" + APP_VERSION;
    body.innerHTML = "";
    APP_CHANGELOG.forEach((ver) => {
      const section = document.createElement("div");
      section.className = "changelog-version";
      section.innerHTML = `
        <div class="changelog-version-header">
          <div class="changelog-version-title">v${escapeHtml(ver.v)}</div>
          <div class="changelog-version-date">${escapeHtml(ver.date)}</div>
        </div>
        <ul class="changelog-version-items">
          ${ver.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      `;
      body.appendChild(section);
    });
  }
  renderVersionBadge();
  const versionBadge = document.getElementById("versionBadge");
  if (versionBadge) {
    versionBadge.addEventListener("click", () => {
      renderChangelog();
      document.getElementById("changelogDialog").showModal();
    });
  }
  const closeChangelog = document.getElementById("closeChangelog");
  if (closeChangelog) closeChangelog.addEventListener("click", () => document.getElementById("changelogDialog").close());
  const changelogDialog = document.getElementById("changelogDialog");
  if (changelogDialog) changelogDialog.addEventListener("click", (e) => { if (e.target === changelogDialog) changelogDialog.close(); });

  // ---------- 引导式按钮渲染 ----------
  function renderSuggestions(buttons) {
    el.chatSuggestions.innerHTML = "";
    if (!buttons || !buttons.length) return;
    buttons.forEach((b) => {
      const btn = document.createElement("button");
      btn.className = "suggestion-btn" + (b.primary ? " primary" : "") + (b.danger ? " danger" : "");
      btn.textContent = b.label;
      btn.addEventListener("click", () => {
        if (b.action) b.action();
      });
      el.chatSuggestions.appendChild(btn);
    });
  }

  function clearSuggestions() {
    el.chatSuggestions.innerHTML = "";
  }

  // ---------- 多轮对话主控（流式 + 取消 + 撤销 + 重试 + 打字机 + 历史 + Token） ----------
  async function handleSend(isRegenerate, overrideText) {
    const text = overrideText !== undefined ? overrideText : el.chatInput.value.trim();
    if (!text && !isRegenerate) return;
    const effectiveText = isRegenerate ? state.lastUserText : text;
    if (!effectiveText) return;

    // 三才快捷指令拦截
    if (!isRegenerate) {
      const cmd = effectiveText.trim().toLowerCase();
      if (/^(复盘|回顾|总结)$/.test(cmd)) {
        addUserMessage(effectiveText);
        el.chatInput.value = "";
        el.chatInput.style.height = "auto";
        const thinking = addBotMessage("");
        thinking.querySelector(".message-content").innerHTML = "📊 已为你切换到复盘页并开始生成…";
        setRealm("review");
        setTimeout(() => generateAiReview(), 600);
        return;
      }
      if (/^(去记录|记录页|实际记录)$/.test(cmd)) {
        addUserMessage(effectiveText);
        el.chatInput.value = "";
        el.chatInput.style.height = "auto";
        const thinking = addBotMessage("");
        thinking.querySelector(".message-content").innerHTML = "📝 已切换到记录页，点击格子开始记录实际执行…";
        setRealm("record");
        return;
      }
      if (/^(去计划|计划页|回到计划)$/.test(cmd)) {
        addUserMessage(effectiveText);
        el.chatInput.value = "";
        el.chatInput.style.height = "auto";
        const thinking = addBotMessage("");
        thinking.querySelector(".message-content").innerHTML = "📅 已切换到计划页…";
        setRealm("plan");
        return;
      }
      // 长期任务指令：长期任务/长线任务 + 标题 [+ 截止/重复]
      const longMatch = effectiveText.match(/^(?:长期任务|长线任务|长期事项)[:：]?\s*(.+)/i);
      if (longMatch) {
        const rest = longMatch[1].trim();
        addUserMessage(effectiveText);
        el.chatInput.value = "";
        el.chatInput.style.height = "auto";
        const thinking = addBotMessage("");
        // 解析 截止日期 / 重复
        let due = "", repeat = "none", title = rest;
        const dueMatch = rest.match(/(?:截止|到期|due)[:：]?\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}|\d{1,2}月\d{1,2}日?)/i);
        if (dueMatch) {
          const raw = dueMatch[1];
          if (/^\d{4}-\d/.test(raw)) due = raw;
          else if (/^\d{1,2}\/\d{1,2}$/.test(raw)) { const [m,d] = raw.split("/"); due = `${new Date().getFullYear()}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`; }
          else { const m = raw.match(/(\d{1,2})月(\d{1,2})日?/); if (m) due = `${new Date().getFullYear()}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`; }
          title = rest.slice(0, dueMatch.index).trim();
        }
        const repMatch = title.match(/(?:重复|循环|repeat)[:：]?\s*(每日|每天|每周|每月|daily|weekly|monthly)/i);
        if (repMatch) {
          const r = repMatch[1].toLowerCase();
          if (/每日|每天|daily/.test(r)) repeat = "daily";
          else if (/每周|weekly/.test(r)) repeat = "weekly";
          else if (/每月|monthly/.test(r)) repeat = "monthly";
          title = title.slice(0, repMatch.index).trim();
        }
        title = title.replace(/[,，。；;]+$/, "").trim();
        if (!title) title = "未命名长期任务";
        const id = genLongId();
        const color = LONGTASK_COLORS[longTasks.length % LONGTASK_COLORS.length];
        longTasks.unshift({
          id, title, note: "由 AI 对话创建",
          startDate: state.currentDate, dueDate: due,
          repeat, bindCell: "", progress: 0, color,
          eval: emptyEval(), createdAt: Date.now(), done: false,
        });
        saveLongTasks();
        renderLongtaskBar();
        thinking.querySelector(".message-content").innerHTML =
          `🗺️ 已创建长期任务：<b>${escapeHtml(title)}</b>` +
          (due ? `<br>📅 截止：${due}` : "") +
          (repeat !== "none" ? `<br>🔁 重复：${REPEAT_OPTIONS.find((r)=>r.value===repeat)?.label}` : "") +
          `<br><br>该任务已显示在顶部时间地图，点击可设置知识评估 7 维度与进度。`;
        toast("长期任务已创建", "success");
        return;
      }
    }

    if (!isRegenerate) {
      if (state.chatState === "idle" || state.chatState === "done") {
        state.userIntent = effectiveText;
      }
      addUserMessage(effectiveText);
      // 输入历史（去重、最近 20 条）
      state.inputHistory = state.inputHistory.filter((h) => h !== effectiveText);
      state.inputHistory.unshift(effectiveText);
      if (state.inputHistory.length > 20) state.inputHistory.pop();
      save(INPUT_HISTORY_KEY, state.inputHistory);
      el.chatInput.value = "";
      el.chatInput.style.height = "auto";
      state.draftPlan = null;
    }
    state.lastUserText = effectiveText;
    clearSuggestions();
    el.sendBtn.disabled = true;
    el.sendBtn.classList.add("loading");
    el.sendBtn.classList.add("pulse");
    setTimeout(() => el.sendBtn.classList.remove("pulse"), 500);
    const thinking = addBotMessage("正在思考…");
    const contentEl = thinking.querySelector(".message-content");

    // 流式取消按钮
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "stream-cancel";
    cancelBtn.textContent = "停止";
    cancelBtn.addEventListener("click", () => {
      if (state.abortController) { try { state.abortController.abort(); } catch (e) {} }
    });

    try {
      let result;
      const useAi = state.settings.apiUrl && state.settings.apiKey;
      if (useAi) {
        contentEl.classList.add("streaming");
        contentEl.textContent = "";
        thinking.appendChild(cancelBtn);
        const startTime = Date.now();
        result = await callAiApi(effectiveText, state.chatState, (partial) => {
          contentEl.textContent = partial;
          el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
        });
        contentEl.classList.remove("streaming");
        cancelBtn.remove();
        // Token 估算（中文≈2字符/token，英文≈4字符/token，取3）
        const promptTokens = Math.ceil((buildSystemPrompt(state.chatState).length + effectiveText.length) / 3);
        const completionTokens = Math.ceil(JSON.stringify(result).length / 3);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const tokenInfo = document.createElement("div");
        tokenInfo.className = "message-time";
        tokenInfo.textContent = `≈${promptTokens}+${completionTokens} tokens · ${elapsed}s`;
        thinking.appendChild(tokenInfo);
      } else {
        result = localDialog(effectiveText, state.chatState);
        await typewriterEffect(contentEl, result.html);
      }
      contentEl.innerHTML = result.html;
      if (contentEl.scrollHeight > 400) {
        contentEl.classList.add("collapsible");
        contentEl.addEventListener("click", () => contentEl.classList.toggle("expanded"));
      }
      attachQuestionClickHandlers(contentEl);
      attachBreakdownHandlers(contentEl);
      if (result.tasks && result.tasks.length && result.execute) {
        appendAiActions(thinking, result);
      }
      applyDialogResult(result);
    } catch (err) {
      contentEl.classList.remove("streaming");
      cancelBtn.remove();
      const errMsg = err.message || String(err);
      contentEl.innerHTML = `<span style="color:var(--danger)">❌ ${escapeHtml(errMsg)}</span>`;
      const retryBtn = document.createElement("div");
      retryBtn.className = "ai-actions";
      retryBtn.innerHTML = `<button class="ai-action-btn" id="retryBtn">🔄 重试</button>`;
      contentEl.appendChild(retryBtn);
      retryBtn.querySelector("#retryBtn").addEventListener("click", () => {
        thinking.remove();
        handleSend(true);
      });
      toast("请求失败，可点重试", "error");
    } finally {
      el.sendBtn.disabled = false;
      el.sendBtn.classList.remove("loading");
      el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
      save(CHAT_KEY, el.chatMessages.innerHTML);
    }
  }

  // 本地模式打字机效果
  async function typewriterEffect(el, html) {
    if (!el || !el.innerHTML) return;
    el.innerHTML = "";
    // 简单逐字显示：把 HTML 解析后逐字追加
    const temp = document.createElement("div");
    temp.innerHTML = html;
    const fullText = temp.textContent || "";
    if (!fullText) { el.innerHTML = html; return; }
    const chunks = [];
    for (let i = 0; i < fullText.length; i += 2) {
      chunks.push(fullText.slice(0, i + 2));
    }
    for (const chunk of chunks) {
      el.textContent = chunk;
      // 滚动父容器
      const parent = el.closest(".chat-messages");
      if (parent) parent.scrollTop = parent.scrollHeight;
      await new Promise((r) => setTimeout(r, 15));
    }
  }

  // AI 问题可点击直接回复
  function attachQuestionClickHandlers(contentEl) {
    contentEl.querySelectorAll(".task-list li").forEach((li) => {
      li.addEventListener("click", () => {
        const text = li.textContent.trim();
        fillInput(text);
      });
    });
  }

  // 在 AI 回复后追加「撤销填入 / 重新生成」按钮
  function appendAiActions(msgEl, result) {
    const actions = document.createElement("div");
    actions.className = "ai-actions";
    actions.innerHTML = `
      <button class="ai-action-btn danger" id="undoFillBtn">↶ 撤销填入</button>
      <button class="ai-action-btn" id="regenBtn">🔄 重新生成</button>`;
    msgEl.querySelector(".message-content").appendChild(actions);
    actions.querySelector("#undoFillBtn").addEventListener("click", () => undoLastFill());
    actions.querySelector("#regenBtn").addEventListener("click", () => {
      msgEl.remove();
      handleSend(true);
    });
  }

  // 撤销上一次 AI 填入
  function undoLastFill() {
    if (!state.undoStack.length) { toast("无可撤销操作", "info"); return; }
    const last = state.undoStack.pop();
    // 恢复
    if (!state.tasks[last.date]) state.tasks[last.date] = {};
    if (last.prevTasks && Object.keys(last.prevTasks).length) {
      state.tasks[last.date] = last.prevTasks;
    } else {
      delete state.tasks[last.date];
    }
    save(STORAGE_KEY, state.tasks);
    state.currentDate = last.date;
    renderAll();
    toast(`已撤销 ${last.count} 条任务`, "success");
  }

  // 根据对话结果推进状态机
  function applyDialogResult(result) {
    // 检测状态切换，触发环节总结
    const prevState = state.chatState;
    if (result.nextState && result.nextState !== prevState) {
      emitStageSummary(prevState, result.nextState, result);
    }

    // 更新状态
    if (result.nextState) state.chatState = result.nextState;
    if (result.userIntent) state.userIntent = result.userIntent;
    if (result.pendingPlan) state.pendingPlan = result.pendingPlan;
    // 更新拆解子步骤（AI 返回 breakdownStep 时同步；进入/退出拆解环节时重置）
    if (result.breakdownStep && state.chatState === "project_breakdown") {
      state.breakdownStep = Math.max(1, Math.min(6, parseInt(result.breakdownStep, 10) || 1));
    } else if (state.chatState !== "project_breakdown") {
      state.breakdownStep = 1; // 离开拆解环节时重置
    }

    // 状态切换后自动激活对应环节分类（保持 activePromptId 与 chatState 同步）
    if (result.nextState && result.nextState !== prevState) {
      const stageCat = getStageCategory(result.nextState);
      if (stageCat && stageCat.id !== state.settings.activePromptId) {
        state.settings.activePromptId = stageCat.id;
        save(SETTINGS_KEY, state.settings);
        renderChatBadges();
      }
    }

    // 直接执行填格（确认后）
    if (result.tasks && result.tasks.length && result.execute) {
      result.tasks.forEach((t) => {
        if (t.period >= 0 && t.period < PERIOD_COUNT && t.cell >= 0 && t.cell < CELLS_PER_PERIOD) {
          addCellTask(t.period, t.cell, t.content);
        }
      });
      renderAll();
      // 触发填格动画（仅当前时辰可见的格子）
      if (result.tasks.some((t) => t.period === state.activePeriod)) {
        result.tasks.forEach((t) => {
          if (t.period === state.activePeriod) animateCellFill(t.period, t.cell);
        });
      }
      // 自动追加「去记录/去复盘」快捷按钮
      if (!result.suggestions || !result.suggestions.length) {
        result.suggestions = [
          { label: "📝 去记录实际执行", action: () => { setRealm("record"); } },
          { label: "📊 去复盘今日", action: () => { setRealm("review"); } },
        ];
      }
    }

    // 渲染引导按钮
    if (result.suggestions && result.suggestions.length) {
      renderSuggestions(result.suggestions);
    } else {
      clearSuggestions();
    }

    // 方案草稿暂存：有待确认方案则存，否则清
    if (state.pendingPlan && state.chatState === "confirming") {
      saveDraftPlan();
    } else if (state.chatState === "idle" || state.chatState === "done") {
      clearDraftPlan();
    }
    renderDraftBanner();
  }

  // 环节总结：状态切换时用旧环节的 summaryTemplate 生成小结，渲染到对话流
  function emitStageSummary(fromStage, toStage, result) {
    const fromCat = getStageCategory(fromStage);
    if (!fromCat || !fromCat.summaryTemplate) return;
    // 收集上下文用于填充模板
    const context = {
      "任务": state.userIntent || (result.summary || "").slice(0, 40),
      "要点": (result.summary || "").slice(0, 60),
      "任务数": (result.tasks || []).length,
      "时辰数": new Set((result.tasks || []).map((t) => t.period)).size,
      "模块数": (result.breakdown && result.breakdown.nodes) ? result.breakdown.nodes.length : 0,
    };
    const text = renderStageSummary(fromCat.summaryTemplate, context);
    if (!text) return;
    // 渲染环节总结卡片到对话流
    const msg = document.createElement("div");
    msg.className = "message bot";
    const stageNames = { idle: "待命", gathering: "收集背景", confirming: "确认方案", project_breakdown: "项目拆解", done: "已完成" };
    msg.innerHTML = `<div class="message-content"><div class="stage-summary-card">
      <div class="ss-title">✓ 环节切换：${stageNames[fromStage] || fromStage} → ${stageNames[toStage] || toStage}</div>
      <div class="ss-body">${text}</div>
    </div></div>`;
    const messages = el.chatMessages;
    if (messages) {
      messages.appendChild(msg);
      messages.scrollTop = messages.scrollHeight;
    }
  }

  // 引导按钮动作：确认安排
  function actionConfirmPlan() {
    addUserMessage("是，按此方案安排");
    clearSuggestions();
    el.sendBtn.disabled = true;
    const thinking = addBotMessage("正在安排到曼陀罗时辰…");
    setTimeout(() => {
      const plan = state.pendingPlan;
      if (plan && plan.tasks && plan.tasks.length) {
        // 冲突检测
        const conflicts = [];
        plan.tasks.forEach((t) => {
          const existing = getCellTasks(t.period, t.cell);
          if (existing.length && state.fillMode === "append") {
            conflicts.push({ period: t.period, cell: t.cell, existing: existing.length });
          }
        });
        // 记录撤销快照
        const prevTasks = state.tasks[state.currentDate]
          ? JSON.parse(JSON.stringify(state.tasks[state.currentDate]))
          : {};
        state.undoStack.push({
          date: state.currentDate,
          prevTasks,
          count: plan.tasks.length,
        });
        if (state.undoStack.length > 20) state.undoStack.shift();
        // 覆盖模式：先清空当日
        if (state.fillMode === "overwrite") {
          state.tasks[state.currentDate] = {};
          state.done[state.currentDate] = {};
        }
        // 填入
        plan.tasks.forEach((t) => {
          if (t.period >= 0 && t.period < PERIOD_COUNT && t.cell >= 0 && t.cell < CELLS_PER_PERIOD) {
            addCellTask(t.period, t.cell, t.content);
          }
        });
        renderAll();
        // 触发填格动画
        plan.tasks.forEach((t) => {
          if (t.period === state.activePeriod) animateCellFill(t.period, t.cell);
        });
        let msg = `✅ 已按方案安排 ${plan.tasks.length} 个任务到曼陀罗格子。`;
        if (conflicts.length && state.fillMode === "append") {
          msg += `<br><small style="color:var(--warning)">⚠ 其中 ${conflicts.length} 个格子已有任务，已追加（共 ${conflicts.reduce((s, c) => s + c.existing, 0)} 个旧任务保留）。</small>`;
        } else if (state.fillMode === "overwrite") {
          msg += `<br><small style="color:var(--warning)">⚠ 覆盖模式：已清空当日旧任务。</small>`;
        }
        msg += `<br><small style="color:var(--text-muted)">点击格子可编辑，长按可标记完成。可点下方「撤销填入」回退。</small>`;
        thinking.querySelector(".message-content").innerHTML = msg;
      }
      state.chatState = "done";
      state.pendingPlan = null;
      clearDraftPlan();
      appendAiActions(thinking, plan);
      renderSuggestions([
        { label: "继续规划新任务", primary: true, action: () => actionResetDialog() },
        { label: "📝 去记录实际执行", action: () => { setRealm("record"); toast("已切换到记录页，按需填写实际花费", "info"); } },
        { label: "📊 去复盘今日", action: () => { setRealm("review"); } },
      ]);
      el.sendBtn.disabled = false;
      save(CHAT_KEY, el.chatMessages.innerHTML);
      renderDraftBanner();
    }, 500);
  }

  // 引导按钮动作：需要调整
  function actionAdjustPlan() {
    addUserMessage("否，需要调整");
    state.chatState = "gathering";
    clearSuggestions();
    addBotMessage("好的，请告诉我希望如何调整？例如：时间偏好、任务优先级、时长调整、或想合并/拆分某些任务。");
    renderSuggestions([
      { label: "改时间偏好", action: () => fillInput("我想把重要任务放到上午") },
      { label: "调整时长", action: () => fillInput("某些任务时长需要调整") },
      { label: "重新描述", primary: true, action: () => actionResetDialog() },
    ]);
    save(CHAT_KEY, el.chatMessages.innerHTML);
  }

  // 方案预览编辑
  function openPlanPreview(tasks) {
    addUserMessage("✏ 我想编辑方案");
    clearSuggestions();
    // 渲染可编辑的方案列表
    const wrap = addBotMessage("");
    const contentEl = wrap.querySelector(".message-content");
    let html = '<div class="plan-preview"><div class="plan-preview-header"><span>编辑任务后点「应用」</span><span>' + tasks.length + ' 个任务</span></div>';
    tasks.forEach((t, idx) => {
      const range = getCellRange(t.period, t.cell);
      const timeLabel = `${secondsToHHMM(range.start)}-${secondsToHHMM(range.end)}`;
      html += `<div class="plan-preview-row" data-idx="${idx}">
        <span class="plan-preview-time">${timeLabel}<br><small>P${t.period + 1}C${t.cell + 1}</small></span>
        <input class="plan-preview-input" value="${escapeHtml(t.content)}" data-idx="${idx}" />
        <button class="plan-preview-del" data-idx="${idx}">✕</button>
      </div>`;
    });
    html += '</div>';
    contentEl.innerHTML = html;
    // 删除按钮
    contentEl.querySelectorAll(".plan-preview-del").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        tasks.splice(idx, 1);
        openPlanPreview(tasks);
      });
    });
    // 操作按钮
    const actions = document.createElement("div");
    actions.className = "ai-actions";
    actions.innerHTML = `
      <button class="ai-action-btn" id="applyPreviewBtn">✓ 应用此方案</button>
      <button class="ai-action-btn danger" id="cancelPreviewBtn">取消</button>`;
    contentEl.appendChild(actions);
    actions.querySelector("#applyPreviewBtn").addEventListener("click", () => {
      // 读取输入框最新值
      contentEl.querySelectorAll(".plan-preview-input").forEach((input) => {
        const idx = Number(input.dataset.idx);
        if (tasks[idx]) tasks[idx].content = input.value;
      });
      state.pendingPlan = { tasks };
      wrap.remove();
      actionConfirmPlan();
    });
    actions.querySelector("#cancelPreviewBtn").addEventListener("click", () => {
      wrap.remove();
      renderSuggestions([
        { label: "✓ 是，按此安排", primary: true, action: actionConfirmPlan },
        { label: "✏ 编辑方案", action: () => openPlanPreview(tasks) },
        { label: "✗ 否，需要调整", danger: true, action: actionAdjustPlan },
      ]);
    });
    save(CHAT_KEY, el.chatMessages.innerHTML);
  }

  // 引导按钮动作：跳过细节直接安排
  function actionSkipClarify() {
    addUserMessage("跳过细节，直接安排");
    clearSuggestions();
    el.sendBtn.disabled = true;
    const thinking = addBotMessage("正在生成方案…");
    setTimeout(() => {
      const useAi = state.settings.apiUrl && state.settings.apiKey;
      const result = useAi
        ? null // AI 模式走 callAiApi 由后端决定
        : localGeneratePlan(state.userIntent);
      if (result) {
        state.pendingPlan = { tasks: result.tasks };
        state.chatState = "confirming";
        thinking.querySelector(".message-content").innerHTML = result.html;
        renderSuggestions([
          { label: "✓ 是，按此安排", primary: true, action: actionConfirmPlan },
          { label: "✗ 否，需要调整", danger: true, action: actionAdjustPlan },
        ]);
      }
      el.sendBtn.disabled = false;
      save(CHAT_KEY, el.chatMessages.innerHTML);
    }, 500);
  }

  // 引导按钮动作：重置对话
  function actionResetDialog() {
    state.chatState = "idle";
    state.pendingPlan = null;
    state.userIntent = "";
    state.breakdownContext = null;
    clearSuggestions();
    clearDraftPlan();
    addBotMessage("好的，请描述你接下来要做的事情。");
    el.chatInput.focus();
    save(CHAT_KEY, el.chatMessages.innerHTML);
    renderDraftBanner();
  }

  // ---------- 方案草稿恢复横幅 ----------
  function renderDraftBanner() {
    const existing = document.getElementById("draftBanner");
    const draft = loadDraftPlan();
    if (!draft || !draft.plan || !(draft.plan.tasks || []).length) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return; // 已存在不重复渲染
    const savedAt = new Date(draft.savedAt);
    const timeStr = `${savedAt.getMonth() + 1}/${savedAt.getDate()} ${String(savedAt.getHours()).padStart(2, "0")}:${String(savedAt.getMinutes()).padStart(2, "0")}`;
    const intent = draft.userIntent ? `「${draft.userIntent.slice(0, 24)}${draft.userIntent.length > 24 ? "…" : ""}」` : "";
    const banner = document.createElement("div");
    banner.id = "draftBanner";
    banner.className = "draft-banner";
    banner.innerHTML = `
      <span class="draft-icon">💾</span>
      <span class="draft-text">检测到未完成方案${intent}（${(draft.plan.tasks || []).length} 个任务，${timeStr}）</span>
      <button class="draft-btn primary" id="restoreDraftBtn">恢复</button>
      <button class="draft-btn" id="discardDraftBtn">丢弃</button>`;
    el.chatSection.insertBefore(banner, el.chatSection.querySelector(".chat-header").nextSibling);
    banner.querySelector("#restoreDraftBtn").addEventListener("click", () => restoreDraftPlan(draft));
    banner.querySelector("#discardDraftBtn").addEventListener("click", () => {
      clearDraftPlan();
      banner.remove();
      toast("已丢弃草稿", "info");
    });
  }

  function restoreDraftPlan(draft) {
    state.pendingPlan = draft.plan;
    state.userIntent = draft.userIntent || "";
    state.chatState = "confirming";
    if (draft.fillMode) {
      state.fillMode = draft.fillMode;
      const sel = document.getElementById("fillModeSelect");
      if (sel) sel.value = draft.fillMode;
    }
    const banner = document.getElementById("draftBanner");
    if (banner) banner.remove();
    const plan = draft.plan;
    const preview = plan.tasks.map((t) => {
      const nt = normalizeTask(t);
      return `• ${escapeHtml(nt.text)} <small style="color:var(--text-muted)">(时辰${(t.period ?? 0) + 1}·格${(t.cell ?? 0) + 1})</small>`;
    }).join("<br>");
    addBotMessage(`已恢复未完成的规划方案（共 ${plan.tasks.length} 个任务）：<br>${preview}<br><br>确认后即安排到曼陀罗时辰。`);
    renderSuggestions([
      { label: "✓ 确认安排", primary: true, action: () => actionConfirmPlan() },
      { label: "调整方案", action: () => actionAdjustPlan() },
      { label: "丢弃草稿", action: () => { clearDraftPlan(); actionResetDialog(); } },
    ]);
    saveDraftPlan();
    save(CHAT_KEY, el.chatMessages.innerHTML);
    toast("已恢复草稿方案", "success");
  }

  function fillInput(text) {
    el.chatInput.value = text;
    el.chatInput.dispatchEvent(new Event("input"));
    el.chatInput.focus();
  }

  // ---------- 获取当前激活分类 ----------
  function getActiveCategory() {
    const cats = state.settings.promptCategories || [];
    return cats.find((c) => c.id === state.settings.activePromptId) || cats[0] || PRESET_PROMPT_CATEGORIES[0];
  }

  // ---------- 复盘专属系统提示词（不复用计划页的拆解流程） ----------
  function buildReviewSystemPrompt(chatState) {
    const date = state.currentDate;
    const stats = computeReviewStats();
    const dayReview = getDayReview(date) || {};

    // 复盘对话的三种模式
    const reviewStage = state.reviewChatStage || "entry"; // entry / insight / tomorrow

    const parts = [];
    parts.push("【角色】你是曼陀罗时辰的复盘教练。当前在「人·复盘」环节，与用户进行复盘对话。");
    parts.push("注意：此处不是计划拆解，不要输出 tasks/alternatives 等 JSON 字段。");

    // 当前复盘对话阶段
    const STAGE_DESC = {
      entry:    "阶段：复盘启动。引导用户回顾今日数据，识别执行偏差与亮点。可以反问：今天最满意/最遗憾的事是什么？",
      insight:  "阶段：深度洞察。基于数据做 5-Why 根因分析，区分偶发 vs 系统性问题。提供 1 条「成功公式」+ 1 条「改进杠杆」。",
      tomorrow: "阶段：明日转化。把洞察落到明日具体行动（2-3 条可执行改进点，每条附验证标准）。",
    };
    parts.push("【当前对话阶段】\n" + (STAGE_DESC[reviewStage] || STAGE_DESC.entry));

    // 今日数据摘要（精简版，省 token）
    const dayTasks = state.tasks[date] || {};
    const dayDone = state.done[date] || {};
    const dayRecords = state.records[date] || {};
    const planSummary = [];
    const recordSummary = [];
    let doneCount = 0;
    for (let p = 0; p < PERIOD_COUNT; p++) {
      for (let c = 0; c < CELLS_PER_PERIOD; c++) {
        const key = p + "-" + c;
        const tasks = (dayTasks[key] || []).map(taskText);
        const done = !!dayDone[key];
        const rec = dayRecords[key];
        if (tasks.length) {
          doneCount += done ? 1 : 0;
          planSummary.push(`第${p+1}辰格${c}: ${tasks.join(";")}${done ? "(✓)" : "(✗)"}`);
        }
        if (rec && (rec.actual || rec.spent)) {
          recordSummary.push(`第${p+1}辰格${c}: ${rec.actual || "-"}(${rec.spent || "-"}${rec.note ? "/" + rec.note : ""})`);
        }
      }
    }

    parts.push(`【今日数据摘要】`);
    parts.push(`- 日期：${date}`);
    parts.push(`- 计划格数：${stats.plannedCells}，完成：${doneCount}，完成率：${stats.plannedCells ? Math.round(doneCount/stats.plannedCells*100) : 0}%`);
    parts.push(`- 记录格数：${stats.recordedCells}`);
    parts.push(`- 计划详情：\n${planSummary.slice(0, 15).join("\n") || "（无）"}`);
    parts.push(`- 记录详情：\n${recordSummary.slice(0, 15).join("\n") || "（无）"}`);

    // 已有的 AI 复盘结果（如果有）
    if (dayReview.summary) {
      parts.push(`【已生成复盘摘要】${dayReview.summary}`);
    }

    // 复盘技能注入
    const reviewSkills = PRESET_SKILLS.filter((s) => s.group === "review" && state.settings.skills.includes(s.id));
    if (reviewSkills.length) {
      parts.push("【已激活复盘技能】");
      reviewSkills.forEach((s) => parts.push(`## ${s.name}\n${s.prompt}`));
    }

    // 输出格式（与计划页完全不同）
    parts.push(`
【输出要求】
严格按以下 JSON 格式回复（只输出 JSON，不要其他文字、不要 markdown 代码块）：
{
  "stage": "entry" | "insight" | "tomorrow",
  "reply": "对话回复正文（Markdown，可含标题/列表/加粗）",
  "probes": ["追问1", "追问2"],
  "insights": ["洞察（可选，深度洞察阶段填）"],
  "tomorrow_actions": [{"action": "具体改进动作", "verify": "验证标准"}],
  "stage_next": "entry" | "insight" | "tomorrow"
}

【对话风格】
- 简洁直接，每轮 reply 不超过 300 字
- 数据驱动：用今日数据支撑每个判断
- 不空泛：不说「要注意休息」而说「今日第7辰空置，明日该时段先安排 1 格恢复活动」
- 共情但不煽情：承认困难，重点放在可改进的杠杆点
`);

    return parts.join("\n\n");
  }

  // ---------- 构建系统提示词（多轮确认机制 + 分类 + 递归拆解） ----------
  function buildSystemPrompt(chatState) {
    // 复盘 realm 用专属流程，不复用计划页的拆解 prompt
    if (state.realm === "review") {
      return buildReviewSystemPrompt(chatState);
    }
    let parts = [];

    // 按当前状态机环节选择对应分类的提示词（核心改造）
    const stageCat = getStageCategory(chatState) || getStageCategory("idle");
    parts.push(`【当前环节】${stageCat.name}（状态：${chatState}）`);
    parts.push(`【环节提示词】\n${stageCat.content}`);

    // 知识评估 7 维度（必需要素，全环节生效）
    parts.push(`【知识评估 7 维度 · 必需要素】（全环节生效，凡涉及学习/长线任务均须套用）
这是本项目对每个知识点/长线任务的统一评估标准。请在拆解、确认、复盘时主动套用，并向用户抛出对应的核心追问：
- Cl 清晰度
  · 定义清晰度：能用一句话说清这个知识是什么吗？
  · 边界清晰度：能说清它和相似知识的区别吗？
  · 表征清晰度：能用图形、比喻、口诀等多种方式表达它吗？
- Cp 完整性
  · 结构完整度：有没有遗漏的子知识？根干枝叶齐全吗？
  · 步骤完整度：操作链的每一步都能闭卷写出来吗？
- B 边界感
  · 适用条件：在什么条件下能用？
  · 失效条件：在什么条件下会出错？
  · 极限测试：推到极端参数还成立吗？
- L 关联度
  · 上下游关联：它的前置知识和后续应用是什么？
  · 同构关联：和哪个知识共享相同的底层骨架？
  · 跨域关联：能迁移到其他领域或生活中吗？
- Ev 进化感
  · 版本追溯：和过去比，理解变深了吗？
  · 迭代方向：下一步该修正、升级还是淘汰？
- P 精炼度
  · 组块紧凑度：能压缩成多短的口诀？
  · 执行流畅度：能自动执行还是需要刻意回忆？
- Rh 节奏感
  · 周期：固定多久检索一次？
  · 频率：练习频率够高吗？
  · 预测：能预判自己会在哪卡住吗？
  · 时长：每次训练的时长合理吗？
  · 时机：在什么状态下训练效果最好？
使用规则：在 confirm/breakdown 阶段，对每个学习类任务在 summary 中标注其在 Cl/Cp/B/L/Ev/P/Rh 各维度的薄弱项（1-2 个）并给出追问；在 done 阶段提示用户到长期任务详情面板用星标打分（1-5）建立基线。`);

    // 附加提示词（用户自定义，全局生效）
    const customCats = getCustomCategories();
    if (customCats.length) {
      parts.push(`【全局附加提示词】\n${customCats.map((c) => `## ${c.name}\n${c.content}`).join("\n\n")}`);
    }

    parts.push(`时间模型：
- 每天 5:00 开始，共 9 时辰，每时辰 2 小时
- 每个时辰 = 一个曼陀罗九宫格（3×3=9 格）
- 每格 = 120/9 ≈ 13 分 20 秒
- 时辰 1: 5:00-7:00, 时辰 2: 7:00-9:00, ... 时辰 9: 21:00-23:00
- period 范围 0-8，cell 范围 0-8

【状态机环节切换规则】
- idle → gathering：用户已补充背景后，AI 返回 action="clarify"
- gathering → confirming：AI 返回 action="confirm"
- confirming → done：用户明确同意，AI 返回 action="execute"
- 任意 → project_breakdown：AI 返回 action="breakdown"
- done → idle：用户要新任务
- done → confirming：用户要调整

严格按以下 JSON 格式回复（只输出 JSON，不要其他文字）：
{
  "action": "clarify" | "confirm" | "execute" | "breakdown",
  "summary": "对当前轮次的说明/方案描述",
  "questions": ["问题1", "问题2"],
  "tasks": [{ "period": 0, "cell": 0, "content": "任务内容", "priority": "high|medium|low", "tag": "标签", "estimate": "时长", "deadline": "YYYY-MM-DDTHH:mm" }],
  "alternatives": [
    { "name": "方案A：紧凑型", "tasks": [...] },
    { "name": "方案B：均衡型", "tasks": [...] }
  ],
  "breakdown": {
    "goal": "项目目标",
    "nodes": [{ "id": "m1", "title": "模块名", "status": "pending|analyzing|done", "children": [...], "priority": "high|medium|low" }]
  },
  "breakdownStep": 1
}

规则：
- clarify/breakdown 阶段：tasks 可为空，questions 必须有
- confirm 阶段：可提供 1-3 个 alternatives 供用户选择，或直接用 tasks
- execute 阶段：tasks 必须有最终方案
- breakdown 阶段：返回 breakdown 树，前端会渲染并可让用户点击某个模块继续拆解
- breakdown 阶段：必须返回 breakdownStep（1-6 整数），表示当前推进到哪一步：
  1=识别主要模块  2=确认模块清单  3=逐模块细分  4=组块压缩  5=深度剖析  6=按依赖分配格子
  每轮只推进一步，breakdownStep 反映「本轮结束后」所处的步骤
- 任务对象支持 priority/tag/estimate/deadline 属性
- 根据任务所需时长合理占用格子数（1 格≈13分钟，9 格≈2小时）
- 一个格子可以放多个相关的小任务
- 若用户未指定时间，按任务类型合理分配
- confirm 阶段若有多个方案，优先用 alternatives 字段`);

    // Skill 配合：当前环节推荐 Skill
    const recommendedSkills = stageCat.recommendedSkills || [];
    const enabledSkills = state.settings.skills.map((id) => PRESET_SKILLS.find((s) => s.id === id)).filter(Boolean);
    if (enabledSkills.length) {
      parts.push(`【已启用 Skill】\n${enabledSkills.map((s) => `- ${s.name}：${s.prompt}`).join("\n")}`);
    }
    // 提示推荐但未启用的 Skill
    const notEnabled = recommendedSkills.filter((id) => !state.settings.skills.includes(id));
    if (notEnabled.length) {
      const names = notEnabled.map((id) => PRESET_SKILLS.find((s) => s.id === id)?.name).filter(Boolean).join("、");
      parts.push(`【建议配合 Skill】当前环节「${stageCat.name}」推荐配合：${names}（可在设置或对话栏顶部快速启用，效果更佳）`);
    }
    if (state.settings.customSkill && state.settings.customSkill.trim()) {
      parts.push(`【自定义技能】\n${state.settings.customSkill.trim().slice(0, 2000)}`);
    }
    if (state.settings.mcpEnabled && state.settings.mcpConfig) {
      try {
        const cfg = JSON.parse(state.settings.mcpConfig);
        const servers = cfg.mcpServers || cfg.servers || cfg;
        const names = Object.keys(servers).map((name) => {
          const s = servers[name];
          return `- ${name}：${s.description || s.command || JSON.stringify(s).slice(0, 80)}`;
        }).join("\n");
        parts.push(`【可用 MCP 工具/服务器】\n${names}\n规划时如可借助上述工具，请在 summary 中简要说明。`);
      } catch (e) {}
    }
    // 注入拆解上下文
    if (chatState === "project_breakdown" && state.breakdownContext) {
      parts.push(`【当前拆解上下文】\n项目目标：${state.breakdownContext.goal}\n已确认模块：${JSON.stringify(state.breakdownContext.milestones || [])}`);
    }
    return parts.join("\n\n---\n\n");
  }

  // ---------- AI API（流式 + 超时 + 重试 + 对话历史） ----------
  async function callAiApi(userText, chatState, onStream) {
    const { apiUrl, apiKey, apiModel } = state.settings;
    const systemPrompt = buildSystemPrompt(chatState);
    let userPrompt = `用户原始意图：${state.userIntent || "(尚未记录)"}\n当前用户输入：${userText}\n请根据当前状态 ${chatState} 决定下一步动作。`;

    // 联网搜索 RAG 增强
    if (state.settings.searchEnabled && (state.settings.searchApiKey || !SEARCH_PROVIDERS[state.settings.searchProvider]?.needsKey)) {
      try {
        const query = state.settings.searchAutoQuery
          ? (await generateSearchQuery(userText)) || userText
          : userText;
        const results = await webSearch(query);
        if (results && results.length) {
          const context = results.slice(0, 5).map((r, i) =>
            `[${i + 1}] ${r.title}\n${r.content}\n来源：${r.url}`
          ).join("\n\n");
          userPrompt += `\n\n【联网搜索结果（供参考，非用户输入）】\n查询：${query}\n${context}`;
        }
      } catch (e) {
        console.warn("搜索失败", e);
      }
    }

    // 取消上一次请求
    if (state.abortController) { try { state.abortController.abort(); } catch (e) {} }
    state.abortController = new AbortController();
    const timeoutId = setTimeout(() => state.abortController.abort(), 60000);

    // 构建完整 messages：system + 历史对话 + 当前用户输入
    const messages = [
      { role: "system", content: systemPrompt },
      // 保留最近 10 轮对话（20 条），避免 token 超限
      ...state.chatHistory.slice(-20),
      { role: "user", content: userPrompt },
    ];

    const doFetch = async (stream) => {
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: apiModel,
          messages,
          temperature: 0.6,
          stream,
        }),
        signal: state.abortController.signal,
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(formatApiError(resp.status, errText));
      }
      return resp;
    };

    try {
      // 尝试流式
      if (onStream) {
        try {
          const resp = await doFetch(true);
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let fullContent = "";
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data:")) continue;
              const data = trimmed.slice(5).trim();
              if (data === "[DONE]") continue;
              try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta?.content || "";
                if (delta) {
                  fullContent += delta;
                  onStream(fullContent);
                }
              } catch (e) { /* 忽略解析错误 */ }
            }
          }
          clearTimeout(timeoutId);
          // 记录到历史
          state.chatHistory.push({ role: "user", content: userPrompt });
          state.chatHistory.push({ role: "assistant", content: fullContent });
          return parseAiResponse(fullContent);
        } catch (streamErr) {
          if (streamErr.name === "AbortError") throw streamErr;
          console.warn("流式失败，回退非流式", streamErr);
        }
      }
      // 非流式
      const resp = await doFetch(false);
      clearTimeout(timeoutId);
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || "";
      state.chatHistory.push({ role: "user", content: userPrompt });
      state.chatHistory.push({ role: "assistant", content });
      return parseAiResponse(content);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error("请求已取消或超时（60秒）");
      }
      throw err;
    } finally {
      state.abortController = null;
    }
  }

  // 友好的 API 错误信息
  function formatApiError(status, errText) {
    const map = {
      401: "API Key 无效或已过期，请检查设置",
      403: "无权限访问该模型，请检查 API Key 权限",
      404: "API 地址错误或模型不存在",
      429: "请求过于频繁或额度已用完，请稍后再试",
      500: "AI 服务内部错误，请稍后重试",
      502: "AI 服务网关错误，请稍后重试",
      503: "AI 服务暂时不可用，请稍后重试",
    };
    const friendly = map[status] || `API 错误 (${status})`;
    return `${friendly}。${errText ? "详情：" + errText.slice(0, 100) : ""}`;
  }

  // ---------- 联网搜索 ----------
  async function generateSearchQuery(userText) {
    // 简单提取关键词：取较长的名词短语
    const cleaned = userText.replace(/[？?！!。，,\s]+/g, " ").trim();
    const words = cleaned.split(" ").filter((w) => w.length >= 2);
    return words.slice(0, 5).join(" ") || userText;
  }

  async function webSearch(query) {
    try {
      const { searchProvider, searchApiKey } = state.settings;
      const provider = SEARCH_PROVIDERS[searchProvider];
      if (!provider) return [];
      // 免费源（needsKey=false）不需要 API Key
      if (provider.needsKey && !searchApiKey) return [];
      // 优先使用 buildUrl（免费源用 GET），否则用 endpoint + body（付费源用 POST）
      const url = provider.buildUrl ? provider.buildUrl(query) : provider.endpoint;
      const headers = provider.buildHeaders(searchApiKey || "");
      const body = provider.buildBody ? provider.buildBody(searchApiKey, query) : null;
      const resp = await fetch(url, {
        method: body ? "POST" : "GET",
        headers,
        body,
      });
      if (!resp.ok) throw new Error(`搜索 API ${resp.status}`);
      const data = await resp.json();
      return provider.parse(data);
    } catch (e) {
      console.warn("webSearch 失败:", e);
      return []; // 静默恢复，不抛异常
    }
  }

  async function testSearch() {
    const { searchEnabled, searchApiKey, searchProvider } = state.settings;
    const provider = SEARCH_PROVIDERS[searchProvider];
    const needsKey = provider?.needsKey !== false;
    if (!searchEnabled || (needsKey && !searchApiKey)) {
      el.searchTestResult.textContent = needsKey ? "✗ 请先启用并填写 API Key" : "✗ 请先启用联网搜索";
      el.searchTestResult.style.color = "var(--danger)";
      return;
    }
    el.searchTestResult.textContent = "搜索中…";
    el.searchTestResult.style.color = "var(--text-muted)";
    try {
      const results = await webSearch("曼陀罗时间管理法");
      if (results && results.length) {
        el.searchTestResult.textContent = `✓ 成功，返回 ${results.length} 条结果，示例：${results[0].title}`;
        el.searchTestResult.style.color = "var(--success)";
      } else {
        el.searchTestResult.textContent = "⚠ 返回 0 条结果";
        el.searchTestResult.style.color = "var(--warning)";
      }
    } catch (e) {
      el.searchTestResult.textContent = `✗ 失败：${e.message}`;
      el.searchTestResult.style.color = "var(--danger)";
    }
  }

  // 规范化任务对象（含属性）
  function normalizeAiTask(t) {
    return {
      period: Number(t.period), cell: Number(t.cell),
      content: String(t.content || t.text || ""),
      priority: t.priority || "medium",
      tag: t.tag || "",
      estimate: t.estimate || "",
      deadline: t.deadline || "",
    };
  }

  // ---------- 解析复盘 AI 响应（review realm 专属） ----------
  function parseReviewResponse(parsed) {
    const reply = parsed.reply || parsed.summary || "";
    const probes = parsed.probes || [];
    const insights = parsed.insights || [];
    const tomorrowActions = parsed.tomorrow_actions || parsed.tomorrowActions || [];
    const stageNext = parsed.stage_next || parsed.stage || state.reviewChatStage || "entry";

    let html = "";
    if (reply) {
      // 简易 markdown 渲染（标题/列表/加粗/换行）
      let md = escapeHtml(reply);
      md = md.replace(/^### (.+)$/gm, '<h4 style="margin:8px 0 4px;">$1</h4>');
      md = md.replace(/^## (.+)$/gm, '<h3 style="margin:10px 0 6px;">$1</h3>');
      md = md.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      md = md.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
      md = md.replace(/(<li>[\s\S]+?<\/li>)/g, '<ul>$1</ul>');
      md = md.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
      html += md;
    }
    if (insights.length) {
      html += '<div class="review-insights-box"><div class="rib-title">💡 洞察</div><ul>';
      insights.forEach((i) => { html += `<li>${escapeHtml(i)}</li>`; });
      html += '</ul></div>';
    }
    if (tomorrowActions.length) {
      html += '<div class="review-tomorrow-box"><div class="rtb-title">📅 明日改进</div><ul>';
      tomorrowActions.forEach((a) => {
        const action = typeof a === "string" ? a : (a.action || "");
        const verify = (typeof a === "object" && a.verify) ? a.verify : "";
        html += `<li><strong>${escapeHtml(action)}</strong>${verify ? `<div class="rtb-verify">验证：${escapeHtml(verify)}</div>` : ""}</li>`;
      });
      html += '</ul></div>';
    }

    // 追问按钮（点击带回到输入框）
    const suggestions = probes.map((q) => ({
      label: q.length > 18 ? q.slice(0, 18) + "…" : q,
      action: () => fillInput(q),
    }));
    // 阶段切换按钮
    if (stageNext !== state.reviewChatStage) {
      suggestions.push({
        label: stageNext === "insight" ? "🔍 进入深度洞察" :
               stageNext === "tomorrow" ? "📅 转明日行动" : "↩ 回到复盘启动",
        primary: true,
        action: () => {
          state.reviewChatStage = stageNext;
          fillInput(stageNext === "insight" ? "请做 5-Why 根因分析" :
                    stageNext === "tomorrow" ? "把洞察转为明日具体行动" :
                    "重新回顾今日数据");
        },
      });
    } else {
      // 提供阶段切换的快捷按钮
      suggestions.push({ label: "🔍 深度洞察", action: () => { state.reviewChatStage = "insight"; fillInput("请基于数据做深度洞察"); } });
      suggestions.push({ label: "📅 明日行动", action: () => { state.reviewChatStage = "tomorrow"; fillInput("把洞察转为明日 2-3 条具体改进"); } });
    }

    // 记录到复盘数据
    if (insights.length || tomorrowActions.length) {
      const date = state.currentDate;
      const review = getDayReview(date) || {};
      if (insights.length) review.insights = (review.insights || []).concat(insights).slice(-10);
      if (tomorrowActions.length) review.tomorrowPlan = { items: tomorrowActions, tip: review.tomorrowPlan?.tip || "" };
      review.aiGeneratedAt = new Date().toLocaleString("zh-CN");
      setDayReview(date, review);
      renderReview();
    }

    return {
      html: html || "（AI 未返回有效内容）",
      nextState: state.chatState,
      suggestions,
    };
  }

  function parseAiResponse(content) {
    let jsonStr = content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();
    try {
      const parsed = JSON.parse(jsonStr);
      // 复盘 realm 走专属渲染（不复用计划页的 action/tasks 渲染）
      if (state.realm === "review") {
        return parseReviewResponse(parsed);
      }
      const action = parsed.action || "clarify";
      const tasks = (parsed.tasks || []).map(normalizeAiTask);
      const summary = escapeHtml(parsed.summary || "");
      const questions = parsed.questions || [];
      const alternatives = (parsed.alternatives || []).filter((a) => a.tasks && a.tasks.length).map((a) => ({
        name: a.name || "未命名方案",
        tasks: a.tasks.map(normalizeAiTask),
      }));
      let html = summary;
      if (questions.length) {
        html += `<br><ul class="task-list">${questions.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul>`;
      }
      // 多方案对比
      if (alternatives.length > 1) {
        html += '<div style="margin:8px 0;">';
        alternatives.forEach((alt, idx) => {
          html += `<div class="alt-plan" data-alt-idx="${idx}" style="border:1px solid var(--border);border-radius:6px;margin:6px 0;padding:8px;background:var(--bg-tertiary);"><div style="font-weight:600;color:var(--accent-light);font-size:13px;margin-bottom:4px;">${escapeHtml(alt.name)}</div>`;
          html += planSummaryHtml(alt.tasks);
          html += '</div>';
        });
        html += '</div>';
      } else if (tasks.length && action !== "clarify" && action !== "breakdown") {
        html += planSummaryHtml(tasks);
      }
      // 渲染拆解树
      if (parsed.breakdown) {
        html += renderBreakdownTreeHtml(parsed.breakdown);
        state.breakdownContext = parsed.breakdown;
      }

      // 根据动作决定状态转移和引导按钮
      if (action === "clarify") {
        return {
          html,
          nextState: "gathering",
          userIntent: state.userIntent,
          pendingPlan: tasks.length ? { tasks, alternatives } : state.pendingPlan,
          suggestions: [
            { label: "跳过细节，直接安排", primary: true, action: actionSkipClarify },
            { label: "我来补充", action: () => fillInput("我想补充：") },
          ],
        };
      }
      if (action === "breakdown") {
        // 批量确认：检查是否所有模块都 pending
        const nodes = parsed.breakdown?.nodes || [];
        const allPending = nodes.length && nodes.every((n) => n.status === "pending" || n.status === "done");
        const suggestions = [
          { label: "继续拆解下一模块", primary: true, action: () => fillInput("请继续拆解下一个模块") },
        ];
        if (allPending) {
          suggestions.unshift({ label: "✓ 一键确认全部模块", primary: true, action: () => batchConfirmBreakdown(nodes) });
        }
        suggestions.push({ label: "模块已拆完，生成方案", action: () => fillInput("所有模块已拆解完成，请生成最终方案") });
        suggestions.push({ label: "重新开始", danger: true, action: actionResetDialog });
        return {
          html,
          nextState: "project_breakdown",
          pendingPlan: tasks.length ? { tasks, alternatives } : state.pendingPlan,
          breakdownStep: parsed.breakdownStep, // AI 返回的当前拆解子步骤 1-6
          suggestions,
        };
      }
      if (action === "confirm") {
        const suggestions = [];
        if (alternatives.length > 1) {
          alternatives.forEach((alt, idx) => {
            suggestions.push({ label: `✓ 采用${alt.name}`, primary: idx === 0, action: () => selectAlternative(idx) });
          });
          suggestions.push({ label: "✗ 都不满意", danger: true, action: actionAdjustPlan });
        } else {
          suggestions.push({ label: "✓ 是，按此安排", primary: true, action: actionConfirmPlan });
          suggestions.push({ label: "✏ 编辑方案", action: () => openPlanPreview(tasks) });
          suggestions.push({ label: "✗ 否，需要调整", danger: true, action: actionAdjustPlan });
        }
        return {
          html,
          nextState: "confirming",
          pendingPlan: { tasks, alternatives },
          suggestions,
        };
      }
      if (action === "execute") {
        return {
          html: html || `✅ 已安排 ${tasks.length} 个任务。`,
          nextState: "done",
          tasks,
          execute: true,
          suggestions: [
            { label: "继续规划新任务", primary: true, action: actionResetDialog },
          ],
        };
      }
      return { html, nextState: state.chatState };
    } catch (e) {
      return {
        html: escapeHtml(content) + `<br><small style="color:var(--text-muted)">（AI 未返回标准 JSON，可重试或重新描述）</small>`,
        nextState: state.chatState,
        suggestions: [
          { label: "🔄 重新生成", primary: true, action: () => { const evt = new CustomEvent("retry-last"); document.dispatchEvent(evt); } },
          { label: "重新开始", danger: true, action: actionResetDialog },
        ],
      };
    }
  }

  // 多方案选择
  function selectAlternative(idx) {
    const plan = state.pendingPlan;
    if (!plan || !plan.alternatives || !plan.alternatives[idx]) return;
    state.pendingPlan = { tasks: plan.alternatives[idx].tasks };
    addUserMessage(`采用 ${plan.alternatives[idx].name}`);
    actionConfirmPlan();
  }

  // 批量确认拆解：把所有 pending 模块标记为 done，触发生成方案
  function batchConfirmBreakdown(nodes) {
    addUserMessage("✓ 一键确认全部模块");
    nodes.forEach((n) => { n.status = "done"; });
    if (state.breakdownContext && state.breakdownContext.nodes) {
      state.breakdownContext.nodes.forEach((n) => { n.status = "done"; });
    }
    fillInput("所有模块已确认，请生成最终方案");
  }

  // 渲染拆解树 HTML
  function renderBreakdownTreeHtml(breakdown) {
    if (!breakdown) return "";
    let html = `<div class="breakdown-progress">项目目标：${escapeHtml(breakdown.goal || "")}</div>`;
    html += '<div class="breakdown-tree">';
    const renderNode = (node, depth) => {
      const isLeaf = !node.children || !node.children.length;
      const statusText = node.status === "done" ? "✓ 已拆解" : node.status === "analyzing" ? "⏳ 拆解中" : "○ 待拆解";
      const clickable = !isLeaf && node.status !== "done";
      html += `<div class="breakdown-node ${isLeaf ? "leaf" : ""}">`;
      html += `<div class="breakdown-node-title ${clickable ? "expandable" : ""}" data-node-id="${escapeHtml(node.id || "")}">${escapeHtml(node.title || "")}<span class="breakdown-node-meta">[${statusText}]</span></div>`;
      if (node.goal) html += `<div class="breakdown-node-meta">目标：${escapeHtml(node.goal)}</div>`;
      if (node.depth_note) html += `<div class="breakdown-node-meta">${escapeHtml(node.depth_note)}</div>`;
      // 待拆解的节点加按钮
      if (node.status === "pending") {
        html += `<div class="breakdown-node-actions"><button class="breakdown-action-btn" data-action="breakdown-node" data-node-id="${escapeHtml(node.id || "")}">拆解此模块</button></div>`;
      }
      if (!isLeaf) {
        node.children.forEach((c) => renderNode(c, depth + 1));
      }
      html += '</div>';
    };
    (breakdown.nodes || []).forEach((n) => renderNode(n, 0));
    html += '</div>';
    return html;
  }

  // 拆解树点击交互：点击模块标题或按钮 → 触发拆解该模块
  function attachBreakdownHandlers(contentEl) {
    contentEl.querySelectorAll('[data-action="breakdown-node"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const nodeId = btn.dataset.nodeId;
        fillInput(`请深入拆解模块：${nodeId}`);
      });
    });
    contentEl.querySelectorAll(".breakdown-node-title.expandable").forEach((title) => {
      title.addEventListener("click", () => {
        const nodeId = title.dataset.nodeId;
        if (nodeId) fillInput(`请深入拆解模块：${nodeId}`);
      });
    });
  }

  // ---------- 本地多轮对话 ----------
  // 状态机：idle → gathering → confirming → done
  //         idle → project_breakdown → confirming → done（项目拆解分支）
  function localDialog(userText, chatState) {
    if (chatState === "idle" || chatState === "done") {
      // 检测是否为项目拆解意图
      if (isProjectIntent(userText)) {
        return startLocalBreakdown(userText);
      }
      // 第一轮：用户刚描述任务 → 进入收集背景阶段
      const rawTasks = userText.split(/[、,，;；\n。]+/).map((s) => s.trim()).filter(Boolean);
      if (!rawTasks.length) {
        return { html: "请告诉我你今天要做的事情。", nextState: "idle" };
      }
      const plan = localGeneratePlan(userText);
      const questions = generateClarifyQuestions(userText, plan);
      return {
        html: `我理解了你的任务：<b>${escapeHtml(rawTasks.join("、"))}</b><br><br>` +
              `在安排到曼陀罗时辰前，我想先确认几个细节，以便更合理地分配：<br>` +
              `<ul class="task-list">${questions.map((q) => `<li>${q}</li>`).join("")}</ul>` +
              `<small style="color:var(--text-muted)">你也可以直接补充说明，或跳过细节直接安排。</small>`,
        nextState: "gathering",
        userIntent: userText,
        pendingPlan: { tasks: plan.tasks },
        suggestions: [
          { label: "跳过细节，直接安排", primary: true, action: actionSkipClarify },
          { label: "我来补充", action: () => fillInput("我想补充：") },
        ],
      };
    }

    if (chatState === "project_breakdown") {
      return continueLocalBreakdown(userText);
    }

    if (chatState === "gathering") {
      const intent = state.userIntent + " " + userText;
      const plan = localGeneratePlan(intent);
      return {
        html: `好的，基于你的描述，我整理了如下方案：<br>` +
              planSummaryHtml(plan.tasks) +
              `<br><small style="color:var(--text-muted)">确认后将自动填入对应格子。</small>`,
        nextState: "confirming",
        pendingPlan: { tasks: plan.tasks },
        suggestions: [
          { label: "✓ 是，按此安排", primary: true, action: actionConfirmPlan },
          { label: "✗ 否，需要调整", danger: true, action: actionAdjustPlan },
        ],
      };
    }

    if (chatState === "confirming") {
      const intent = state.userIntent + " " + userText;
      const plan = localGeneratePlan(intent);
      return {
        html: `收到你的调整意见，重新整理方案：<br>` + planSummaryHtml(plan.tasks),
        nextState: "confirming",
        pendingPlan: { tasks: plan.tasks },
        suggestions: [
          { label: "✓ 是，按此安排", primary: true, action: actionConfirmPlan },
          { label: "✗ 否，需要调整", danger: true, action: actionAdjustPlan },
        ],
      };
    }

    return { html: "请描述你今天要做的事情。", nextState: "idle" };
  }

  // 判断是否为项目拆解意图
  function isProjectIntent(text) {
    const keywords = ["学习", "项目", "拆解", "嵌入式", "开发一个", "构建", "掌握", "精通", "从零"];
    return keywords.some((k) => text.includes(k)) && text.length > 6;
  }

  // 本地项目拆解（模拟递归拆解，因本地无 AI 能力，使用预设知识库）
  function startLocalBreakdown(userText) {
    const goal = userText.replace(/^(我想|我要|帮我|请|学习|掌握|精通)\s*/g, "").trim();
    // 预设项目知识库
    const KB = {
      "嵌入式": { modules: ["C语言基础", "STM32/GD32", "焊锡与焊接", "单片机原理", "电路基础", "调试工具"] },
      "前端": { modules: ["HTML/CSS", "JavaScript", "框架(React/Vue)", "工程化", "浏览器原理", "性能优化"] },
      "英语": { modules: ["词汇", "语法", "听力", "口语", "阅读", "写作"] },
    };
    let modules = null;
    Object.keys(KB).forEach((k) => { if (goal.includes(k)) modules = KB[k].modules; });
    if (!modules) modules = ["基础概念", "核心原理", "实践练习", "进阶应用", "项目实战"];

    const breakdown = {
      goal,
      nodes: modules.map((m, i) => ({ id: `m${i + 1}`, title: m, status: "pending" })),
    };
    state.breakdownContext = breakdown;

    return {
      html: `检测到这是一个项目/学习目标：<b>${escapeHtml(goal)}</b><br><br>` +
            `我先把它拆解为以下主要模块：<br>` +
            renderBreakdownTreeHtml(breakdown) +
            `<br>请确认模块清单是否完整？是否有遗漏或需要调整优先级？<br>` +
            `<small style="color:var(--text-muted)">确认后我会逐个模块继续细分、组块压缩、深度剖析。</small>`,
      nextState: "project_breakdown",
      userIntent: userText,
      pendingPlan: null,
      breakdownStep: 2, // 已识别模块（步骤1），现在进入确认清单（步骤2）
      suggestions: [
        { label: "✓ 模块确认，开始细分", primary: true, action: () => fillInput("模块确认，请开始逐个细分") },
        { label: "我想补充模块", action: () => fillInput("我想补充：") },
        { label: "直接生成方案", action: () => fillInput("跳过细分，直接生成方案") },
      ],
    };
  }

  // 本地继续拆解（模拟）
  function continueLocalBreakdown(userText) {
    const ctx = state.breakdownContext;
    if (!ctx) return { html: "请重新描述项目目标。", nextState: "idle" };

    // 用户要求直接生成方案
    if (/直接|跳过|生成方案|够了/.test(userText)) {
      return generateBreakdownPlan(ctx);
    }

    // 找到第一个 pending 模块，模拟细分
    const pendingNode = ctx.nodes.find((n) => n.status === "pending");
    if (pendingNode) {
      pendingNode.status = "analyzing";
      // 模拟细分
      const subModules = getSubModules(pendingNode.title);
      pendingNode.children = subModules.map((s, i) => ({
        id: `${pendingNode.id}-${i + 1}`,
        title: s,
        status: "done",
      }));
      pendingNode.status = "done";

      const remaining = ctx.nodes.filter((n) => n.status === "pending").length;
      // 本地模式按模块拆解进度映射到子步骤：3=逐模块细分，6=分配格子
      let localStep = 3; // 正在逐模块细分
      if (remaining === 0) localStep = 6; // 全部拆完，进入分配格子
      return {
        html: `已对模块「<b>${escapeHtml(pendingNode.title)}</b>」进行细分：<br>` +
              renderBreakdownTreeHtml(ctx) +
              `<br><small style="color:var(--text-muted)">剩余 ${remaining} 个模块待细分。</small>`,
        nextState: "project_breakdown",
        breakdownStep: localStep,
        suggestions: [
          { label: remaining > 0 ? "继续拆解下一模块" : "✓ 全部拆完，生成方案", primary: true, action: () => fillInput(remaining > 0 ? "继续拆解下一模块" : "全部拆完，生成方案") },
          { label: "直接生成方案", action: () => fillInput("直接生成方案") },
          { label: "重新开始", danger: true, action: actionResetDialog },
        ],
      };
    }

    // 所有模块已拆完 → 生成方案
    return generateBreakdownPlan(ctx);
  }

  // 模拟子模块知识库
  function getSubModules(moduleName) {
    const KB = {
      "C语言基础": ["变量与数据类型", "运算符与表达式", "流程控制", "函数与作用域", "指针基础", "结构体与联合", "内存管理"],
      "STM32/GD32": ["GPIO 配置", "时钟系统", "中断 NVIC", "UART 串口", "定时器 TIMER", "ADC 采样", "DMA 传输"],
      "焊锡与焊接": ["工具认识", "焊锡丝选择", "焊接姿势", "贴片元件焊接", "插件焊接", "拆焊技巧", "焊接质量检验"],
      "单片机原理": ["CPU 架构", "存储器映射", "总线系统", "复位与时钟", "电源管理", "看门狗"],
      "电路基础": ["欧姆定律", "基尔霍夫定律", "电阻电容电感", "二极管三极管", "运放基础", "滤波电路"],
      "调试工具": ["万用表使用", "示波器使用", "逻辑分析仪", "JTAG/SWD 调试", "串口调试助手"],
    };
    return KB[moduleName] || ["概念理解", "原理学习", "动手实践", "总结复盘"];
  }

  // 把拆解结果转为方案
  function generateBreakdownPlan(ctx) {
    const tasks = [];
    let period = 0, cell = 0;
    ctx.nodes.forEach((node) => {
      if (node.children) {
        node.children.forEach((child) => {
          if (period >= PERIOD_COUNT) return;
          tasks.push({ period, cell, content: `${node.title}：${child.title}` });
          cell++;
          if (cell >= CELLS_PER_PERIOD) { cell = 0; period++; }
        });
      } else {
        if (period >= PERIOD_COUNT) return;
        tasks.push({ period, cell, content: node.title });
        cell++;
        if (cell >= CELLS_PER_PERIOD) { cell = 0; period++; }
      }
    });
    return {
      html: `所有模块已拆解完成，生成学习方案如下（共 ${tasks.length} 个学习单元）：<br>` +
            planSummaryHtml(tasks) +
            `<br><small style="color:var(--text-muted)">确认后将按顺序填入曼陀罗格子。</small>`,
      nextState: "confirming",
      pendingPlan: { tasks },
      suggestions: [
        { label: "✓ 是，按此安排", primary: true, action: actionConfirmPlan },
        { label: "✗ 否，需要调整", danger: true, action: actionAdjustPlan },
      ],
    };
  }

  // 生成本地拆解方案（核心算法，复用旧逻辑）
  function localGeneratePlan(userText) {
    const rawTasks = userText.split(/[、,，;；\n。]+/).map((s) => s.trim()).filter(Boolean);
    if (!rawTasks.length) return { tasks: [] };

    const typeRules = [
      { keywords: ["运动", "健身", "跑步", "锻炼", "瑜伽"], period: 0 },
      { keywords: ["读书", "阅读", "学习", "背词", "复习"], period: 0 },
      { keywords: ["报告", "方案", "写", "编码", "开发", "编程", "设计", "深度"], period: 1 },
      { keywords: ["会议", "沟通", "讨论", "电话", "邮件", "回复"], period: 3 },
      { keywords: ["总结", "复盘", "整理", "计划", "规划", "明天"], period: 5 },
      { keywords: ["晚餐", "吃饭", "休息", "放松"], period: 6 },
      { keywords: ["冥想", "日记", "睡觉"], period: 8 },
    ];

    function estimateCells(text) {
      const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|h)/i);
      const minMatch = text.match(/(\d+)\s*(?:分钟|min|m)/i);
      if (hourMatch) return Math.max(1, Math.round((parseFloat(hourMatch[1]) * 60) / (SECONDS_PER_CELL / 60)));
      if (minMatch) return Math.max(1, Math.round(parseInt(minMatch[1], 10) / (SECONDS_PER_CELL / 60)));
      return 1;
    }
    function matchPeriod(text) {
      for (const rule of typeRules) if (rule.keywords.some((k) => text.includes(k))) return rule.period;
      return -1;
    }

    const periodCells = {};
    for (let p = 0; p < PERIOD_COUNT; p++) periodCells[p] = 0;
    const placed = []; const unplaced = [];

    rawTasks.forEach((task) => {
      const need = estimateCells(task);
      let period = matchPeriod(task);
      const tryOrder = [];
      if (period >= 0) tryOrder.push(period);
      for (let p = 0; p < PERIOD_COUNT; p++) if (!tryOrder.includes(p)) tryOrder.push(p);
      let placedFlag = false;
      for (const p of tryOrder) {
        if (periodCells[p] + need <= CELLS_PER_PERIOD) {
          for (let i = 0; i < need; i++) {
            placed.push({ period: p, cell: periodCells[p] + i, content: need > 1 ? `${task}（${i + 1}/${need}）` : task });
          }
          periodCells[p] += need; placedFlag = true; break;
        }
      }
      if (!placedFlag) unplaced.push(task);
    });

    return { tasks: placed, unplaced };
  }

  // 根据任务内容生成澄清问题
  function generateClarifyQuestions(userText, plan) {
    const questions = [];
    const hasTime = /\d+\s*(小时|h|分钟|min)/i.test(userText);
    const hasMeeting = /会议|开会|讨论/.test(userText);
    const hasDeep = /写|编码|开发|报告|方案|设计/.test(userText);

    if (!hasTime) questions.push("各任务预计时长多久？（如未指定，我会按默认估算）");
    if (hasDeep) questions.push("深度工作是否优先安排在上午高能时段（第2-3时辰）？");
    if (hasMeeting) questions.push("会议是否有固定时间？还是可以灵活安排？");
    questions.push("是否有任务必须在特定时间完成（截止时间）？");
    questions.push("今天能量状态如何？是否需要预留休息缓冲？");
    return questions.slice(0, 4);
  }

  // 方案摘要 HTML
  function planSummaryHtml(tasks) {
    if (!tasks.length) return "<i>暂无可安排的任务</i>";
    // 按时辰分组
    const byPeriod = {};
    tasks.forEach((t) => {
      if (!byPeriod[t.period]) byPeriod[t.period] = [];
      byPeriod[t.period].push(t);
    });
    let html = '<ul class="task-list">';
    Object.keys(byPeriod).sort((a, b) => a - b).forEach((p) => {
      const range = getPeriodRange(Number(p));
      html += `<li><b>第${Number(p) + 1}辰 (${secondsToHHMM(range.start)}-${secondsToHHMM(range.end)})</b>`;
      html += '<ul style="margin-top:4px;">';
      byPeriod[p].forEach((t) => {
        const cellRange = getCellRange(t.period, t.cell);
        html += `<li>${secondsToHHMM(cellRange.start)} · ${escapeHtml(t.content)}</li>`;
      });
      html += '</ul></li>';
    });
    html += '</ul>';
    return html;
  }

  // ---------- 快捷操作 ----------
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const action = chip.dataset.action;
      if (action === "example") {
        el.chatInput.value = "早上锻炼30分钟，上午写项目报告需要2小时，下午开两个会议各30分钟，晚上读书1小时并写日记";
        el.chatInput.dispatchEvent(new Event("input"));
        el.chatInput.focus();
      } else if (action === "project") {
        // 切换到项目拆解分支环节
        const projCat = getStageCategory("project_breakdown");
        state.settings.activePromptId = projCat ? projCat.id : "stage_project_breakdown";
        state.chatState = "project_breakdown";
        state.breakdownStep = 1;
        state.breakdownContext = null;
        save(SETTINGS_KEY, state.settings);
        renderChatBadges();
        actionResetDialog();
        // 不预填内容，让用户自己输入项目主题
        el.chatInput.value = "";
        el.chatInput.placeholder = "输入你要拆解的项目主题，如：学习嵌入式开发、准备产品发布会…";
        el.chatInput.dispatchEvent(new Event("input"));
        toast("已进入「项目拆解」分支，输入项目主题即可开始拆解", "info");
        el.chatInput.focus();
      } else if (action === "return-main") {
        // 从项目拆解分支返回主线
        state.chatState = "confirming";
        state.breakdownStep = 1;
        state.breakdownContext = null;
        // 恢复默认提示词（确认环节）
        const confirmingCat = getStageCategory("confirming");
        state.settings.activePromptId = confirmingCat ? confirmingCat.id : "stage_confirming";
        save(SETTINGS_KEY, state.settings);
        renderChatBadges();
        actionResetDialog();
        toast("已返回主线（确认环节）", "info");
        el.chatInput.placeholder = "告诉 AI 你今天要做的事…";
        el.chatInput.focus();
      } else if (action === "search") {
        const provider = SEARCH_PROVIDERS[state.settings.searchProvider];
        const needsKey = provider?.needsKey !== false;
        if (!state.settings.searchEnabled || (needsKey && !state.settings.searchApiKey)) {
          toast(needsKey ? "请先在设置中启用联网搜索并填写 API Key" : "请先在设置中启用联网搜索", "error");
          return;
        }
        // 手动触发一次搜索并显示结果
        manualSearch();
      } else if (action === "auto") {
        autoFillToday();
      } else if (action === "clear-tasks") {
        clearCurrentDayGrids();
      } else if (action === "go-record") {
        setRealm("record");
        const chatSection = document.querySelector(".chat-section");
        if (chatSection) chatSection.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (action === "go-review") {
        setRealm("review");
        const chatSection = document.querySelector(".chat-section");
        if (chatSection) chatSection.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (action === "conv-tpl") {
        openConvTplDialog();
      } else if (action === "knowledge-dim") {
        openKnowledgeDimDialog();
      }
    });
  });

  // 手动搜索
  async function manualSearch() {
    const text = el.chatInput.value.trim();
    if (!text) { toast("请先在输入框输入要搜索的内容", "error"); return; }
    addUserMessage(`🔍 搜索：${text}`);
    const thinking = addBotMessage("正在联网搜索…");
    el.sendBtn.disabled = true;
    try {
      const results = await webSearch(text);
      if (!results || !results.length) {
        thinking.querySelector(".message-content").innerHTML = "未找到相关结果。";
      } else {
        const html = `找到 ${results.length} 条结果：<br>` +
          results.map((r, i) => `<div style="margin:6px 0;padding:8px;border-left:2px solid var(--accent-light);background:var(--bg-tertiary);border-radius:4px;">
            <div style="font-weight:600;">${i + 1}. ${escapeHtml(r.title)}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin:4px 0;">${escapeHtml(r.content)}</div>
            <a href="${escapeHtml(r.url)}" target="_blank" style="font-size:11px;color:var(--accent-light);">来源链接</a>
          </div>`).join("");
        thinking.querySelector(".message-content").innerHTML = html;
      }
    } catch (e) {
      thinking.querySelector(".message-content").innerHTML = `<span style="color:var(--danger)">搜索失败：${escapeHtml(e.message)}</span>`;
    } finally {
      el.sendBtn.disabled = false;
      save(CHAT_KEY, el.chatMessages.innerHTML);
    }
  }

  // 清空当日所有格子任务
  function clearCurrentDayGrids() {
    const dayTasks = getDayTasks(state.currentDate);
    const count = Object.values(dayTasks).reduce((s, arr) => s + arr.length, 0);
    if (count === 0) {
      toast("当日无任务可清空", "info");
      return;
    }
    if (!confirm(`清空 ${formatDateLabel(state.currentDate)} 的所有格子任务（共 ${count} 条）？`)) return;
    state.tasks[state.currentDate] = {};
    state.done[state.currentDate] = {};
    state.checklists[state.currentDate] = {};
    save(STORAGE_KEY, state.tasks);
    save(DONE_KEY, state.done);
    save(CHECKLIST_KEY, state.checklists);
    renderAll();
    toast(`已清空 ${count} 条任务`, "success");
  }

  el.clearGridsBtn.addEventListener("click", clearCurrentDayGrids);

  // ---------- 撤销按钮 ----------
  el.undoBtn.addEventListener("click", undoLastFill);

  // ---------- 填入模式 ----------
  el.fillModeSelect.value = state.fillMode;
  el.fillModeSelect.addEventListener("change", () => {
    state.fillMode = el.fillModeSelect.value;
    toast(state.fillMode === "append" ? "已切换为追加模式" : "已切换为覆盖模式", "info");
  });

  // 监听 retry-last 自定义事件（来自 parseAiResponse 异常兜底）
  document.addEventListener("retry-last", () => {
    const msgs = el.chatMessages.querySelectorAll(".message.bot");
    if (msgs.length) msgs[msgs.length - 1].remove();
    handleSend(true);
  });

  // ---------- 跨天搜索 ----------
  el.searchBtn.addEventListener("click", () => {
    el.searchDialog.showModal();
    setTimeout(() => el.searchInput.focus(), 50);
  });
  el.closeSearch.addEventListener("click", () => el.searchDialog.close());
  el.searchDialog.addEventListener("click", (e) => { if (e.target === el.searchDialog) el.searchDialog.close(); });

  let searchTimer = null;
  el.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(doSearch, 200);
  });

  function doSearch() {
    const q = el.searchInput.value.trim().toLowerCase();
    if (!q) { el.searchResults.innerHTML = '<p class="panel-desc">输入关键词开始搜索…</p>'; return; }
    const results = [];
    // 搜索计划任务
    Object.keys(state.tasks).sort().reverse().forEach((date) => {
      const day = state.tasks[date];
      Object.keys(day).forEach((k) => {
        const tasks = day[k];
        if (!Array.isArray(tasks)) return;
        tasks.forEach((t, idx) => {
          const text = taskText(t).toLowerCase();
          if (text.includes(q)) {
            const [period, cell] = k.split("-").map(Number);
            results.push({ date, period, cell, idx, task: normalizeTask(t), text: taskText(t), type: "plan", label: "计划" });
          }
        });
      });
    });
    // 搜索执行记录
    if (state.records) {
      Object.keys(state.records).sort().reverse().forEach((date) => {
        const day = state.records[date];
        if (!day) return;
        Object.keys(day).forEach((k) => {
          const rec = day[k];
          if (!rec) return;
          const searchText = ((rec.actual || "") + " " + (rec.spent || "") + " " + (rec.note || "")).toLowerCase();
          if (searchText.includes(q)) {
            const [period, cell] = k.split("-").map(Number);
            const text = [rec.actual && `实际:${rec.actual}`, rec.spent && `花费:${rec.spent}`, rec.note && `备注:${rec.note}`].filter(Boolean).join(" · ");
            results.push({ date, period, cell, idx: 0, text, type: "record", label: "记录" });
          }
        });
      });
    }
    // 搜索复盘内容
    if (state.reviews) {
      Object.keys(state.reviews).sort().reverse().forEach((date) => {
        const review = state.reviews[date];
        if (!review) return;
        const searchText = ((review.summary || "") + " " + (review.userNotes || "") + " " + (review.insights || []).join(" ") + " " + (review.suggestions || []).join(" ")).toLowerCase();
        if (searchText.includes(q)) {
          const snippet = (review.summary || "").slice(0, 80);
          results.push({ date, period: 0, cell: 0, idx: 0, text: snippet, type: "review", label: "复盘" });
        }
      });
    }
    // 按日期排序
    results.sort((a, b) => b.date.localeCompare(a.date) || a.period - b.period);
    if (!results.length) {
      el.searchResults.innerHTML = '<p class="panel-desc">未找到匹配结果</p>';
      return;
    }
    el.searchResults.innerHTML = `<p class="panel-desc">找到 ${results.length} 个结果（计划${results.filter(r=>r.type==="plan").length} · 记录${results.filter(r=>r.type==="record").length} · 复盘${results.filter(r=>r.type==="review").length}）</p>`;
    results.slice(0, 50).forEach((r) => {
      const div = document.createElement("div");
      div.className = "search-result";
      const range = getCellRange(r.period, r.cell);
      const typeColor = r.type === "plan" ? "var(--realm-plan)" : r.type === "record" ? "var(--realm-record)" : "var(--realm-review)";
      const highlighted = escapeHtml(r.text).replace(new RegExp(escapeHtml(el.searchInput.value.trim()), "gi"), (m) => `<mark>${m}</mark>`);
      const timeLabel = r.type !== "review" ? ` · ${secondsToHHMM(range.start)}` : "";
      div.innerHTML = `
        <div class="search-result-date">
          <span style="display:inline-block;padding:0 6px;border-radius:4px;font-size:10px;background:${typeColor}22;color:${typeColor};">${r.label}</span>
          ${formatDateLabel(r.date)} · 第${r.period + 1}辰${timeLabel}
        </div>
        <div class="search-result-text">${highlighted}</div>`;
      div.addEventListener("click", () => {
        state.currentDate = r.date;
        state.activePeriod = r.period;
        el.searchDialog.close();
        renderAll();
        if (r.type === "review") setRealm("review");
        else if (r.type === "record") setRealm("record");
        else setRealm("plan");
        // 高亮目标格子
        setTimeout(() => {
          let grid = r.type === "record" ? el.recordGrid : el.mandalaGrid;
          if (!grid) grid = document.querySelector(".mandala-grid");
          if (grid) {
            const targetCell = grid.querySelector(`.cell[data-cell="${r.cell}"][data-period="${r.period}"]`)
              || grid.children[r.cell];
            if (targetCell) {
              targetCell.classList.remove("search-highlight");
              void targetCell.offsetWidth;
              targetCell.classList.add("search-highlight");
              targetCell.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }
        }, 350);
        toast("已跳转并高亮定位", "info");
      });
      el.searchResults.appendChild(div);
    });
  }

  // ---------- 批量操作 ----------
  el.batchBtn.addEventListener("click", () => {
    state.batchMode = !state.batchMode;
    if (!state.batchMode) state.batchSelected.clear();
    renderAll();
    if (state.batchMode) {
      showBatchToolbar();
      toast("批量模式已开启，点格子选择", "info");
    } else {
      hideBatchToolbar();
    }
  });

  function toggleBatchSelect(period, cell) {
    const k = cellKey(period, cell);
    if (state.batchSelected.has(k)) state.batchSelected.delete(k);
    else state.batchSelected.add(k);
    renderAll();
    updateBatchCount();
  }

  let batchToolbar = null;
  function showBatchToolbar() {
    if (batchToolbar) return;
    batchToolbar = document.createElement("div");
    batchToolbar.className = "batch-toolbar";
    batchToolbar.innerHTML = `
      <span class="batch-count" id="batchCount">已选 0</span>
      <button id="batchDoneBtn" class="primary">✓ 完成</button>
      <button id="batchUndoneBtn">↩ 取消完成</button>
      <button id="batchDelBtn" class="danger">🗑 删除</button>
      <button id="batchMoveBtn">↪ 移动</button>
      <button id="batchExitBtn">退出</button>`;
    document.body.appendChild(batchToolbar);
    batchToolbar.querySelector("#batchDoneBtn").addEventListener("click", () => batchSetDone(true));
    batchToolbar.querySelector("#batchUndoneBtn").addEventListener("click", () => batchSetDone(false));
    batchToolbar.querySelector("#batchDelBtn").addEventListener("click", batchDelete);
    batchToolbar.querySelector("#batchMoveBtn").addEventListener("click", batchMove);
    batchToolbar.querySelector("#batchExitBtn").addEventListener("click", () => {
      state.batchMode = false;
      state.batchSelected.clear();
      hideBatchToolbar();
      renderAll();
    });
    updateBatchCount();
    // 互斥：进入批量模式时隐藏番茄钟浮动条
    if (pomo.running && el.pomodoroBar) el.pomodoroBar.style.display = "none";
  }

  function hideBatchToolbar() {
    if (batchToolbar) { batchToolbar.remove(); batchToolbar = null; }
    // 互斥：退出批量模式时恢复番茄钟浮动条
    if (pomo.running && el.pomodoroBar) el.pomodoroBar.style.display = "flex";
  }

  function updateBatchCount() {
    if (!batchToolbar) return;
    const n = state.batchSelected.size;
    batchToolbar.querySelector("#batchCount").textContent = `已选 ${n}`;
  }

  function batchSetDone(done) {
    if (!state.batchSelected.size) return;
    state.batchSelected.forEach((k) => {
      const [p, c] = k.split("-").map(Number);
      setCellDone(p, c, done);
    });
    renderAll();
    toast(`已${done ? "标记完成" : "取消完成"} ${state.batchSelected.size} 项`, "success");
  }

  function batchDelete() {
    if (!state.batchSelected.size) return;
    if (!confirm(`删除 ${state.batchSelected.size} 个格子的任务？`)) return;
    state.batchSelected.forEach((k) => {
      const [p, c] = k.split("-").map(Number);
      setCellTasks(p, c, []);
      setCellDone(p, c, false);
    });
    state.batchSelected.clear();
    renderAll();
    updateBatchCount();
    toast("已批量删除", "info");
  }

  function batchMove() {
    if (!state.batchSelected.size) return;
    toast("点击目标空格子完成移动", "info");
    const handler = (e) => {
      const cellEl = e.target.closest(".cell");
      if (!cellEl) return;
      const cells = el.mandalaGrid.querySelectorAll(".cell");
      const idx = Array.from(cells).indexOf(cellEl);
      if (idx < 0) return;
      const targetPeriod = state.activePeriod;
      const targetCell = idx;
      // 合并所有选中任务到目标
      const merged = [];
      state.batchSelected.forEach((k) => {
        const [p, c] = k.split("-").map(Number);
        getCellTasks(p, c).forEach((t) => merged.push(normalizeTask(t)));
        if (p !== targetPeriod || c !== targetCell) {
          setCellTasks(p, c, []);
          setCellDone(p, c, false);
        }
      });
      const existing = getCellTasks(targetPeriod, targetCell);
      setCellTasks(targetPeriod, targetCell, existing.concat(merged));
      state.batchSelected.clear();
      renderAll();
      updateBatchCount();
      el.mandalaGrid.removeEventListener("click", handler, true);
      toast(`已移动 ${merged.length} 个任务`, "success");
    };
    el.mandalaGrid.addEventListener("click", handler, true);
  }

  // ---------- 浮动按钮：快速添加到下一空格 ----------
  el.fabAdd.addEventListener("click", () => {
    // 找当前时辰第一个空格，没有则找全天第一个空格
    let targetPeriod = state.activePeriod, targetCell = -1;
    for (let c = 0; c < CELLS_PER_PERIOD; c++) {
      if (!getCellTasks(targetPeriod, c).length) { targetCell = c; break; }
    }
    if (targetCell < 0) {
      for (let p = 0; p < PERIOD_COUNT && targetCell < 0; p++) {
        for (let c = 0; c < CELLS_PER_PERIOD; c++) {
          if (!getCellTasks(p, c).length) { targetPeriod = p; targetCell = c; break; }
        }
      }
    }
    if (targetCell < 0) { toast("今日所有格子已满", "info"); return; }
    state.activePeriod = targetPeriod;
    renderAll();
    openTaskDialog(targetPeriod, targetCell);
  });

  // ---------- 键盘快捷键 ----------
  el.shortcutBtn.addEventListener("click", () => el.shortcutDialog.showModal());
  el.closeShortcut.addEventListener("click", () => el.shortcutDialog.close());
  el.shortcutDialog.addEventListener("click", (e) => { if (e.target === el.shortcutDialog) el.shortcutDialog.close(); });

  document.addEventListener("keydown", (e) => {
    // 弹窗打开时不响应快捷键（Esc 由 dialog 默认处理）
    const dialogOpen = document.querySelector("dialog[open]");
    if (dialogOpen) {
      // Ctrl/Cmd+Enter 在弹窗内提交任务编辑
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && el.taskDialog.open) {
        e.preventDefault(); el.saveTask.click();
      }
      return;
    }
    // 在输入框/textarea 中时不响应单字母快捷键
    const tag = (e.target.tagName || "").toLowerCase();
    const inEditable = tag === "input" || tag === "textarea" || e.target.isContentEditable;
    if (inEditable) {
      // Ctrl/Cmd+Enter 发送对话
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault(); handleSend();
      }
      return;
    }
    // Ctrl/Cmd+Z 撤销
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault(); undoLastFill(); return;
    }
    // Tab / Shift+Tab 在三才间循环切换
    if (e.key === "Tab") {
      const order = ["plan", "record", "review"];
      const idx = order.indexOf(state.realm);
      const next = e.shiftKey
        ? (idx <= 0 ? order[2] : order[idx - 1])
        : (idx >= 2 ? order[0] : order[idx + 1]);
      const reverse = e.shiftKey;
      e.preventDefault();
      showKeyHint(e.shiftKey ? "⇧+Tab" : "Tab", `切换 → ${next === "plan" ? "天 · 计划" : next === "record" ? "地 · 记录" : "人 · 复盘"}`);
      setRealm(next, reverse);
      toast(`切换到 ${next === "plan" ? "天 · 计划" : next === "record" ? "地 · 记录" : "人 · 复盘"}`, "info");
      return;
    }
    switch (e.key) {
      case "j": case "J": case "ArrowRight":
        e.preventDefault(); el.nextPeriod.click(); break;
      case "k": case "K": case "ArrowLeft":
        e.preventDefault(); el.prevPeriod.click(); break;
      case "e": case "E":
        e.preventDefault();
        openTaskDialog(state.activePeriod, 0); break;
      case "d": case "D": {
        e.preventDefault();
        // 标记当前时辰第一个有任务的格子
        for (let c = 0; c < CELLS_PER_PERIOD; c++) {
          if (getCellTasks(state.activePeriod, c).length) { toggleDone(state.activePeriod, c); break; }
        }
        break;
      }
      case "+": case "=":
        e.preventDefault(); el.fabAdd.click(); break;
      case "?":
        e.preventDefault(); el.shortcutDialog.showModal(); break;
      // 三才切换：1=天/计划 2=地/记录 3=人/复盘
      case "1":
        e.preventDefault(); setRealm("plan"); break;
      case "2":
        e.preventDefault(); setRealm("record"); break;
      case "3":
        e.preventDefault(); setRealm("review"); break;
      // 助记快捷键：P=Plan L=Record(地) R=Review
      case "p": case "P":
        e.preventDefault(); showKeyHint("P", "天 · 计划"); setRealm("plan"); break;
      case "l": case "L":
        e.preventDefault(); showKeyHint("L", "地 · 记录"); setRealm("record"); break;
      case "r": case "R":
        e.preventDefault(); showKeyHint("R", "人 · 复盘"); setRealm("review"); break;
    }
  });

  // ---------- 拖拽任务移动 ----------
  let draggingSource = null; // {period, cell, index} 整格拖
  let draggingTaskSource = null; // {period, cell, idx} 单条拖

  function attachDragHandlers(cellEl, period, cell) {
    // 注意：cellEl 本身不再 draggable，由内部 task-bar 单条拖拽
    // 但保留 dragover/drop 用于接收单条任务拖入
    cellEl.addEventListener("dragover", (e) => {
      // 如果是单条任务拖拽，高亮目标格子
      if (draggingTaskSource) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        cellEl.classList.add("drag-over");
      }
    });
    cellEl.addEventListener("dragleave", () => {
      cellEl.classList.remove("drag-over");
    });
    cellEl.addEventListener("drop", (e) => {
      e.preventDefault();
      cellEl.classList.remove("drag-over");
      // 单条任务拖拽
      if (draggingTaskSource) {
        const src = draggingTaskSource;
        if (src.period === period && src.cell === cell) return; // 同格子不处理
        const sourceTasks = getCellTasks(src.period, src.cell).slice();
        const task = sourceTasks[src.idx];
        if (!task) return;
        // 从源格子移除
        sourceTasks.splice(src.idx, 1);
        setCellTasks(src.period, src.cell, sourceTasks);
        // 添加到目标格子
        const targetTasks = getCellTasks(period, cell).slice();
        targetTasks.push(task);
        setCellTasks(period, cell, targetTasks);
        renderAll();
        toast(`已移动任务到第 ${cell + 1} 格`, "success");
        return;
      }
    });
  }

  // ---------- 任务模板 ----------
  const TPL_KEY = "mandala-templates-v1";
  let templates = load(TPL_KEY, []);
  let convTemplates = load(CONV_TPL_KEY, []);

  // ---------- 对话模板 ----------
  function openConvTplDialog() {
    // 填充分类下拉
    const cats = state.settings.promptCategories || [];
    el.convTplCategory.innerHTML = '<option value="">（不绑定）</option>' +
      cats.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
    el.convTplName.value = "";
    el.convTplText.value = el.chatInput.value.trim();
    renderConvTplList();
    el.convTplDialog.showModal();
  }
  el.closeConvTpl.addEventListener("click", () => el.convTplDialog.close());
  el.convTplDialog.addEventListener("click", (e) => { if (e.target === el.convTplDialog) el.convTplDialog.close(); });

  // 知识评估 7 维度参考卡
  function openKnowledgeDimDialog() {
    if (!el.kdimGrid) return;
    el.kdimGrid.innerHTML = KNOWLEDGE_DIMENSIONS.map((d) => {
      const subs = d.subs.map((s) =>
        `<li><b>${s.name}</b>：${escapeHtml(s.q)}</li>`
      ).join("");
      return `<div class="kdim-card" style="--dim-color:${d.color};">
        <div class="kdim-head">
          <span class="kdim-code">${d.code}</span>
          <span class="kdim-name">${d.name}</span>
        </div>
        <ul class="kdim-subs">${subs}</ul>
      </div>`;
    }).join("");
    el.knowledgeDimDialog.showModal();
  }
  const closeKnowledgeDimBtn = document.getElementById("closeKnowledgeDim");
  if (closeKnowledgeDimBtn) closeKnowledgeDimBtn.addEventListener("click", () => el.knowledgeDimDialog.close());
  const closeKnowledgeDim2 = document.getElementById("closeKnowledgeDim2");
  if (closeKnowledgeDim2) closeKnowledgeDim2.addEventListener("click", () => el.knowledgeDimDialog.close());
  if (el.knowledgeDimDialog) el.knowledgeDimDialog.addEventListener("click", (e) => { if (e.target === el.knowledgeDimDialog) el.knowledgeDimDialog.close(); });
  const kdimToInboxBtn = document.getElementById("kdimToInbox");
  if (kdimToInboxBtn) kdimToInboxBtn.addEventListener("click", () => {
    el.knowledgeDimDialog.close();
    if (el.inboxBtn) el.inboxBtn.click();
    // 切换到长期任务模式
    setTimeout(() => {
      const longTab = document.querySelector('.inbox-mode-tab[data-mode="long"]');
      if (longTab) longTab.click();
    }, 80);
  });

  el.useInputConvTplBtn.addEventListener("click", () => {
    el.convTplText.value = el.chatInput.value.trim();
    if (!el.convTplName.value && el.convTplText.value) {
      el.convTplName.value = el.convTplText.value.slice(0, 12);
    }
    el.convTplName.focus();
  });

  el.saveConvTplBtn.addEventListener("click", () => {
    const name = el.convTplName.value.trim();
    const text = el.convTplText.value.trim();
    if (!name) { toast("请输入模板名称", "error"); return; }
    if (!text) { toast("请输入对话内容", "error"); return; }
    convTemplates.push({
      id: "ctpl_" + Date.now(),
      name,
      text,
      categoryId: el.convTplCategory.value || "",
      createdAt: new Date().toISOString(),
    });
    save(CONV_TPL_KEY, convTemplates);
    el.convTplName.value = "";
    el.convTplText.value = "";
    renderConvTplList();
    toast(`已保存对话模板「${name}」`, "success");
  });

  function renderConvTplList() {
    el.convTplList.innerHTML = "";
    if (!convTemplates.length) {
      el.convTplList.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">暂无对话模板</div>';
      return;
    }
    convTemplates.forEach((tpl) => {
      const cat = (state.settings.promptCategories || []).find((c) => c.id === tpl.categoryId);
      const item = document.createElement("div");
      item.className = "template-item";
      item.innerHTML = `
        <div class="template-info">
          <div class="template-name">${escapeHtml(tpl.name)}${cat ? ` <span class="cell-tag">${escapeHtml(cat.name)}</span>` : ""}</div>
          <div class="template-meta">${escapeHtml(tpl.text.slice(0, 40))}${tpl.text.length > 40 ? "…" : ""}</div>
        </div>
        <div class="template-actions">
          <button class="template-action-btn" data-act="use">填入并发送</button>
          <button class="template-action-btn" data-act="edit">填入输入框</button>
          <button class="template-action-btn danger" data-act="del">删除</button>
        </div>`;
      item.querySelector('[data-act="use"]').addEventListener("click", () => {
        applyConvTpl(tpl);
        el.convTplDialog.close();
        handleSend(false, tpl.text);
      });
      item.querySelector('[data-act="edit"]').addEventListener("click", () => {
        applyConvTpl(tpl);
        el.convTplDialog.close();
        toast("已填入输入框", "info");
      });
      item.querySelector('[data-act="del"]').addEventListener("click", () => {
        if (!confirm(`删除对话模板「${tpl.name}」？`)) return;
        convTemplates = convTemplates.filter((t) => t.id !== tpl.id);
        save(CONV_TPL_KEY, convTemplates);
        renderConvTplList();
        toast("已删除", "info");
      });
      el.convTplList.appendChild(item);
    });
  }

  function applyConvTpl(tpl) {
    // 绑定分类
    if (tpl.categoryId) {
      state.settings.activePromptId = tpl.categoryId;
      save(SETTINGS_KEY, state.settings);
      renderChatBadges();
    }
    el.chatInput.value = tpl.text;
    el.chatInput.dispatchEvent(new Event("input"));
    el.chatInput.focus();
  }

  el.templateBtn.addEventListener("click", () => {
    el.tplCurDate.textContent = formatDateLabel(state.currentDate);
    renderTemplateList();
    el.templateDialog.showModal();
  });
  el.closeTemplate.addEventListener("click", () => el.templateDialog.close());
  el.templateDialog.addEventListener("click", (e) => { if (e.target === el.templateDialog) el.templateDialog.close(); });

  el.saveTemplateBtn.addEventListener("click", () => {
    const dayTasks = getDayTasks(state.currentDate);
    const count = Object.values(dayTasks).reduce((s, arr) => s + arr.length, 0);
    if (!count) { toast("当前日期无任务，无需保存", "error"); return; }
    const name = prompt("模板名称：", `模板 ${templates.length + 1}`);
    if (!name) return;
    templates.push({
      id: "tpl_" + Date.now(),
      name,
      tasks: JSON.parse(JSON.stringify(dayTasks)),
      createdAt: new Date().toISOString(),
      count,
    });
    save(TPL_KEY, templates);
    renderTemplateList();
    toast(`已保存模板「${name}」`, "success");
  });

  function renderTemplateList() {
    el.templateList.innerHTML = "";
    if (!templates.length) {
      el.templateList.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">暂无模板</div>';
      return;
    }
    templates.forEach((tpl) => {
      const item = document.createElement("div");
      item.className = "template-item";
      item.innerHTML = `
        <div class="template-info">
          <div class="template-name">${escapeHtml(tpl.name)}</div>
          <div class="template-meta">${tpl.count} 条任务 · ${new Date(tpl.createdAt).toLocaleDateString()}</div>
        </div>
        <div class="template-actions">
          <button class="template-action-btn" data-act="apply">应用到当前日</button>
          <button class="template-action-btn danger" data-act="del">删除</button>
        </div>`;
      item.querySelector('[data-act="apply"]').addEventListener("click", () => {
        if (!confirm(`将模板「${tpl.name}」应用到 ${formatDateLabel(state.currentDate)}？\n（会与现有任务合并）`)) return;
        if (!state.tasks[state.currentDate]) state.tasks[state.currentDate] = {};
        Object.keys(tpl.tasks).forEach((k) => {
          const existing = state.tasks[state.currentDate][k] || [];
          state.tasks[state.currentDate][k] = existing.concat(tpl.tasks[k]);
        });
        save(STORAGE_KEY, state.tasks);
        renderAll();
        toast(`已应用模板，新增 ${tpl.count} 条任务`, "success");
      });
      item.querySelector('[data-act="del"]').addEventListener("click", () => {
        if (!confirm(`删除模板「${tpl.name}」？`)) return;
        templates = templates.filter((t) => t.id !== tpl.id);
        save(TPL_KEY, templates);
        renderTemplateList();
        toast("已删除", "info");
      });
      el.templateList.appendChild(item);
    });
  }

  // ---------- iCal 导出 ----------
  el.icalBtn.addEventListener("click", () => {
    const dayTasks = getDayTasks(state.currentDate);
    const count = Object.values(dayTasks).reduce((s, arr) => s + arr.length, 0);
    if (!count) { toast("当前日期无任务可导出", "error"); return; }
    const ics = generateIcs(state.currentDate, dayTasks);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mandala-${state.currentDate}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`已导出 ${count} 个任务到 .ics`, "success");
  });

  function generateIcs(dateStr, dayTasks) {
    const dt = strToDate(dateStr);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    const pad = (n) => String(n).padStart(2, "0");
    const fmtDT = (totalSec) => {
      const h = Math.floor(totalSec / 3600);
      const mi = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      return `${y}${m}${d}T${pad(h)}${pad(mi)}${pad(s)}`;
    };
    let ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Mandala Time//Mandala Scheduler//CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];
    Object.keys(dayTasks).forEach((k) => {
      const [p, c] = k.split("-").map(Number);
      const range = getCellRange(p, c);
      const tasks = dayTasks[k];
      tasks.forEach((t, idx) => {
        ics.push("BEGIN:VEVENT");
        ics.push(`UID:mandala-${dateStr}-${p}-${c}-${idx}@mandala.app`);
        ics.push(`DTSTAMP:${fmtDT(range.start)}`);
        ics.push(`DTSTART:${fmtDT(range.start)}`);
        ics.push(`DTEND:${fmtDT(range.end)}`);
        ics.push(`SUMMARY:${t.replace(/[\r\n]+/g, " ")}`);
        ics.push(`DESCRIPTION:第${p + 1}时辰 第${c + 1}格`);
        ics.push("END:VEVENT");
      });
    });
    ics.push("END:VCALENDAR");
    return ics.join("\r\n");
  }

  function autoFillToday() {
    const sample = [
      { period: 0, cell: 0, content: "晨练：跑步" },
      { period: 0, cell: 1, content: "晨练：拉伸" },
      { period: 0, cell: 3, content: "晨读：英语" },
      { period: 1, cell: 0, content: "深度工作：写报告（1/4）" },
      { period: 1, cell: 1, content: "深度工作：写报告（2/4）" },
      { period: 1, cell: 2, content: "深度工作：写报告（3/4）" },
      { period: 1, cell: 3, content: "深度工作：写报告（4/4）" },
      { period: 3, cell: 0, content: "会议 A" },
      { period: 3, cell: 3, content: "会议 B" },
      { period: 5, cell: 0, content: "复盘今日工作" },
      { period: 7, cell: 0, content: "阅读（1/4）" },
      { period: 7, cell: 1, content: "阅读（2/4）" },
      { period: 7, cell: 2, content: "阅读（3/4）" },
      { period: 7, cell: 3, content: "阅读（4/4）" },
      { period: 8, cell: 0, content: "写日记" },
      { period: 8, cell: 4, content: "冥想放松" },
    ];
    // 清空当日后填充
    state.tasks[state.currentDate] = {};
    state.done[state.currentDate] = {};
    sample.forEach((t) => addCellTask(t.period, t.cell, t.content));
    state.chatState = "done";
    state.pendingPlan = null;
    clearSuggestions();
    renderAll();
    addBotMessage("已自动填充示例日程。点击格子可编辑（每行一个任务），长按可标记完成。");
    toast("已填充示例", "success");
  }

  // ---------- 日历 ----------
  el.calendarBtn.addEventListener("click", () => openCalendar());
  el.calendarDialog.addEventListener("click", (e) => { if (e.target === el.calendarDialog) el.calendarDialog.close(); });

  function openCalendar() {
    const d = strToDate(state.currentDate);
    state.calMonth = { year: d.getFullYear(), month: d.getMonth() };
    renderCalendar();
    el.calendarDialog.showModal();
  }

  el.calPrev.addEventListener("click", () => {
    state.calMonth.month--;
    if (state.calMonth.month < 0) { state.calMonth.month = 11; state.calMonth.year--; }
    renderCalendar();
  });
  el.calNext.addEventListener("click", () => {
    state.calMonth.month++;
    if (state.calMonth.month > 11) { state.calMonth.month = 0; state.calMonth.year++; }
    renderCalendar();
  });

  function renderCalendar() {
    const { year, month } = state.calMonth;
    const monthNames = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
    el.calTitle.textContent = `${year}年 ${monthNames[month]}`;

    const firstDay = new Date(year, month, 1);
    // 周一=0, 周日=6
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = dateToStr(new Date());

    el.calGrid.innerHTML = "";
    // 前置空格
    for (let i = 0; i < startWeekday; i++) {
      const empty = document.createElement("div");
      empty.className = "cal-day empty";
      el.calGrid.appendChild(empty);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = dateToStr(new Date(year, month, day));
      const dayTasks = getDayTasks(dateStr);
      const taskCount = Object.values(dayTasks).reduce((sum, arr) => sum + arr.length, 0);

      const dayEl = document.createElement("div");
      dayEl.className = "cal-day";
      if (dateStr === todayStr) dayEl.classList.add("today");
      if (dateStr === state.currentDate) dayEl.classList.add("selected");
      if (taskCount > 0) dayEl.classList.add("has-task");

      dayEl.innerHTML = `<span>${day}</span>` + (taskCount > 0 ? `<span class="cal-task-count">${taskCount}</span>` : "");
      dayEl.addEventListener("click", () => {
        state.currentDate = dateStr;
        state.activePeriod = isToday(dateStr) ? Math.max(0, getCurrentPeriod()) : 0;
        el.calendarDialog.close();
        renderAll();
        toast(`切换到 ${formatDateLabel(dateStr)}`, "info");
      });
      el.calGrid.appendChild(dayEl);
    }
  }

  // ---------- 统计 ----------
  el.statBtn.addEventListener("click", () => { renderStat(); el.statDialog.showModal(); });
  el.closeStat.addEventListener("click", () => el.statDialog.close());
  el.statDialog.addEventListener("click", (e) => { if (e.target === el.statDialog) el.statDialog.close(); });

  // ---------- 长期任务（时间地图） ----------
  let longTasks = load(LONGTASK_KEY, []);

  function saveLongTasks() { save(LONGTASK_KEY, longTasks); }

  function genLongId() {
    return "lt-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // 计算时间地图的时间范围（取所有任务的最早开始到最晚截止，至少覆盖今天前后 14 天）
  function getTimelineRange() {
    if (!longTasks.length) {
      const today = new Date(state.currentDate);
      const start = new Date(today); start.setDate(today.getDate() - 3);
      const end = new Date(today); end.setDate(today.getDate() + 11);
      return { start, end };
    }
    let minD = null, maxD = null;
    longTasks.forEach((t) => {
      const s = t.startDate ? new Date(t.startDate) : null;
      const e = t.dueDate ? new Date(t.dueDate) : null;
      if (s && (!minD || s < minD)) minD = s;
      if (e && (!maxD || e > maxD)) maxD = e;
    });
    if (!minD) minD = new Date(state.currentDate);
    if (!maxD) { maxD = new Date(minD); maxD.setDate(maxD.getDate() + 14); }
    // 扩展边界，保证今日可见
    const today = new Date(state.currentDate);
    if (today < minD) { minD = new Date(today); minD.setDate(minD.getDate() - 3); }
    if (today > maxD) { maxD = new Date(today); maxD.setDate(maxD.getDate() + 7); }
    // 两端各留 1 天余量
    minD = new Date(minD); minD.setDate(minD.getDate() - 1);
    maxD = new Date(maxD); maxD.setDate(maxD.getDate() + 1);
    return { start: minD, end: maxD };
  }

  function daysBetween(a, b) {
    const ms = b.setHours(0,0,0,0) - a.setHours(0,0,0,0);
    return Math.round(ms / 86400000);
  }

  // 渲染顶部时间地图
  function renderLongtaskBar() {
    const tl = el.longtaskTimeline;
    if (!tl) return;
    const range = getTimelineRange();
    const totalDays = Math.max(1, daysBetween(new Date(range.start), new Date(range.end)));
    const todayStr = state.currentDate;
    const todayIdx = Math.max(0, Math.min(totalDays, daysBetween(new Date(range.start), new Date(todayStr))));

    // 刻度（每 N 天一格，视总跨度）
    const step = totalDays > 60 ? 7 : (totalDays > 21 ? 3 : 1);
    let ticks = "";
    for (let d = 0; d <= totalDays; d += step) {
      const dt = new Date(range.start); dt.setDate(dt.getDate() + d);
      const pct = (d / totalDays) * 100;
      const isToday = dateToStr(dt) === todayStr;
      ticks += `<div class="ltb-tick ${isToday ? "today" : ""}" style="left:${pct}%;">
        <span class="ltb-tick-label">${dt.getMonth()+1}/${dt.getDate()}</span>
      </div>`;
    }

    // 任务条
    let bars = "";
    longTasks.forEach((t, i) => {
      const s = t.startDate ? new Date(t.startDate) : new Date(range.start);
      const e = t.dueDate ? new Date(t.dueDate) : new Date(range.end);
      const startOff = Math.max(0, daysBetween(new Date(range.start), s));
      const endOff = Math.min(totalDays, daysBetween(new Date(range.start), e));
      const leftPct = (startOff / totalDays) * 100;
      const widthPct = Math.max(2, ((endOff - startOff) / totalDays) * 100);
      const color = t.color || LONGTASK_COLORS[i % LONGTASK_COLORS.length];
      const isOverdue = !t.done && t.dueDate && new Date(t.dueDate) < new Date(todayStr);
      const repeatLabel = t.repeat && t.repeat !== "none" ? " 🔁" : "";
      bars += `<div class="ltb-bar ${t.done ? "done" : ""} ${isOverdue ? "overdue" : ""}"
        style="left:${leftPct}%;width:${widthPct}%;background:${color};"
        data-id="${t.id}" title="${escapeHtml(t.title)}（${t.startDate||"?"} → ${t.dueDate||"?"}）${repeatLabel}">
        <span class="ltb-bar-label">${escapeHtml(t.title.slice(0, 12))}${t.title.length>12?"…":""}${repeatLabel}</span>
        <span class="ltb-bar-progress" style="width:${t.progress||0}%;background:rgba(255,255,255,0.25);"></span>
      </div>`;
    });

    // 今日竖线
    const todayPct = (todayIdx / totalDays) * 100;

    tl.innerHTML = `
      <div class="ltb-track">
        <div class="ltb-ticks">${ticks}</div>
        <div class="ltb-today-line" style="left:${todayPct}%;"></div>
        <div class="ltb-bars">${bars || '<div class="ltb-empty">暂无长期任务，点「新建」或到收集箱添加</div>'}</div>
      </div>
    `;

    // 提示文字
    if (el.ltbHint) {
      const active = longTasks.filter((t) => !t.done).length;
      const overdue = longTasks.filter((t) => !t.done && t.dueDate && new Date(t.dueDate) < new Date(todayStr)).length;
      el.ltbHint.textContent = active ? `${active} 个进行中${overdue ? ` · ${overdue} 个已逾期` : ""}` : "跨日/周/月的长线任务";
    }

    // 点击任务条打开详情
    tl.querySelectorAll(".ltb-bar").forEach((bar) => {
      bar.addEventListener("click", () => openLongDetail(bar.dataset.id));
    });
  }

  // 填充「绑定今日格子」下拉
  function fillLongBindCell() {
    if (!el.longBindCell) return;
    const opts = ['<option value="">不绑定</option>'];
    for (let p = 0; p < PERIOD_COUNT; p++) {
      const range = getPeriodRange(p);
      for (let c = 0; c < CELLS_PER_PERIOD; c++) {
        const cellStart = range.start + c * SECONDS_PER_CELL;
        const cellEnd = cellStart + SECONDS_PER_CELL;
        const key = `${p}-${c}`;
        opts.push(`<option value="${key}">第${p+1}辰·${secondsToHHMM(cellStart)}-${secondsToHHMM(cellEnd)}</option>`);
      }
    }
    el.longBindCell.innerHTML = opts.join("");
  }

  // 重置长期任务表单
  function resetLongForm() {
    if (!el.longTitle) return;
    el.longTitle.value = "";
    el.longStart.value = state.currentDate;
    const def = new Date(state.currentDate); def.setDate(def.getDate() + 7);
    el.longDue.value = dateToStr(def);
    el.longRepeat.value = "none";
    el.longBindCell.value = "";
    el.longNote.value = "";
    fillLongBindCell();
  }

  // 保存长期任务
  function saveLongForm() {
    const title = el.longTitle.value.trim();
    if (!title) { toast("请输入长期事项标题", "error"); return; }
    const start = el.longStart.value || state.currentDate;
    const due = el.longDue.value || "";
    if (due && due < start) { toast("截止日期不能早于开始日期", "error"); return; }
    const repeat = el.longRepeat.value;
    const bindCell = el.longBindCell.value;
    const note = el.longNote.value.trim();
    const id = genLongId();
    const color = LONGTASK_COLORS[longTasks.length % LONGTASK_COLORS.length];
    const task = {
      id, title, note,
      startDate: start, dueDate: due,
      repeat, bindCell,
      progress: 0,
      color,
      eval: emptyEval(),
      createdAt: Date.now(),
      done: false,
    };
    longTasks.unshift(task);
    saveLongTasks();

    // 若绑定了今日格子，把任务标题写入对应格子
    if (bindCell) {
      const [p, c] = bindCell.split("-").map(Number);
      const key = cellKey(state.currentDate, p, c);
      if (!state.tasks[key]) state.tasks[key] = [];
      state.tasks[key].push({ text: "🗺️ " + title, priority: 2, tag: "长期", done: false });
      save(STORAGE_KEY, state.tasks);
    }
    resetLongForm();
    renderLongList();
    renderLongtaskBar();
    toast("长期任务已创建", "success");
  }

  // 渲染收集箱中的长期任务列表
  function renderLongList() {
    if (!el.longList) return;
    if (!longTasks.length) {
      el.longList.innerHTML = '<div class="inbox-empty">暂无长期任务</div>';
      return;
    }
    const todayStr = state.currentDate;
    el.longList.innerHTML = longTasks.map((t) => {
      const idx = longTasks.indexOf(t);
      const isOverdue = !t.done && t.dueDate && t.dueDate < todayStr;
      const repeatLabel = t.repeat && t.repeat !== "none"
        ? `<span class="long-repeat-badge">${REPEAT_OPTIONS.find((r)=>r.value===t.repeat)?.label||t.repeat}</span>` : "";
      const dueLabel = t.dueDate ? `<span class="long-due ${isOverdue?"overdue":""}">截止 ${t.dueDate}</span>` : "";
      return `<div class="long-item ${t.done?"done":""}" data-id="${t.id}">
        <span class="long-item-cb ${t.done?"checked":""}" data-id="${t.id}">${t.done?"✓":""}</span>
        <div class="long-item-main">
          <div class="long-item-title">${escapeHtml(t.title)}</div>
          <div class="long-item-meta">
            <span class="long-date">${t.startDate||"?"} → ${t.dueDate||"?"}</span>
            ${dueLabel}${repeatLabel}
            <span class="long-progress-badge">${t.progress||0}%</span>
          </div>
          ${t.note?`<div class="long-item-note">${escapeHtml(t.note)}</div>`:""}
        </div>
        <button class="long-item-eval" data-id="${t.id}" title="知识评估 7 维度">🧠</button>
        <button class="long-item-edit" data-id="${t.id}" title="详情/编辑">✏</button>
        <button class="long-item-del" data-id="${t.id}" title="删除">🗑</button>
      </div>`;
    }).join("");

    // 绑定事件
    el.longList.querySelectorAll(".long-item-cb").forEach((cb) => {
      cb.addEventListener("click", (e) => {
        e.stopPropagation();
        const t = longTasks.find((x) => x.id === cb.dataset.id);
        if (t) { t.done = !t.done; if (t.done) t.progress = 100; saveLongTasks(); renderLongList(); renderLongtaskBar(); }
      });
    });
    el.longList.querySelectorAll(".long-item-eval").forEach((b) => {
      b.addEventListener("click", (e) => { e.stopPropagation(); openLongDetail(b.dataset.id, "eval"); });
    });
    el.longList.querySelectorAll(".long-item-edit").forEach((b) => {
      b.addEventListener("click", (e) => { e.stopPropagation(); openLongDetail(b.dataset.id); });
    });
    el.longList.querySelectorAll(".long-item-del").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const i = longTasks.findIndex((x) => x.id === b.dataset.id);
        if (i >= 0) {
          if (confirm("删除该长期任务？")) {
            longTasks.splice(i, 1); saveLongTasks(); renderLongList(); renderLongtaskBar();
            toast("已删除", "info");
          }
        }
      });
    });
    el.longList.querySelectorAll(".long-item").forEach((item) => {
      item.addEventListener("click", () => openLongDetail(item.dataset.id));
    });
  }

  // 打开长期任务详情弹窗（含知识评估 7 维度）
  function openLongDetail(id, focusTab) {
    const t = longTasks.find((x) => x.id === id);
    if (!t) return;
    el.ltdTitle.textContent = (t.done ? "✓ " : "") + t.title;
    if (!t.eval) t.eval = emptyEval();

    // 进度滑块
    const progress = t.progress || 0;
    const overall = Math.round(
      KNOWLEDGE_DIMENSIONS.reduce((sum, d) => sum + dimScore(t.eval, d), 0) / KNOWLEDGE_DIMENSIONS.length
    );

    // 7 维度评分表（薄弱项 ≤2 分高亮）
    const weakSet = new Set(findWeakDims(t.eval, 2).map((w) => w.sub));
    const weakCount = weakSet.size;
    const dimsHtml = KNOWLEDGE_DIMENSIONS.map((d) => {
      const score = dimScore(t.eval, d);
      const subs = d.subs.map((s) => {
        const v = t.eval[s.key] || 0;
        const weak = weakSet.has(s.key);
        return `<div class="eval-sub ${weak ? "weak" : ""}">
          <span class="eval-sub-name">${s.name}</span>
          <span class="eval-sub-q">${s.q}</span>
          <div class="eval-stars" data-key="${s.key}">
            ${[1,2,3,4,5].map((n) => `<span class="eval-star ${v>=n?"on":""}" data-n="${n}">★</span>`).join("")}
          </div>
        </div>`;
      }).join("");
      return `<div class="eval-dim" style="--dim-color:${d.color};">
        <div class="eval-dim-head">
          <span class="eval-dim-code">${d.code}</span>
          <span class="eval-dim-name">${d.name}</span>
          <span class="eval-dim-score">${score.toFixed(1)}</span>
        </div>
        <div class="eval-subs">${subs}</div>
      </div>`;
    }).join("");

    el.ltdBody.innerHTML = `
      <div class="ltd-section">
        <div class="ltd-row">
          <label>标题</label>
          <input type="text" id="ltdEditTitle" value="${escapeHtml(t.title)}" maxlength="60" />
        </div>
        <div class="ltd-row">
          <label>开始</label><input type="date" id="ltdEditStart" value="${t.startDate||""}" />
          <label>截止</label><input type="date" id="ltdEditDue" value="${t.dueDate||""}" />
        </div>
        <div class="ltd-row">
          <label>重复</label>
          <select id="ltdEditRepeat">
            ${REPEAT_OPTIONS.map((r)=>`<option value="${r.value}" ${t.repeat===r.value?"selected":""}>${r.label}</option>`).join("")}
          </select>
          <label>进度</label>
          <input type="range" id="ltdEditProgress" min="0" max="100" value="${progress}" style="flex:1;" />
          <span id="ltdProgressVal" style="min-width:36px;text-align:right;">${progress}%</span>
        </div>
        <div class="ltd-row">
          <label>备注</label>
          <input type="text" id="ltdEditNote" value="${escapeHtml(t.note||"")}" maxlength="120" style="flex:1;" />
        </div>
        <div class="ltd-row">
          <button class="tool-btn" id="ltdToggleDone">${t.done?"↩ 标记未完成":"✓ 标记完成"}</button>
          <button class="tool-btn" id="ltdSave" style="background:var(--accent);color:#fff;">💾 保存修改</button>
          <button class="tool-btn" id="ltdDel" style="background:var(--danger);color:#fff;">🗑 删除</button>
        </div>
      </div>

      <div class="ltd-section">
        <div class="ltd-section-head">
          <h4>🧠 知识评估 7 维度</h4>
          <span class="ltd-overall">综合 ${overall} / 5</span>
        </div>
        <p class="panel-desc">标准 编号前缀 · 子维度 · 核心追问。点击星标打分（1-5），用于追踪长线学习/任务的理解深度。</p>
        <div class="ltd-row" style="margin-bottom:8px;">
          <button class="tool-btn" id="ltdDrillHatch" style="background:linear-gradient(135deg,rgba(255,200,80,0.2),rgba(124,92,255,0.2));">
            🎯 薄弱补强孵化${weakCount ? `（${weakCount} 项薄弱）` : "（无薄弱，已掌握）"}
          </button>
        </div>
        <div class="eval-grid">${dimsHtml}</div>
      </div>
    `;

    // 薄弱补强孵化按钮
    const drillBtn = el.ltdBody.querySelector("#ltdDrillHatch");
    if (drillBtn) {
      drillBtn.addEventListener("click", () => {
        if (!weakCount) {
          toast("7 维度评分均 ≥3，无明显薄弱项", "info");
          return;
        }
        if (!state.settings.apiUrl || !state.settings.apiKey) {
          toast("请先在设置中配置 AI API", "error");
          return;
        }
        // 关闭详情弹窗，打开孵化弹窗（drill 场景）
        el.longtaskDetailDialog.close();
        const mode = weakCount > 4 ? "zen" : (weakCount > 2 ? "medium" : "lite");
        el.hatchTaskText.textContent = t.title;
        el.hatchMode.value = mode;
        el.hatchScene.value = "drill";
        el.hatchProgress.hidden = true;
        el.hatchResult.hidden = true;
        el.hatchError.hidden = true;
        el.hatchHistoryHint.hidden = true;
        el.hatchDialog.showModal();
        runHatch(t.title, mode, "drill", `长期任务：${t.title}（进度 ${progress}%）`, t.id);
      });
    }

    el.longtaskDetailDialog.showModal();

    // 星标打分
    el.ltdBody.querySelectorAll(".eval-stars").forEach((wrap) => {
      const key = wrap.dataset.key;
      wrap.querySelectorAll(".eval-star").forEach((star) => {
        star.addEventListener("click", () => {
          const n = parseInt(star.dataset.n, 10);
          t.eval[key] = (t.eval[key] === n) ? n - 1 : n;
          saveLongTasks();
          // 局部刷新星标与分数
          wrap.querySelectorAll(".eval-star").forEach((s) => {
            const sn = parseInt(s.dataset.n, 10);
            s.classList.toggle("on", (t.eval[key] || 0) >= sn);
          });
          const dim = KNOWLEDGE_DIMENSIONS.find((d) => d.subs.some((s) => s.key === key));
          if (dim) {
            const head = wrap.closest(".eval-dim").querySelector(".eval-dim-score");
            head.textContent = dimScore(t.eval, dim).toFixed(1);
          }
          const newOverall = Math.round(
            KNOWLEDGE_DIMENSIONS.reduce((sum, d) => sum + dimScore(t.eval, d), 0) / KNOWLEDGE_DIMENSIONS.length
          );
          el.ltdBody.querySelector(".ltd-overall").textContent = `综合 ${newOverall} / 5`;
        });
      });
    });

    // 进度滑块
    const progInput = el.ltdBody.querySelector("#ltdEditProgress");
    const progVal = el.ltdBody.querySelector("#ltdProgressVal");
    progInput.addEventListener("input", () => { progVal.textContent = progInput.value + "%"; });

    // 保存
    el.ltdBody.querySelector("#ltdSave").addEventListener("click", () => {
      t.title = el.ltdBody.querySelector("#ltdEditTitle").value.trim() || t.title;
      t.startDate = el.ltdBody.querySelector("#ltdEditStart").value || t.startDate;
      t.dueDate = el.ltdBody.querySelector("#ltdEditDue").value || t.dueDate;
      t.repeat = el.ltdBody.querySelector("#ltdEditRepeat").value;
      t.progress = parseInt(progInput.value, 10);
      t.note = el.ltdBody.querySelector("#ltdEditNote").value.trim();
      if (t.progress >= 100) t.done = true;
      saveLongTasks();
      el.ltdTitle.textContent = (t.done ? "✓ " : "") + t.title;
      renderLongList();
      renderLongtaskBar();
      toast("已保存", "success");
    });

    el.ltdBody.querySelector("#ltdToggleDone").addEventListener("click", () => {
      t.done = !t.done; if (t.done) t.progress = 100; saveLongTasks();
      el.ltdTitle.textContent = (t.done ? "✓ " : "") + t.title;
      renderLongList(); renderLongtaskBar();
      el.longtaskDetailDialog.close();
    });

    el.ltdBody.querySelector("#ltdDel").addEventListener("click", () => {
      if (confirm("删除该长期任务？")) {
        const i = longTasks.findIndex((x) => x.id === id);
        if (i >= 0) { longTasks.splice(i, 1); saveLongTasks(); renderLongList(); renderLongtaskBar(); }
        el.longtaskDetailDialog.close();
        toast("已删除", "info");
      }
    });
  }

  // 顶部「新建」按钮 → 打开收集箱并切到长期任务 tab
  if (el.ltbAddBtn) {
    el.ltbAddBtn.addEventListener("click", () => {
      openInbox();
      switchInboxMode("long");
      resetLongForm();
      el.longTitle && el.longTitle.focus();
    });
  }

  // 收集箱模式切换
  function switchInboxMode(mode) {
    const tabs = document.querySelectorAll(".inbox-mode-tab");
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
    if (el.inboxQuickPane) el.inboxQuickPane.hidden = (mode !== "quick");
    if (el.inboxLongPane) el.inboxLongPane.hidden = (mode !== "long");
    if (mode === "long") { resetLongForm(); renderLongList(); }
  }
  document.querySelectorAll(".inbox-mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchInboxMode(tab.dataset.mode));
  });

  // 长期任务表单保存
  if (el.longSaveBtn) el.longSaveBtn.addEventListener("click", saveLongForm);
  if (el.longTitle) {
    el.longTitle.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveLongForm(); } });
  }
  if (el.closeLongDetail) el.closeLongDetail.addEventListener("click", () => el.longtaskDetailDialog.close());
  if (el.longtaskDetailDialog) el.longtaskDetailDialog.addEventListener("click", (e) => { if (e.target === el.longtaskDetailDialog) el.longtaskDetailDialog.close(); });

  // ---------- 待办收集箱 ----------
  const INBOX_KEY = "mandala-inbox-v1";
  let inboxItems = load(INBOX_KEY, []);
  let inboxFilterTag = "";
  let inboxTimeFilter = "all";

  function saveInbox() { save(INBOX_KEY, inboxItems); }

  function getInboxTags() {
    const tags = new Set();
    inboxItems.forEach((i) => { if (i.tag) tags.add(i.tag); });
    return Array.from(tags);
  }

  function updateInboxTagDatalist() {
    const tags = getInboxTags();
    if (el.inboxTagList) {
      el.inboxTagList.innerHTML = tags.map((t) => `<option value="${escapeHtml(t)}">`).join("");
    }
    // 渲染可点击的 tag chips（datalist 原生 UX 差，点不开）
    if (el.inboxTagChips) {
      el.inboxTagChips.innerHTML = tags.length
        ? tags.map((t) => `<span class="inbox-tag-chip" data-tag="${escapeHtml(t)}" style="background:${tagColor(t)}20;color:${tagColor(t)};">${escapeHtml(t)}</span>`).join("")
        : '<span class="inbox-tag-chip-empty">尚无标签</span>';
      el.inboxTagChips.querySelectorAll(".inbox-tag-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          if (el.inboxCategory) {
            el.inboxCategory.value = chip.dataset.tag;
            el.inboxInput.focus();
          }
        });
      });
    }
  }

  function openInbox() {
    // 每次打开重新从 localStorage 加载，含 Hermes 远程同步的卡片
    inboxItems = load(INBOX_KEY, []);
    updateInboxTagDatalist();
    renderInboxFilter();
    renderInboxList();
    el.inboxDialog.showModal();
    el.inboxInput.focus();
  }

  function renderInboxFilter() {
    const tags = getInboxTags();
    const chips = [{ tag: "", label: "全部" }].concat(tags.map((t) => ({ tag: t, label: t })));
    el.inboxFilter.innerHTML = chips.map((c) =>
      `<span class="inbox-filter-chip ${inboxFilterTag === c.tag ? "active" : ""}" data-tag="${escapeHtml(c.tag)}">${escapeHtml(c.label)}</span>`
    ).join("");
    el.inboxFilter.querySelectorAll(".inbox-filter-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        inboxFilterTag = chip.dataset.tag;
        renderInboxFilter();
        renderInboxList();
      });
    });
  }

  function filterInboxItems() {
    let filtered = inboxItems;
    if (inboxFilterTag) filtered = filtered.filter((i) => i.tag === inboxFilterTag);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 86400000;
    switch (inboxTimeFilter) {
      case "today": filtered = filtered.filter((i) => i.createdAt >= todayStart); break;
      case "week": filtered = filtered.filter((i) => i.createdAt >= weekStart); break;
      case "undone": filtered = filtered.filter((i) => !i.done); break;
      case "done": filtered = filtered.filter((i) => i.done); break;
    }
    return filtered;
  }

  function tagColor(tag) {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    const colors = ["#60a5fa", "#7c5cff", "#4ade80", "#fbbf24", "#f87171", "#fb923c", "#34d399", "#a78bfa"];
    return colors[Math.abs(hash) % colors.length];
  }

  function renderInboxList() {
    const filtered = filterInboxItems();
    if (!filtered.length) {
      el.inboxList.innerHTML = '<div class="inbox-empty">暂无内容，想到什么先记下来吧</div>';
      return;
    }
    el.inboxList.innerHTML = filtered.map((item) => {
      const realIdx = inboxItems.indexOf(item);
      const d = item.createdAt ? new Date(item.createdAt) : null;
      const dateStr = d
        ? d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) + " " + d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
        : "";
      // Hermes 写入的卡片型 item（wiki/reading/summary）
      if (item.kind === "card") {
        const cardType = item.type || "reading";
        const meta = { reading: "📖 待读", wiki: "📚 知识", summary: "📝 总结" }[cardType] || "📭 卡片";
        return `<div class="inbox-card ${item.done ? "done" : ""}" data-idx="${realIdx}">
          <div class="inbox-card-head">
            <span class="inbox-card-type">${meta}</span>
            <span class="inbox-item-date">${dateStr}</span>
            <button class="inbox-item-del" data-idx="${realIdx}" title="删除">✕</button>
          </div>
          <div class="inbox-card-title">${escapeHtml(item.title || item.text || "")}</div>
          ${item.summary ? `<div class="inbox-card-summary">${escapeHtml(item.summary)}</div>` : ""}
          ${item.link ? `<a class="inbox-card-link" href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.source || item.link)}</a>` : ""}
          <div class="inbox-card-actions">
            <button class="inbox-card-act" data-act="tochat" data-idx="${realIdx}">💬 发给AI</button>
            <button class="inbox-card-act" data-act="done" data-idx="${realIdx}">${item.done ? "↩ 取消完成" : "✓ 标记完成"}</button>
          </div>
        </div>`;
      }
      // 原速记型 item
      return `<div class="inbox-item ${item.done ? "done" : ""}" data-idx="${realIdx}">
        <span class="inbox-item-cb ${item.done ? "checked" : ""}" data-idx="${realIdx}">${item.done ? "✓" : ""}</span>
        <span class="inbox-item-text">${escapeHtml(item.text)}</span>
        ${item.tag ? `<span class="inbox-item-tag" style="background:${tagColor(item.tag)}20;color:${tagColor(item.tag)};">${escapeHtml(item.tag)}</span>` : ""}
        <span class="inbox-item-date">${dateStr}</span>
        <button class="inbox-item-act" data-act="tolong" data-idx="${realIdx}" title="转为长期任务">🗺️</button>
        <button class="inbox-item-del" data-idx="${realIdx}" title="删除">✕</button>
      </div>`;
    }).join("");
    el.inboxList.querySelectorAll(".inbox-item-cb").forEach((cb) => {
      cb.addEventListener("click", () => {
        const idx = parseInt(cb.dataset.idx);
        inboxItems[idx].done = !inboxItems[idx].done;
        saveInbox();
        renderInboxList();
      });
    });
    el.inboxList.querySelectorAll(".inbox-item-del").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx);
        inboxItems.splice(idx, 1);
        saveInbox();
        updateInboxTagDatalist();
        renderInboxFilter();
        renderInboxList();
      });
    });
    el.inboxList.querySelectorAll(".inbox-item-act").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx);
        const it = inboxItems[idx];
        if (!it) return;
        switchInboxMode("long");
        if (el.longTitle) {
          el.longTitle.value = it.text.slice(0, 60);
          el.longTitle.focus();
        }
        if (!el.longStart.value) el.longStart.value = state.currentDate;
        if (it.tag && el.longNote) el.longNote.value = "来源：速记 #" + (it.tag || "");
        toast("已填入长期任务表单，补充日期后保存", "info");
      });
    });
    el.inboxList.querySelectorAll(".inbox-item-text").forEach((txt) => {
      txt.addEventListener("click", () => {
        const idx = parseInt(txt.parentElement.dataset.idx);
        el.chatInput.value = inboxItems[idx].text;
        el.chatInput.dispatchEvent(new Event("input"));
        el.inboxDialog.close();
        toast("已填入对话区，可发送给 AI 安排", "info");
      });
    });
    // 卡片型操作
    el.inboxList.querySelectorAll(".inbox-card-act").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx);
        const act = btn.dataset.act;
        if (act === "done") {
          inboxItems[idx].done = !inboxItems[idx].done;
          saveInbox();
          renderInboxList();
        } else if (act === "tochat") {
          const it = inboxItems[idx];
          el.chatInput.value = (it.title || "") + (it.summary ? "\n" + it.summary : "") + (it.link ? "\n" + it.link : "");
          el.chatInput.dispatchEvent(new Event("input"));
          el.inboxDialog.close();
          toast("已填入对话区，可发送给 AI 安排", "info");
        }
      });
    });
  }

  el.inboxBtn.addEventListener("click", openInbox);
  el.closeInbox.addEventListener("click", () => el.inboxDialog.close());
  el.inboxDialog.addEventListener("click", (e) => { if (e.target === el.inboxDialog) el.inboxDialog.close(); });
  el.inboxAddBtn.addEventListener("click", () => {
    const text = el.inboxInput.value.trim();
    if (!text) { toast("请输入内容", "error"); return; }
    inboxItems.unshift({
      text,
      tag: el.inboxCategory.value.trim() || "",
      done: false,
      createdAt: Date.now(),
    });
    saveInbox();
    el.inboxInput.value = "";
    el.inboxCategory.value = "";
    updateInboxTagDatalist();
    renderInboxFilter();
    renderInboxList();
    toast("已添加到收集箱", "success");
  });
  el.inboxInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); el.inboxAddBtn.click(); }
  });
  el.inboxCategory.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); el.inboxAddBtn.click(); }
  });
  el.inboxTimeFilter.addEventListener("change", () => {
    inboxTimeFilter = el.inboxTimeFilter.value;
    renderInboxList();
  });

  function renderStat() {
    const totalCells = PERIOD_COUNT * CELLS_PER_PERIOD;
    const dayTasks = getDayTasks(state.currentDate);
    const dayDone = getDayDone(state.currentDate);
    let filled = 0, doneCount = 0, totalTasks = 0;
    Object.keys(dayTasks).forEach((k) => {
      if (dayTasks[k].length) {
        filled++;
        totalTasks += dayTasks[k].length;
        if (dayDone[k]) doneCount++;
      }
    });
    const pending = filled - doneCount;
    const fillRate = totalCells ? Math.round((filled / totalCells) * 100) : 0;
    const doneRate = filled ? Math.round((doneCount / filled) * 100) : 0;

    let html = `
      <div class="time-display" style="margin-bottom:12px;">${formatDateLabel(state.currentDate)}</div>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-value">${totalTasks}</div><div class="stat-label">任务总数</div></div>
        <div class="stat-card"><div class="stat-value">${filled}</div><div class="stat-label">已占用格</div></div>
        <div class="stat-card"><div class="stat-value">${doneCount}</div><div class="stat-label">已完成</div></div>
        <div class="stat-card"><div class="stat-value">${doneRate}%</div><div class="stat-label">完成率</div></div>
      </div>
      <h4 style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">各时辰占用率（${fillRate}% 全天占用）</h4>`;

    for (let p = 0; p < PERIOD_COUNT; p++) {
      const range = getPeriodRange(p);
      let pFilled = 0, pDone = 0;
      for (let c = 0; c < CELLS_PER_PERIOD; c++) {
        if (getCellTasks(p, c).length) { pFilled++; if (getCellDone(p, c)) pDone++; }
      }
      const pct = Math.round((pFilled / CELLS_PER_PERIOD) * 100);
      html += `
        <div class="stat-bar-row">
          <span class="stat-bar-label">${secondsToHHMM(range.start)}</span>
          <div class="stat-bar-track">
            <div class="stat-bar-fill ${pDone > 0 ? 'done' : ''}" style="width:${pct}%"></div>
          </div>
          <span class="stat-bar-value">${pFilled}/${CELLS_PER_PERIOD}</span>
        </div>`;
    }
    el.statBody.innerHTML = html;
    // 追加趋势图、热力图、周报
    el.statBody.innerHTML += renderTrendChart();
    el.statBody.innerHTML += renderHeatmap();
    el.statBody.innerHTML += renderWeeklyReport();
  }

  // 近 30 天完成趋势折线图（SVG）
  function renderTrendChart() {
    const days = 30;
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = dateToStr(d);
      const dayTasks = state.tasks[ds] || {};
      const dayDone = state.done[ds] || {};
      let filled = 0, doneCount = 0;
      Object.keys(dayTasks).forEach((k) => {
        if (dayTasks[k].length) { filled++; if (dayDone[k]) doneCount++; }
      });
      data.push({ date: ds, filled, done: doneCount, rate: filled ? Math.round((doneCount / filled) * 100) : 0 });
    }
    const W = 320, H = 140, PAD = 24;
    const maxRate = 100;
    const stepX = (W - PAD * 2) / (days - 1);
    const points = data.map((d, i) => {
      const x = PAD + i * stepX;
      const y = H - PAD - (d.rate / maxRate) * (H - PAD * 2);
      return { x, y, d };
    });
    const pathD = points.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
    const areaD = pathD + ` L${points[points.length - 1].x.toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`;
    let dots = "";
    points.forEach((p) => {
      dots += `<circle class="chart-dot ${p.d.done ? 'done' : ''}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5"><title>${p.d.date}: ${p.d.rate}% (${p.d.done}/${p.d.filled})</title></circle>`;
    });
    // 近 7 天平均完成率
    const last7 = data.slice(-7);
    const avg7 = last7.length ? Math.round(last7.reduce((s, d) => s + d.rate, 0) / last7.length) : 0;
    return `
      <h4 style="font-size:13px;color:var(--text-secondary);margin:16px 0 6px;">📈 近 30 天完成率趋势（近7天均值 ${avg7}%）</h4>
      <div class="chart-container">
        <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <defs><linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
          <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="var(--border)" stroke-width="1"/>
          <line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H - PAD}" stroke="var(--border)" stroke-width="1"/>
          <text class="chart-axis" x="${PAD - 4}" y="${PAD + 4}" text-anchor="end">100%</text>
          <text class="chart-axis" x="${PAD - 4}" y="${H - PAD}" text-anchor="end">0%</text>
          <path class="chart-area" d="${areaD}"/>
          <path class="chart-line" d="${pathD}"/>
          ${dots}
        </svg>
      </div>`;
  }

  // 年度热力图（GitHub 风格，最近 53 周）
  function renderHeatmap() {
    const today = new Date();
    const weeks = 53;
    const start = new Date(today);
    start.setDate(start.getDate() - (weeks * 7 - 1) + (6 - start.getDay()));
    const cells = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      if (d > today) break;
      const ds = dateToStr(d);
      const dayTasks = state.tasks[ds] || {};
      const dayDone = state.done[ds] || {};
      let doneCount = 0;
      Object.keys(dayTasks).forEach((k) => { if (dayTasks[k].length && dayDone[k]) doneCount++; });
      let level = 0;
      if (doneCount > 0) level = doneCount <= 2 ? 1 : doneCount <= 5 ? 2 : doneCount <= 8 ? 3 : 4;
      cells.push({ ds, level, doneCount });
    }
    let html = '<h4 style="font-size:13px;color:var(--text-secondary);margin:16px 0 6px;">🔥 年度完成热力图</h4>';
    html += '<div class="heatmap">';
    cells.forEach((c) => {
      html += `<div class="heatmap-cell clickable ${c.level ? 'l' + c.level : ''}" title="${c.ds}: ${c.doneCount} 项完成" data-date="${c.ds}" onclick="document.getElementById('searchInput')&&(document.getElementById('searchInput').value='${c.ds}',document.getElementById('searchBtn').click())"></div>`;
    });
    html += '</div>';
    html += '<div class="heatmap-legend"><span>少</span>';
    for (let l = 0; l <= 4; l++) html += `<div class="heatmap-cell ${l ? 'l' + l : ''}"></div>`;
    html += '<span>多</span></div>';
    return html;
  }

  // 周报：本周完成情况
  function renderWeeklyReport() {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 6);
    let totalTasks = 0, doneTasks = 0, activeDays = 0;
    const byTag = {};
    const byPriority = { high: 0, medium: 0, low: 0 };
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const ds = dateToStr(d);
      const dayTasks = state.tasks[ds] || {};
      const dayDone = state.done[ds] || {};
      let dayHas = false;
      Object.keys(dayTasks).forEach((k) => {
        if (!dayTasks[k].length) return;
        dayHas = true;
        totalTasks += dayTasks[k].length;
        if (dayDone[k]) doneTasks += dayTasks[k].length;
        dayTasks[k].forEach((t) => {
          const nt = normalizeTask(t);
          if (nt.tag) byTag[nt.tag] = (byTag[nt.tag] || 0) + 1;
          byPriority[nt.priority] = (byPriority[nt.priority] || 0) + 1;
        });
      });
      if (dayHas) activeDays++;
    }
    const doneRate = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
    const topTags = Object.entries(byTag).sort((a, b) => b[1] - a[1]).slice(0, 3);
    let html = '<h4 style="font-size:13px;color:var(--text-secondary);margin:16px 0 6px;">📋 本周规划周报</h4>';
    html += `<div class="stat-grid">
      <div class="stat-card"><div class="stat-value">${totalTasks}</div><div class="stat-label">本周任务</div></div>
      <div class="stat-card"><div class="stat-value">${doneTasks}</div><div class="stat-label">已完成</div></div>
      <div class="stat-card"><div class="stat-value">${doneRate}%</div><div class="stat-label">完成率</div></div>
      <div class="stat-card"><div class="stat-value">${activeDays}</div><div class="stat-label">活跃天数</div></div>
    </div>`;
    if (topTags.length) {
      html += '<div style="margin-top:10px;font-size:12px;color:var(--text-secondary);">高频标签：';
      html += topTags.map(([tag, n]) => `<span class="cell-tag">${escapeHtml(tag)} ×${n}</span>`).join(" ");
      html += '</div>';
    }
    html += `<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">优先级分布：
      <span style="color:var(--danger)">🔴 ${byPriority.high}</span> ·
      <span style="color:var(--warning)">🟡 ${byPriority.medium}</span> ·
      <span style="color:var(--success)">🟢 ${byPriority.low}</span></div>`;
    return html;
  }

  // ---------- 导出/导入 ----------
  el.exportBtn.addEventListener("click", () => {
    const data = {
      version: 5, exportedAt: new Date().toISOString(),
      tasks: state.tasks, done: state.done, checklists: state.checklists, repeats: state.repeats,
      records: state.records, reviews: state.reviews,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mandala-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出 JSON（含记录与复盘）", "success");
  });

  el.importBtn.addEventListener("click", () => el.importFile.click());
  el.importFile.addEventListener("change", async () => {
    const file = el.importFile.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.tasks) throw new Error("文件格式无效");
      const days = Object.keys(data.tasks).length;
      if (!confirm(`导入 ${days} 天的数据？当前数据将被合并。`)) return;
      // 合并而非覆盖
      Object.keys(data.tasks).forEach((d) => {
        if (!state.tasks[d]) state.tasks[d] = {};
        Object.assign(state.tasks[d], data.tasks[d]);
      });
      if (data.done) {
        Object.keys(data.done).forEach((d) => {
          if (!state.done[d]) state.done[d] = {};
          Object.assign(state.done[d], data.done[d]);
        });
      }
      if (data.checklists) {
        Object.keys(data.checklists).forEach((d) => {
          if (!state.checklists[d]) state.checklists[d] = {};
          Object.assign(state.checklists[d], data.checklists[d]);
        });
      }
      if (data.repeats) {
        Object.assign(state.repeats, data.repeats);
      }
      // 合并记录与复盘
      if (data.records) {
        Object.keys(data.records).forEach((d) => {
          if (!state.records[d]) state.records[d] = {};
          Object.assign(state.records[d], data.records[d]);
        });
      }
      if (data.reviews) {
        Object.keys(data.reviews).forEach((d) => {
          state.reviews[d] = data.reviews[d];
        });
      }
      save(STORAGE_KEY, state.tasks);
      save(DONE_KEY, state.done);
      save(CHECKLIST_KEY, state.checklists);
      save(REPEAT_KEY, state.repeats);
      save(RECORD_KEY, state.records);
      save(REVIEW_KEY, state.reviews);
      refreshRepeats();
      renderAll();
      toast("导入成功（含记录与复盘）", "success");
    } catch (e) {
      toast("导入失败：" + e.message, "error");
    } finally {
      el.importFile.value = "";
    }
  });

  // ---------- 跨设备同步（URL/文本编码，无需后端） ----------
  // 编码：JSON → encodeURIComponent → btoa（UTF-8 安全）→ 前缀 mds1:
  function encodeSyncData(payload) {
    try {
      const json = JSON.stringify(payload);
      // UTF-8 安全的 btoa
      const b64 = btoa(unescape(encodeURIComponent(json)));
      return "mds1:" + b64;
    } catch (e) { return ""; }
  }
  function decodeSyncData(code) {
    try {
      let raw = code.trim();
      // 兼容完整 URL（提取 hash）
      const hashIdx = raw.indexOf("#mds1:");
      if (hashIdx >= 0) raw = raw.slice(hashIdx + 1);
      if (!raw.startsWith("mds1:")) return null;
      const b64 = raw.slice(5);
      const json = decodeURIComponent(escape(atob(b64)));
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  el.genSyncCodeBtn.addEventListener("click", () => {
    const payload = {
      v: 1, t: "full",
      tasks: state.tasks, done: state.done,
      checklists: state.checklists, repeats: state.repeats,
    };
    const code = encodeSyncData(payload);
    el.syncCodeArea.value = code;
    const kb = (code.length / 1024).toFixed(1);
    toast(`已生成同步码（${kb} KB），复制后粘贴到另一设备`, "success");
  });

  el.genSyncLinkBtn.addEventListener("click", () => {
    // 仅当日数据，URL 友好
    const d = state.currentDate;
    const payload = {
      v: 1, t: "day", date: d,
      tasks: { [d]: state.tasks[d] || {} },
      done: { [d]: state.done[d] || {} },
      checklists: { [d]: state.checklists[d] || {} },
    };
    const code = encodeSyncData(payload);
    const url = location.origin + location.pathname + "#" + code;
    el.syncCodeArea.value = url;
    if (url.length > 8000) {
      toast("链接较长，建议改用同步码", "info");
    } else if (navigator.share) {
      navigator.share({ title: "曼陀罗时辰数据", url }).catch(() => {});
    } else {
      toast("已生成分享链接，可复制", "success");
    }
  });

  el.importSyncBtn.addEventListener("click", () => {
    const code = el.syncCodeArea.value.trim();
    if (!code) { toast("请先粘贴同步码或链接", "error"); return; }
    const payload = decodeSyncData(code);
    if (!payload) { toast("同步码格式无效", "error"); return; }
    const scope = payload.t === "day" ? `（${payload.date}）` : "（全部）";
    if (!confirm(`导入同步数据${scope}？将与当前数据合并。`)) return;
    // 合并
    if (payload.tasks) Object.keys(payload.tasks).forEach((d) => {
      if (!state.tasks[d]) state.tasks[d] = {};
      Object.assign(state.tasks[d], payload.tasks[d]);
    });
    if (payload.done) Object.keys(payload.done).forEach((d) => {
      if (!state.done[d]) state.done[d] = {};
      Object.assign(state.done[d], payload.done[d]);
    });
    if (payload.checklists) Object.keys(payload.checklists).forEach((d) => {
      if (!state.checklists[d]) state.checklists[d] = {};
      Object.assign(state.checklists[d], payload.checklists[d]);
    });
    if (payload.repeats) Object.assign(state.repeats, payload.repeats);
    save(STORAGE_KEY, state.tasks);
    save(DONE_KEY, state.done);
    save(CHECKLIST_KEY, state.checklists);
    save(REPEAT_KEY, state.repeats);
    refreshRepeats();
    renderAll();
    // 清除 URL hash 避免重复导入
    if (location.hash.startsWith("#mds1:")) history.replaceState(null, "", location.pathname);
    toast("同步数据已导入", "success");
  });

  el.copySyncBtn.addEventListener("click", async () => {
    const text = el.syncCodeArea.value;
    if (!text) { toast("暂无内容可复制", "error"); return; }
    try {
      await navigator.clipboard.writeText(text);
      toast("已复制到剪贴板", "success");
    } catch (e) {
      el.syncCodeArea.select();
      document.execCommand("copy");
      toast("已复制", "success");
    }
  });

  // 启动时检测 URL hash 同步数据
  function checkUrlSync() {
    if (location.hash.startsWith("#mds1:")) {
      const payload = decodeSyncData(location.hash);
      if (payload) {
        const scope = payload.t === "day" ? `${payload.date} 的数据` : "全部数据";
        setTimeout(() => {
          if (confirm(`检测到分享链接，是否导入${scope}？`)) {
            el.syncCodeArea.value = location.hash.slice(1);
            el.importSyncBtn.click();
          } else {
            history.replaceState(null, "", location.pathname);
          }
        }, 500);
      }
    }
  }

  // ---------- 首次使用引导 ----------
  function showOnboarding() {
    const key = "mandala-onboarding-v1";
    if (localStorage.getItem(key)) return;
    const overlay = document.createElement("div");
    overlay.className = "onboarding-overlay";
    overlay.innerHTML = `
      <div class="onboarding-card">
        <h2>曼陀罗时辰</h2>
        <p class="onboarding-subtitle">AI 对话式日程规划 · 三步上手</p>
        <div class="onboarding-steps">
          <div class="onboarding-step">
            <div class="onboarding-step-icon chat">💬</div>
            <div class="onboarding-step-text">
              <div class="onboarding-step-title">1. 告诉 AI 你的任务</div>
              <div class="onboarding-step-desc">在对话区描述今天要做的事，AI 会自动拆解并安排到合适时辰</div>
            </div>
          </div>
          <div class="onboarding-step">
            <div class="onboarding-step-icon plan">天</div>
            <div class="onboarding-step-text">
              <div class="onboarding-step-title">2. 天·计划 & 地·记录</div>
              <div class="onboarding-step-desc">在「计划」页查看安排，切换到「记录」页追踪实际执行</div>
            </div>
          </div>
          <div class="onboarding-step">
            <div class="onboarding-step-icon review">人</div>
            <div class="onboarding-step-text">
              <div class="onboarding-step-title">3. 人·复盘总结</div>
              <div class="onboarding-step-desc">AI 自动生成复盘分析，帮你持续改进时间管理</div>
            </div>
          </div>
          <div class="onboarding-step">
            <div class="onboarding-step-icon chat">⌨</div>
            <div class="onboarding-step-text">
              <div class="onboarding-step-title">快捷键 & 手势</div>
              <div class="onboarding-step-desc">按 <kbd style="font-size:10px;padding:1px 5px;">?</kbd> 查看全部快捷键，<kbd style="font-size:10px;padding:1px 5px;">1</kbd><kbd style="font-size:10px;padding:1px 5px;">2</kbd><kbd style="font-size:10px;padding:1px 5px;">3</kbd> 切换三才</div>
            </div>
          </div>
        </div>
        <button class="onboarding-dismiss">开始使用</button>
        <button class="onboarding-skip">不再显示</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".onboarding-dismiss").addEventListener("click", () => {
      overlay.remove();
      localStorage.setItem(key, "1");
    });
    overlay.querySelector(".onboarding-skip").addEventListener("click", () => {
      overlay.remove();
      localStorage.setItem(key, "1");
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        localStorage.setItem(key, "1");
      }
    });
  }

  // ---------- 启动 ----------
  function init() {
    migrateOldData();
    applyTheme();
    applyAccentColor(state.settings.accentColor);
    applyNotifyBtn();
    restoreChat();
    state.activePeriod = Math.max(0, getCurrentPeriod());
    refreshRepeats(); // 启动时为今天及未来 60 天生成重复任务
    renderAll();
    renderDraftBanner();
    loadPomoState();
    checkUrlSync();
    pullSync(); // Hermes 联动：启动拉取远程数据合并
    renderHermesNotes(); // 恢复今日 Hermes notes 显示
    // 首次使用引导（延迟展示，等渲染完成）
    setTimeout(showOnboarding, 600);
    setInterval(renderClock, 1000);
    setInterval(() => {
      renderPeriodTabs();
      renderMandala();
      renderOverview();
      checkNotify();
      autoCarryForward();
      checkPeriodTransition(); // 时辰切换检测：进入新时辰时提示+闪烁
      pullSync(); // 拉取 Hermes trigger_action 写入的动作队列并消费
    }, 30000);
    checkNotify();
    // 初始化时辰检测基线（首次不触发提示）
    state.lastPeriod = getCurrentPeriod();
    // APK 沉浸式状态栏（仅原生环境生效，浏览器无影响）
    setupImmersiveMode();
    // 注册 Service Worker（PWA 离线，network-first 策略避免缓存问题）
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js?v=4").catch((e) => console.warn("SW 注册失败", e));
    }
    // 系统对接：处理 share_target 分享内容 / shortcuts 快捷入口
    handleLaunchParams();
  }

  // 处理启动 URL 参数（share_target 分享 / shortcuts 快捷方式）
  function handleLaunchParams() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    const sharedText = params.get("text");
    const sharedTitle = params.get("title");
    const sharedUrl = params.get("url");

    // 来自系统分享菜单（share_target）
    if (sharedText || sharedUrl) {
      let composed = "";
      if (sharedTitle) composed += sharedTitle + "：";
      if (sharedText) composed += sharedText;
      if (sharedUrl) composed += (composed ? " " : "") + sharedUrl;
      // 直接写入速记收集箱
      inboxItems = load(INBOX_KEY, []);
      inboxItems.unshift({
        id: "in-" + Date.now().toString(36),
        text: composed.slice(0, 200),
        tag: "分享",
        createdAt: Date.now(),
        done: false,
      });
      saveInbox();
      toast("已从分享收入收集箱", "success");
      // 清理 URL，避免刷新重复添加
      history.replaceState({}, document.title, "./");
      return;
    }

    // 来自 shortcuts 快捷方式
    if (action === "inbox") {
      setTimeout(() => { if (el.inboxBtn) el.inboxBtn.click(); }, 300);
      history.replaceState({}, document.title, "./");
    } else if (action === "plan") {
      setTimeout(() => setRealm("plan"), 300);
      history.replaceState({}, document.title, "./");
    }
  }

  init();
})();

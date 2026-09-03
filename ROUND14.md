# Round 14 / 15 抛光小结（v2.7.24·113）

日期：2026-09-03  
范围：`d:\\Downloads\\mandala-shichen`（未改 `mant`）  
承接：Round13（112）→ 边轨主题/交换、导图交互、多钟与溢出继承、应用内快捷球

---

## 一、左侧边轨 · 主题与交换

| 子维度 | 状态 | 说明 |
|--------|------|------|
| 主题 token 对齐 | ✅ | 使用 `--glass-bg / --accent / --bg-card`，亮暗主题可读 |
| 紧凑浮动轨 | ✅ | 仍贴主九宫格，非左隐藏整页 |
| 格子↔格子交换 | ✅ | 拖入有任务格默认 **交换**；Shift=追加 |
| 边轨⇄交换钮 | ✅ | 已安排任务：「移/换当前」+「⇄ 交换」 |
| 拖入贴格 | ✅ | 空格移入 / 有任务交换；长按拖入保留 |

---

## 二、思维导图 · 交互与关联解析

| 子维度 | 状态 | 说明 |
|--------|------|------|
| depends_on→关联线 | ✅ | `stepsToTree` 解析依赖为 `meta.link` +「依赖」文案 |
| 失效 id 兜底 | ✅ | `resolveLinkTarget` 按文案回写稳定 id |
| 长按/已选拖节点 | ✅ | 已选中立刻可拖；未选 180ms 武装；移动不再误变平移 |
| ↩ 角标不抢拖 | ✅ | 短按松手才跳格 |
| 浮动条可点 | ✅ | `pointerup`+`click`、防双触发；z-index/主题色加强 |
| 可读性 | ✅ | 节点 touch-action、按钮对比度 |

---

## 三、记录页 · 多钟与溢出继承

| 子维度 | 状态 | 说明 |
|--------|------|------|
| 当前格青绿开钟钮 | ✅ | `.cell-timer-now` ▶，与普通⏱区分 |
| 多钟协作 | ✅ | 开新钟自动暂停其他；条/球可切 |
| 超时溢出继承 | ✅ | 记入时按 `SECONDS_PER_CELL` 切开，多余写入后续格（标「续·溢出」） |

---

## 四、Android 快捷操作 · 可行性诚实说明

| 能力 | 状态 | 说明 |
|------|------|------|
| **应用内快捷球** | ⚠ 已由 Round16 移除 | 改通知栏（见 ROUND16.md / 114） |
| **通知栏操作** | ⚠ 未装插件 | 工程依赖无 `@capacitor/local-notifications`；要做需：`npm i @capacitor/local-notifications` + Android 权限 + action callback |
| **系统悬浮球** | ⚠ 未做原生 | 需 `SYSTEM_ALERT_WINDOW` + 自定义 Capacitor 插件/前台服务；成本高，本轮用应用内球替代 |
| 后台保活前台服务 | ❌ 未做 | 需原生 Foreground Service；WebView  alone 不可靠 |

建议下一轮：先装 Local Notifications，做「进行中」通知 + 暂停/结束 Action；悬浮窗再评估。

---

## 五、版本信号

- `APP_BUILD`：**113**
- `APP_VERSION`：**2.7.24**
- `sw.js`：`mandala-v113`
- `index.html`：`?v=20260903r14`
- Android：`versionCode 113` / `versionName 2.7.24.113`

---

## 本地预览

```bash
cd d:\\Downloads\\mandala-shichen
npm start
# 硬刷新确认徽标 v2.7.24·113
```

回归建议：边轨拖交换、记录页当前格 ▶ 开钟、记入超时>1格看溢出、导图长按拖 task 节点、点浮动条、看右下角快捷球。

## 关键文件

- `www/app.js` — 交换/溢出/开钟钮/导图解析与拖拽/浮动条/快捷球/版本 113
- `www/styles.css` — 边轨主题、开钟钮、浮动条、快捷球
- `www/index.html` / `www/sw.js` / `android/app/build.gradle`
- `ROUND14.md` — 本文件

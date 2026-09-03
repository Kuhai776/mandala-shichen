# Round 17（v2.7.24·115）

日期：2026-09-03  
范围：`d:\Downloads\mandala-shichen`（未改 `mant`）  
承接：Round16（114，通知栏正计时）→ **精细化子维度 + 功能摩擦 + 轻量架构边界**

---

## 一、中文子维度完成表

| 子维度 | 状态 | 说明 |
|--------|------|------|
| **边轨 · 文案/交换** | ✅ | 贴入目标文案统一；拖放提示「空格移入 / 有任务交换 / Shift=追加」；亮色主题边轨/交换钮对比度 |
| **记录 · 多钟** | ✅ | 通知栏「切钟」在多口钟间轮转；开钟/暂停强制刷新通知 |
| **溢出继承 · 徽章** | ✅ | 记录条「续·溢出」加琥珀色 **溢出** 徽标；格加 `has-overflow` 描边 |
| **导图 · 改名同步** | ✅ | 浮层编辑 / 详情面板改文案 → 精确匹配同步今日格子任务 |
| **导图 · 跳格** | ✅ | `MandalaR17.findCellByText` 优先定位 |
| **通知栏 · 节流** | ✅ | 走秒 UI 每秒；通知约 5s 或状态变化强制写；队列防重入 |
| **通知栏 · 记任务** | ✅ | Action「记任务」深链回记录格 + prompt 写入计划任务 |
| **开钟钮 · 安卓触控** | ✅ | `pointerup`+`click` 防双触发；粗指针加大命中区 |

---

## 二、体系架构演进（务实、非重写）

方向：**在巨石 `app.js` 内保留业务闭环，把纯函数边界抽到 `www/lib/r17-helpers.js`（`window.MandalaR17`）**。

```
┌─ www/lib/r17-helpers.js ─────────────────────┐
│  pickTimerForNotif / formatNotifClock        │
│  shouldSkipNotifSchedule                     │
│  syncTextAcrossCells / findCellByText        │
│  isOverflowLabel / buildTaskLocMap           │
└──────────────────▲───────────────────────────┘
                   │ 可选调用（缺失则 app 内兜底）
┌─ www/app.js（IIFE）──────────────────────────┐
│  计时状态机 · syncTimerNotification          │
│  边轨 positionEdgeRail / swapOrMove          │
│  MindMapEditor（改名钩子 → syncMindmap…）    │
└──────────────────────────────────────────────┘
```

原则：

1. **不拆巨石**：导图/边轨仍在 `app.js`，避免大爆炸依赖图。
2. **纯逻辑外置**：通知文案、节流判定、全文改名扫描无 DOM/闭包依赖。
3. **稳定版本信号**：`APP_BUILD` = SW `mandala-vN` = Android `versionCode` = 资源 `?v=…rN`。
4. **下一轮（18）可继续**：边轨触控模块、`MindMapEditor` 再拆 `lib/mm-*.js`；原生前台服务仍评估。

---

## 三、版本信号

| 信号 | 值 |
|------|-----|
| `APP_BUILD` | **115** |
| `APP_VERSION` | 2.7.24 |
| SW | `mandala-v115` |
| 缓存戳 | `?v=20260903r17` |
| Android | `versionCode 115` / `versionName 2.7.24.115` |
| 助手脚本 | `www/lib/r17-helpers.js` |

---

## 四、依赖 / 同步

```bash
cd d:\Downloads\mandala-shichen
npm install @capacitor/local-notifications@^6
npx cap sync android
```

`package.json` 已含依赖；未 sync 时真机 APK 可能仍无通知插件（JS no-op）。

---

## 五、真机怎么测

1. 徽标 **v2.7.24·115**。
2. 开钟 → 通知「⏱ 时长 · 任务」；多钟 → **切钟**；**记任务** 写入当前格。
3. 超时 > 1 格记入 → 后续格见琥珀色「溢出」徽标。
4. 导图改节点名 → toast「已同步 N 条格子任务」。
5. 记录页当前格青绿 ▶：粗指针下更大、单次触发可靠。
6. 亮色主题：边轨/浮动条可读。

---

## 六、改动文件

- `www/app.js` — 通知栏增强、开钟触控、溢出徽章、导图同步、版本 115
- `www/lib/r17-helpers.js` — 新增边界助手
- `www/styles.css` — 溢出/触控/亮色主题
- `www/index.html` / `www/sw.js` / `android/app/build.gradle`
- `scripts/round17-patch.js` / `scripts/verify-r17.js`
- `ROUND17.md` — 本文件

## 七、仍可继续（Round18 已开）

已在 **Round18（116）** 落地：通知「下一口」名、边轨定位外置。见 `ROUND18.md`。

仍待后续：

- 边轨触屏拖入 / stick 游标状态机外置
- 导图 `MindMapEditor` 拆文件（render / touch / export）
- 原生悬浮窗 / 前台服务（商店策略成本高）

# Round 21（v2.7.24·119）· 通知栏正计时 MVP 加固

日期：2026-09-04  
范围：`d:\Downloads\mandala-shichen`  
承接：Round20（118）→ **用户反馈「通知那个玩意似乎没有做好」**

---

## 审计结论（做前状态）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| `@capacitor/local-notifications` 依赖 | ✅ 已有 | `package.json` ^6.1.3；`node_modules` 在；`capacitor.plugins.json` 已注册 |
| Android `POST_NOTIFICATIONS` | ✅ 已有 | `AndroidManifest.xml` |
| `syncTimerNotification` 接线 | ✅ 已有 | start / pause / resume / stop / 全停 / 恢复跨日 / tick≈5s |
| Action 监听只绑一次 | ✅ 已有 | `_timerNotifListenerBound` |
| 频道创建Channel | ✅ 已有 | `mandala_timer` |
| **即时贴出** | ❌ 缺 | 用了 `schedule.at +80ms` → 走 AlarmManager，非 `notify()` 即时刷新 |
| **权限拒绝中文提示** | ❌ 缺 | `requestPermissions` 未看返回值；拒绝后仍标 ready |
| **`_timerNotifLastBody`** | ❌ Bug | strict 下未声明却参与节流，非 force 路径会 ReferenceError |
| **Action「结束」可见性** | ❌ 缺 | 一次挂 5 个键；安卓最多显示 **3** 个 → 常只见暂停/恢复/切钟，「结束」「记任务」被挤掉 |
| **状态栏小图标** | ⚠ 弱 | 无 `smallIcon` 资源，回退系统 info 图标 |
| **真·ongoing / 杀进程保活** | ⚠ 诚实限制 | 插件 `ongoing:true` ≠ 前台服务；进程被杀后 JS 停走，通知不再更新 |

---

## 本轮补了什么

| 项 | 说明 |
| --- | --- |
| 即时 schedule | 去掉 `schedule.at`，直接 `LN.schedule` → 原生 `notify`，走秒刷新可靠 |
| 权限 UX | `checkPermissions` → `requestPermissions`；拒绝时中文 toast（只提示一次） |
| 三键动作 | 4 套 actionType：单钟记任务 / 多钟切钟 × 在跑暂停；**结束始终在第三键** |
| 节流修 body | 声明并回写 `_timerNotifLastBody` |
| 小图标 | `res/drawable/ic_stat_timer.xml` + config `smallIcon` |
| 频道 importance | 提到 4（HIGH），利于展开操作键（已装旧频道的机型需清数据或改频道 id 才生效；本轮未改 id 以免刷屏） |
| 版本 | **119** |

---

## 仍诚实保留的真机限制

1. **不是前台服务**：锁屏久、杀后台、厂商省电可能冻住 WebView 定时器 → 通知时间停在最后一次刷新；点通知/按钮会拉回 App。
2. **可滑掉**：`ongoing` 多数机型难滑，但部分 OEM / 用户手势仍可能清掉；再次开钟会重贴。
3. **网页/桌面**：无原生插件 → 静默 no-op（设计如此）。
4. **旧通知频道**：若早期装过 importance=3 的同 id 频道，系统不会改 importance；一般不影响 MVP。

---

## 版本信号

| 信号 | 值 |
|------|-----|
| `APP_BUILD` | **119** |
| SW | `mandala-v119` |
| 缓存戳 | `?v=20260904r21` |
| Android | `versionCode 119` / `versionName 2.7.24.119` |

## 改动文件

- `www/app.js` — 通知权限/动作/即时贴出/节流/版本 119
- `www/sw.js` / `www/index.html`
- `capacitor.config.json` — `smallIcon`
- `android/.../ic_stat_timer.xml` / `android/app/build.gradle`
- `ROUND21.md`

## 真机怎么测

1. 装 **119** APK；系统设置确认「通知」已允许。
2. 记录页开一口钟 → 应弹权限；允许后通知栏出现「⏱ mm:ss · 任务」；拒绝 → 中文 toast。
3. 下拉通知：单钟应见 **暂停 / 记任务 / 结束**；点暂停应变 **恢复**；点结束进命名。
4. 再开第二口（或暂停后另格开钟）→ 应变 **暂停|恢复 · 切钟 · 结束**；切钟轮转。
5. 全停/全部记入后通知消失；后台约 5 秒看时长是否刷新。
6. 强制停止 App 后再看：通知可能残留旧文案且不再走秒（预期限制）；重开 App 会按状态重贴或取消。

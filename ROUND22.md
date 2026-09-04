# Round 22（v2.7.24·120）· Android 前台服务保活

日期：2026-09-04  
范围：`d:\Downloads\mandala-shichen`  
承接：Round21（v119）通知栏正计时 MVP → **真正提高后台存活率**

---

## 前台服务是什么（给用户）

**前台服务（Foreground Service）** 是 Android 的一种后台运行方式：

1. 系统要求应用在通知栏挂一条**常驻通知**（本 App：正计时文案 + 暂停/恢复/结束等键）
2. 进程优先级被提高，比纯 WebView / 普通后台任务**更不容易被系统杀掉**
3. 因此锁屏、切 App、短时后台时，计时通知更有机会继续刷新

**诚实限制**：仍不是 100%。部分厂商（激进省电 / 强制停用）仍可能冻杀；强制「结束运行」后服务也会停。比「只靠网页定时器 + 本地通知」可靠得多。

---

## 方案选型

| 选项 | 结论 |
| --- | --- |
| `@capawesome-team/capacitor-android-foreground-service` | Cap6 有 6.x，但官方仅支持 **Location / Microphone** 类型，不适合格子正计时 |
| 自写原生 Service | ✅ 采用：`specialUse` + 本地 Capacitor 插件 `TimerForeground` |

---

## 本轮实现

| 项 | 说明 |
| --- | --- |
| `TimerForegroundService` | Java 前台服务；`startForeground` + `FOREGROUND_SERVICE_TYPE_SPECIAL_USE`（API 34+） |
| `TimerForegroundPlugin` | JS：`start` / `update` / `stop` / `isRunning`；按钮 → `action` 事件 |
| Manifest | `FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_SPECIAL_USE`、`POST_NOTIFICATIONS`；service + PROPERTY 说明 |
| `syncTimerNotification` | **有 FGS 时只走 FGS**（取消 LocalNotifications 同 id，避免双通知）；无插件时回退 LN |
| 操作键 | 与 Round21 一致：单钟暂停/记任务/结束；多钟暂停/切钟/结束（暂停态对应恢复） |
| 启停规则 | 当日有任意一口钟（含暂停）→ 启/更 FGS；全部结束 → `stop` |

---

## 怎么用（真机）

1. 装 **120** APK，系统设置允许通知。
2. 记录页开钟 → 通知栏出现常驻「⏱ / 计时中」；下拉可见操作键。
3. 切到后台 / 锁屏片刻 → 通知应仍在，约 5s 走秒（JS tick 仍负责刷新文案）。
4. 全部结束钟 → 常驻通知消失、服务停止。
5. 若仍被某厂商杀掉：到系统设置把本 App 加入「无限制 / 后台运行」白名单（因机而异）。

---

## 版本信号

| 信号 | 值 |
|------|-----|
| `APP_BUILD` | **120** |
| SW | `mandala-v120` |
| 缓存戳 | `?v=20260904r22` |
| Android | `versionCode 120` / `versionName 2.7.24.120` |
| APK | `apk/mandala-v2.7.24-v120.apk` |

## 改动文件

- `android/.../TimerForegroundService.java`（新）
- `android/.../TimerForegroundPlugin.java`（新）
- `android/.../MainActivity.java` — 注册插件
- `android/.../AndroidManifest.xml` — 权限 + service
- `android/app/build.gradle` — versionCode 120
- `www/app.js` — FGS 桥接 / sync / 版本 120
- `www/sw.js` / `www/index.html`
- `ROUND22.md`

## 后续可增强（未做）

- 原生侧自走秒（不依赖 WebView tick），杀进程后通知仍更新
- 厂商省电引导页
- Play 上架时对 `specialUse` 用途说明的材料

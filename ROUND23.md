# Round 23（v2.7.24·121）· 通知走秒 + 暂停态下一钟

日期：2026-09-04  
范围：`d:\Downloads\mandala-shichen`  
承接：Round22（v120）前台服务保活 → **用户两处纠偏**

---

## 用户反馈

1. **通知栏正计时不实时**  
   锁屏/后台时标题 `mm:ss` 不跟走，感觉「时间停了」。

2. **暂停后没法从通知开下一钟**  
   暂停态只有「恢复 / 记任务 / 结束」，无法像记录页那样「启动下一钟 / 新开钟」切换事项。

---

## 本轮完成

| 项 | 状态 | 说明 |
| --- | --- | --- |
| JS 走秒 | ✅ | `_startTimerTick` 在跑时**每秒** `_timerNotifForce` 刷 FGS/LN；节流默认 900ms |
| FGS 原生自走秒 | ✅ | `TimerForegroundService` Handler 每秒按 `elapsedMs` 重算标题；暂停则停 tick |
| 暂停态三键 | ✅ | **恢复 \| 下一钟 \| 结束**（FGS + LocalNotifications actionType） |
| 下一钟逻辑 | ✅ | `startNextOrNewClock`：优先其他暂停钟；否则当前时刻格/下一格**新开钟**（对齐 Round20） |
| 多钟条 ⏭ | ✅ | 与通知共用同一套下一钟 API |
| 版本信号 | ✅ | APP_BUILD / SW / versionCode → **121** |

---

## 暂停态怎么用（真机）

1. 开钟 → 暂停 → 通知变为 ⏸，三键：**恢复 · 下一钟 · 结束**  
2. **恢复**：继续本口累计  
3. **下一钟**：若有其他暂停钟 → 启动那口；若只有一口 → 在当前时刻格（或下一格）新开钟，上一口保持暂停  
4. **结束**：命名归档（与原先一致）

在跑且多钟时仍为：**暂停 · 切钟 · 结束**（切钟=轮转已有钟）。

---

## 诚实限制

- OEM 仍可能限制 `notify` 刷新频率；已尽量 1s，系统节流时以「尽可能快」为准。  
- 强制「结束运行」后 FGS 与原生 tick 都会停。  
- 网页/桌面无原生插件 → 通知仍静默 no-op。

---

## 版本信号

| 信号 | 值 |
|------|-----|
| `APP_BUILD` | **121** |
| SW | `mandala-v121` |
| 缓存戳 | `?v=20260904r23` |
| Android | `versionCode 121` / `versionName 2.7.24.121` |
| APK | `apk/mandala-v2.7.24-v121.apk` |

## 改动文件

- `www/app.js` — 走秒 1s、暂停三键、`startNextOrNewClock`、版本 121
- `www/lib/r17-helpers.js` — 默认节流 900ms
- `android/.../TimerForegroundService.java` — 原生 1s tick
- `android/.../TimerForegroundPlugin.java` — 传 paused/elapsedMs/taskLabel
- `android/app/build.gradle` / `www/sw.js` / `www/index.html`
- `ROUND23.md`

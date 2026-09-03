# Round 19（v2.7.24·117）· 承接 Round17/18 收紧

日期：2026-09-03  
范围：`d:\Downloads\mandala-shichen`  
承接：Round18（116）通知下一口 + 边轨定位外置 → **多钟/通知/溢出/边轨/导图摩擦再收一轮**

---

## 本轮完成

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 多钟 · 切钟顺序 | ✅ | `MandalaR17.pickNextTimer`；通知切钟 / 记录条 ⏭ / 暂停「下一钟」同源 |
| 通知栏 · 口序 | ✅ | body 显示 `1/3 · 下一口「…」`；`buildNotifCopy` 统一；节流兼看 body |
| 溢出 · 角标 | ✅ | `isOverflowLabel`；继承格左下角「溢」标记 |
| 边轨 · 定位/游标 | ✅ | 布局计入轨宽与视口；贴入提示显示 stick 游标格 |
| 导图 · 改名→在跑钟 | ✅ | 同步 `runningTimers.taskText` + 强制刷通知 |
| 多钟条 · 在跑高亮 | ✅ | `.rcs-chip.active-run` |

## 架构演进（续）

- 仍集中在 `www/lib/r17-helpers.js`（Round17–19 共用边界），不拆 `MindMapEditor` 巨石。
- 纯逻辑新增：`pickNextTimer`、通知 copy 含口序、边轨 `railWidth/viewportW`。

## 仍待（后续）

- 导图 `MindMapEditor` 拆 render / touch / export
- 边轨触屏拖入状态机完整外置
- 原生悬浮窗 / 前台服务（商店策略成本高）

## 版本信号

| 信号 | 值 |
|------|-----|
| `APP_BUILD` | **117** |
| SW | `mandala-v117` |
| 缓存戳 | `?v=20260903r19` |
| Android | `versionCode 117` / `versionName 2.7.24.117` |

## 改动文件

- `www/app.js` / `www/lib/r17-helpers.js` / `www/styles.css`
- `www/index.html` / `www/sw.js` / `android/app/build.gradle`
- `scripts/round19-patch.js` / `ROUND19.md`

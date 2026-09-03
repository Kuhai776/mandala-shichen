# Round 18（v2.7.24·116）· 承接 Round17 缺口

日期：2026-09-03  
范围：`d:\Downloads\mandala-shichen`  
承接：Round17（115）精细化收口 → 填剩余缺口、继续轻量拆边界

---

## 本轮完成

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 通知栏「下一口」名 | ✅ | 多钟时 body 显示 `下一口「任务名」`，切钟更可预期 |
| 边轨定位外置 | ✅ | `MandalaR17.computeEdgeRailLayout`；`positionEdgeRail` 调用 + 本地兜底 |
| 版本信号 | ✅ | APP_BUILD / SW / versionCode / `?v=20260903r18` → **116** |

## 架构演进（续）

- Round17 已立 `www/lib/r17-helpers.js` 边界；本轮把**边轨几何**也放进同一助手，避免再开一堆文件。
- 仍不拆 `MindMapEditor` 巨石（下一轮再评估 `lib/mm-touch.js` 等）。

## 仍待（后续轮次）

- 导图 `MindMapEditor` 拆 render / touch / export
- 边轨触屏拖入状态机外置
- 原生悬浮窗 / 前台服务（商店策略成本高）

## 版本

- `APP_BUILD`：**116**
- SW：`mandala-v116`
- Android：`versionCode 116` / `versionName 2.7.24.116`
- 缓存：`?v=20260903r18`

## 改动文件

- `www/app.js` / `www/lib/r17-helpers.js`
- `www/index.html` / `www/sw.js` / `android/app/build.gradle`
- `scripts/round18-patch.js` / `ROUND18.md`

# Round 25（v2.7.24·123）· 同格新事项 + 条拖 + 边轨切时辰 + 导图横屏

日期：2026-09-05  
范围：`d:\\Downloads\\mandala-shichen`  
承接：Round24（v122）→ **用户纠偏：新开钟 ≠ 下一时辰，而是同格内切事项**

---

## 机制纠偏（核心）

| 错误理解 | 正确理解 |
|----------|----------|
| 「下一钟 / 新开钟」= 跳到**下一个时辰格子** | 同一时辰格子内：事项 A 暂停后，开事项 B 的**独立计时** |
| 一格一口钟 | **一格可多口事项钟**（`date_p_c` / `date_p_c#matterId`） |

流程：做 A → ⏸ 暂停（累计保留）→ **新事项计时** 开 B（同格）→ 任意时刻最多一口在跑 → ■ 结束命名写入本格。

---

## 本轮完成

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 同格新事项 | ✅ | `forceNew` + matterId；`startFreshNewClock` 不再 `nextPeriodCell` |
| 文案 | ✅ | 新事项 / 新事项计时；通知栏暂停态「恢复\|新事项\|结束」 |
| 记录任务条 | ✅ | 条状强化 + HTML5/触屏长按拖格 |
| 边轨切时辰 | ✅ | 拖拽贴边左右切 `activePeriod` + 淡紫光效 |
| 导图 UX | ✅ | 「横屏效果更佳」；主工具（缩放/关）置前；藏图例边界点阵 |
| 版本 | ✅ | APP_BUILD / SW / versionCode → **123** |

---

## 版本信号

| 信号 | 值 |
|------|-----|
| `APP_BUILD` | **123** |
| SW | `mandala-v123` |
| 缓存戳 | `?v=20260905r25` |
| Android | `versionCode 123` / `versionName 2.7.24.123` |

## 改动文件

- `www/app.js` — 同格多事项钟、条拖、边轨切时辰、导图 chrome
- `www/styles.css` — 淡紫动效、工具栏主次行、弱化画板装饰
- `www/index.html` / `www/sw.js` / `android/app/build.gradle`
- `ROUND25.md` / `scripts/round25-patch.js`

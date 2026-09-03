# Round 16（v2.7.24·114）

日期：2026-09-03  
承接：Round14/15（113）→ **去掉应用内球，改通知栏**

## 本轮完成

| 项 | 状态 | 说明 |
| --- | --- | --- |
| **去掉应用内快捷球** | ✅ | 删除 `quick-timer-bubble` UI/CSS/JS 与相关提示 |
| **通知栏正计时** | ✅ | `@capacitor/local-notifications`：进行中通知显示时长/格名；动作 **暂停 / 恢复 / 结束** |
| **权限** | ✅ | 开钟时申请通知权限（Android `POST_NOTIFICATIONS`）；全停取消通知 |
| **网页兜底** | ✅ | 插件缺失时静默 no-op（无球、不报错） |

## 版本

- `APP_BUILD`：**114**
- SW：`mandala-v114`
- Android：`versionCode 114` / `versionName 2.7.24.114`
- 资源缓存戳：`?v=20260903r16`

## 依赖 / 同步（本机构建必做）

当前环境若未跑通 npm，请在有 Node 的机器执行：

```bash
cd d:\Downloads\mandala-shichen
npm install @capacitor/local-notifications@^6
npx cap sync android
```

`package.json` 已写入 `"@capacitor/local-notifications": "^6.0.0"`。未 sync 前，真机 APK 可能仍无通知插件（JS 会 no-op）。

## 真机怎么测

1. 装入 **114** APK（确认版本徽标 `2.7.24·114`）。
2. 记录页开一口钟 → 应弹出通知权限；允许后通知栏出现「⏱ 时长 · 任务名」。
3. 下拉通知 → 点 **暂停 / 恢复 / 结束**，应驱动现有格子计时 API（结束会进命名弹窗）。
4. 全停或记入后，通知应消失。
5. **不应再出现**右下角应用内快捷球。
6. 浏览器打开 www：开钟正常，无球、无报错。

## 改动文件

- `www/app.js` — 移除球；`syncTimerNotification`；版本 114
- `www/styles.css` — 移除球样式
- `www/sw.js` / `www/index.html` — 缓存戳
- `android/app/build.gradle` — versionCode 114
- `android/.../AndroidManifest.xml` — `POST_NOTIFICATIONS`
- `package.json` / `capacitor.config.json` — Local Notifications
- `ROUND16.md` — 本文件

## 仍可继续（非本轮）

- 原生悬浮球 / 前台服务（权限与商店策略成本高）
- 导图改名同步格子文案、溢出徽章再醒目
- 通知栏「添加任务」深层链接

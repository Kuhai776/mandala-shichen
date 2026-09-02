# Round 8 抛光小结（v2.7.24·106）

日期：2026-09-02  
范围：`d:\Downloads\mandala-shichen\www`（未改 `d:\Downloads\mant`）  
承接：Round7「仍可继续」弱项 + 用户聚焦（触屏拖、原生导出、主线拖序）

---

## 一、主页侧条 · 触屏长按拖入时辰格

| 子维度 | 状态 | 说明 |
|--------|------|------|
| 长按起拖 | ✅ | 侧条任务按住约 300ms 出幽灵条，不依赖 HTML5 DnD |
| 轴锁定 | ✅ | 先滑再判：竖/横滚动取消长按，避免误拖 |
| 半收抽屉 | ✅ | 拖拽中侧条右移收起 + 遮罩穿透，露出格子可命中 |
| 落格安排 | ✅ | 待安排→复制入格；已安排→移动；记录页可 toast「开始计时」 |
| 文案引导 | ✅ | 「长按拖到时辰格子」；拖入提示「⋮⋮ 长按拖入格子」 |
| 桌面 DnD | ✅ | 原 HTML5 拖放保留，与触屏共用 `applySideSourceToCell` |

---

## 二、原生导出通道 · 安卓 WebView

| 子维度 | 状态 | 说明 |
|--------|------|------|
| 三级回退 | ✅ | Capacitor Filesystem+Share → Web Share（files）→ `<a download>` |
| 写入文档 | ✅ | 原生环境写入 `mandala-exports/` 文档目录 |
| 系统分享 | ✅ | 有 Share 插件时调起分享面板（存下载/网盘） |
| 取消友好 | ✅ | 用户取消分享不报错；已落盘则提示文档目录 |
| 依赖声明 | ✅ | `package.json` 已列 `@capacitor/share` / `filesystem`（需本机 `npm i` + `cap sync` 才进 APK） |
| 全量/导图 | ✅ | `downloadBlobFile` / `downloadBackupFile` 统一走新通道 |

---

## 三、思维导图 · 拖改主线顺序

| 子维度 | 状态 | 说明 |
|--------|------|------|
| 同级插入 | ✅ | 拖到同级节点上/下（左右布局）或左/右（上下布局）改顺序 |
| 插入线 | ✅ | 绿色插入线 +「插入主线顺序 / 插入同级顺序」 |
| 异级改挂 | ✅ | 拖到不同父级下的节点仍为改隶属 |
| 闪位反馈 | ✅ | 松手后闪高亮并 toast「主线 第 x / n」 |
| 关联标签 | ✅ | 关联虚线中点显示中文「关联」 |
| 工具条命中 | ✅ | 窄屏/粗指针工具按钮 ≥44px |

---

## 四、界面语言 · 全中文实用向

| 子维度 | 状态 | 说明 |
|--------|------|------|
| 侧条提示 | ✅ | 长按引导，无英文缩写 |
| 导图提示 | ✅ | 摆放 toast 改为「同级拖=改顺序 · 拖到异级=改隶属」 |
| 导出提示 | ✅ | 分享/落盘/取消均为中文 |

---

## 五、版本信号

- `APP_BUILD`：**106**
- `APP_VERSION`：**2.7.24**
- `sw.js`：`mandala-v106`
- `index.html`：`?v=20260902r8`
- Android：`versionCode 106` / `versionName 2.7.24.106`

---

## 仍可继续（非阻塞）

1. 本机安装并 `cap sync` Share / Filesystem 插件后打 APK，真机验证导出落盘与分享
2. 侧条拖入后一键「贴到当前时辰空格」快捷按钮（减摩擦）
3. 导图关联线标签可编辑文案（自定义「依赖 / 参考」等）
4. 真机回归：侧条长按拖、主线拖序、窄屏工具条、导入往返

## 本地预览

```bash
cd d:\Downloads\mandala-shichen
npm start
# http://localhost:8080 硬刷新，确认徽标 v2.7.24·106
```

## 关键文件

- `www/app.js` — 侧条触屏拖、原生导出通道、导图同级拖序、关联标签、版本 106
- `www/styles.css` — 侧条拖拽半收、插入线、工具条 44px
- `www/index.html` — cache bust `r8`
- `www/sw.js` — `mandala-v106`
- `android/app/build.gradle` — versionCode 106
- `package.json` — 声明 Share / Filesystem 依赖

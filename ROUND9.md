# Round 9 抛光小结（v2.7.24·107）

日期：2026-09-02  
范围：`d:\Downloads\mandala-shichen\www`（未改 `d:\Downloads\mant`）  
承接：Round8「仍可继续」— 贴当前空格 / 关联文案 / 导出插件接线

---

## 一、侧条 · 贴当前空格（减任务→格子摩擦）

| 子维度 | 状态 | 说明 |
|--------|------|------|
| 目标解析 | ✅ | 今日优先「当前时辰·当前格」；若满则同辰首个空格；全满则追加到优先格 |
| 一键按钮 | ✅ | 待安排：「贴当前空格」；已安排：「移到当前格」 |
| 落点反馈 | ✅ | 安排后关闭侧条并 `jumpToCell` 闪格；满格追加有中文提示 |
| 区隔拖拽 | ✅ | 点按钮不触发长按拖；长按拖仍保留 |
| 标题引导 | ✅ | 「贴格 / 拖入」+ 区头显示当前贴格目标 |

---

## 二、思维导图 · 关联线可编辑文案

| 子维度 | 状态 | 说明 |
|--------|------|------|
| 存储字段 | ✅ | `meta.linkLabel`（默认「关联」） |
| 画布显示 | ✅ | 中点标签随文案伸缩；点标签/线打开菜单 |
| 快捷词 | ✅ | 关联 / 依赖 / 参考 / 阻塞 / 先后 |
| 自定义 | ✅ | 输入框最多 12 字，回车保存 |
| 反转保留 | ✅ | 反转方向时带走文案；删除时清 `link` + `linkLabel` |
| 新建默认 | ✅ | 建立关联时默认文案「关联」 |

---

## 三、导出通道 · 插件缺失优雅回退

| 子维度 | 状态 | 说明 |
|--------|------|------|
| Filesystem+Share | ✅ | 有插件：写入文档目录并可分享 |
| 仅 Share | ✅ | 无 Filesystem 时小 JSON 走文本分享 |
| Web Share / 锚点 | ✅ | 继续作为通用回退 |
| 缺插件提示 | ✅ | 原生壳首次 `console.info` 安装指引；锚点失败时中文 toast |
| 依赖声明 | ✅ | `package.json` 已列 `@capacitor/share` / `filesystem` |

### 本机接入（打 APK 前）

```bash
cd d:\Downloads\mandala-shichen
npm i @capacitor/share@^6 @capacitor/filesystem@^6
npx cap sync android
```

若本机暂无 npm：导出仍可用 Web Share / 下载锚点，不阻塞网页预览。

---

## 四、安卓画板 / 中文 UI

| 子维度 | 状态 | 说明 |
|--------|------|------|
| 安全区 | ✅ | 画布/统计条兼顾 `safe-area-inset-bottom` |
| 图例更弱 | ✅ | 窄屏图例更小更淡，空间留给节点 |
| 关联菜单触控 | ✅ | 输入框/按钮加大命中 |
| 侧条文案 | ✅ | 全程中文，无英文缩写角标 |

---

## 五、版本信号

- `APP_BUILD`：**107**
- `APP_VERSION`：**2.7.24**
- `sw.js`：`mandala-v107`
- `index.html`：`?v=20260902r9`
- Android：`versionCode 107` / `versionName 2.7.24.107`

---

## 仍可继续（非阻塞）

1. 真机：`npm i` + `cap sync` 后验证 Share/Filesystem 落盘与分享
2. 侧条贴格可选「下一空格」循环（连续贴多条）
3. 导图关联文案写入导出 JSON 已自然带上；可在大纲/统计中汇总「依赖」边
4. APK 回归：贴当前空格、关联改文案、主线拖序、侧条长按拖

## 本地预览

```bash
cd d:\Downloads\mandala-shichen
npm start
# http://localhost:8080 硬刷新，确认徽标 v2.7.24·107
```

## 关键文件

- `www/app.js` — 贴当前空格、关联文案菜单、导出回退加强、版本 107
- `www/styles.css` — 贴格按钮、关联菜单、安卓画板安全区
- `www/index.html` — 侧条标题、cache bust `r9`
- `www/sw.js` — `mandala-v107`
- `android/app/build.gradle` — versionCode 107
- `ROUND9.md` — 本文件

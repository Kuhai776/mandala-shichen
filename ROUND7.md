# Round 7 抛光小结（v2.7.24·104）

日期：2026-09-02  
范围：`d:\Downloads\mandala-shichen\www`（未改 `d:\Downloads\mant`）

## 已完成

### 1. 计划页去掉正计时
- **计划九宫格**不再渲染 ⏱/⏸/■ 正计时锚点，也不再加 `timing` / `timing-paused` 描边
- **记录页**正计时锚点、底部多钟条、命名归档流程**原样保留**
- 计划页回归「只做规划」

### 2. 导图导出 / 导入（用户反馈坏了 → 修好）
根因：下载未 `appendChild` 到 DOM（部分 WebView 静默失败）；工具栏只有「复制大纲 / PNG / HTML」，**缺少可往返的 JSON 文件导入**。

修复与增强：
- 公共 `downloadBlobFile` / `downloadBackupFile`：sanitize 文件名 + append 再 click + 失败 toast
- 导图工具栏新增 **⬇ JSON** / **⬆ 导入**（支持 `.json` / Markdown 大纲）
- 导图库增加 **⬆ 导入**；库内「导出」改为标准 `kind: mandala-mindmap` 包
- 全局「导入数据」若识别到导图 JSON，直接打开导图编辑器
- 成功 / 失败均有明确 toast

### 3. 思维导图深抛光
| 维度 | 改动 |
|------|------|
| **层级语义** | 节点角标改「主线 / 支线 / 子步」；提升/降级/改挂按根→主线→支线→子步定 type |
| **浮动条** | 去掉半透明难点；先量宽再定位；按钮 ≥44px；新增「降级」 |
| **拖拽** | hit-test 前藏 ghost；松在浮动条不当空白摆放；12px 网格吸附 |
| **上板动效** | 入场带轻微上浮（`--mm-rise`） |
| **可上板** | 流式 ≥1 条结构即点亮（更早可用） |

### 4. 版本信号
- `APP_BUILD`：**104**
- `APP_VERSION`：**2.7.24**
- `sw.js`：`mandala-v104`
- `index.html`：`?v=20260902r7` + 内联 cache-bust `20260902r7`

## 仍可继续（非阻塞）
1. 原生 APK 里用 Capacitor Share / Filesystem 替代 `<a download>`（部分机型仍可能拦下载）
2. 导图关联线标签文案 / 拖拽改主线顺序手势
3. 真机回归：浮动条、JSON 往返、计划页无钟、记录页有钟

## 本地预览
```bash
cd d:\Downloads\mandala-shichen
npm start
# http://localhost:8080 硬刷新，确认徽标 v2.7.24·104
```

## 关键文件
- `www/app.js` — 计划去钟、导图 JSON IO、拖拽/层级/浮动条、版本号
- `www/index.html` — JSON 按钮、降级按钮、cache bust
- `www/styles.css` — 浮动条命中、层级视觉、上板动效
- `www/sw.js` — `mandala-v104`

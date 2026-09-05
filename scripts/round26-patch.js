/**
 * Round26 — deep polish · v124
 * 同格新事项文案/可见性/通知一致 · 条拖丝滑+计划对等 · 边轨切时辰阈值 · 导图工具栏常驻
 * Run: node scripts/round26-patch.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const appPath = path.join(ROOT, "www", "app.js");
const cssPath = path.join(ROOT, "www", "styles.css");
const htmlPath = path.join(ROOT, "www", "index.html");
const swPath = path.join(ROOT, "www", "sw.js");
const gradlePath = path.join(ROOT, "android", "app", "build.gradle");

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}
function once(hay, old, neu, label) {
  must(hay.includes(old), label || ("missing: " + old.slice(0, 60)));
  return hay.replace(old, neu);
}

let app = fs.readFileSync(appPath, "utf8").replace(/\r\n/g, "\n");
let css = fs.readFileSync(cssPath, "utf8").replace(/\r\n/g, "\n");
let html = fs.readFileSync(htmlPath, "utf8").replace(/\r\n/g, "\n");
let sw = fs.readFileSync(swPath, "utf8").replace(/\r\n/g, "\n");
let gradle = fs.readFileSync(gradlePath, "utf8").replace(/\r\n/g, "\n");

// ---------- 1. Version 123 → 124 ----------
must(app.includes("const APP_BUILD = 123;"), "APP_BUILD 123 not found");
app = once(
  app,
  "const APP_BUILD = 123; // 构建号：与 android versionCode 同步，版本徽标直接显示（用户可自证当前版本）",
  "const APP_BUILD = 124; // 构建号：与 android versionCode 同步，版本徽标直接显示（用户可自证当前版本）"
);
app = once(
  app,
  `  const APP_CHANGELOG = [
    { v: "2.7.24·123", date: "2026-09-05", items: [
      "Round25：同格「新事项计时」——暂停后本时辰格内独立新钟，不跳下一时辰",
      "Round25：记录页任务条状可拖（含触屏）· 边轨拖拽左右切时辰淡紫动效",
      "Round25：导图横屏提示/工具栏置前 · 弱化边界装饰 · 更顺滑",
    ]},`,
  `  const APP_CHANGELOG = [
    { v: "2.7.24·124", date: "2026-09-05", items: [
      "Round26：同格「新事项」文案收紧 · 暂停格/条钮更显眼 · 通知栏三键与条内一致",
      "Round26：记录/计划任务条拖丝滑对等 · 边轨切时辰阈值防抖减抖",
      "Round26：导图主工具栏横竖常驻（缩放/关）· 画板装饰再藏",
    ]},
    { v: "2.7.24·123", date: "2026-09-05", items: [
      "Round25：同格「新事项计时」——暂停后本时辰格内独立新钟，不跳下一时辰",
      "Round25：记录页任务条状可拖（含触屏）· 边轨拖拽左右切时辰淡紫动效",
      "Round25：导图横屏提示/工具栏置前 · 弱化边界装饰 · 更顺滑",
    ]},`
);

sw = once(
  sw,
  'const CACHE_NAME = "mandala-v123"; // v123 Round25：同格新事项 · 条拖 · 边轨切时辰 · 导图横屏',
  'const CACHE_NAME = "mandala-v124"; // v124 Round26：新事项 polish · 条拖丝滑 · 边轨防抖 · 导图工具常驻'
);
gradle = once(gradle, "versionCode 123", "versionCode 124");
gradle = once(gradle, 'versionName "2.7.24.123"', 'versionName "2.7.24.124"');
html = html.replace(/\?v=20260905r25/g, "?v=20260905r26");
must(html.includes("20260905r26"), "html cache bust failed");

// ---------- 2. Notification LocalNotifications actions: 下一钟 → 新事项 ----------
app = once(
  app,
  `            {
              id: TIMER_ACTION_PAUSE,
              actions: [
                { id: "resume", title: "恢复", foreground: true },
                { id: "next", title: "下一钟", foreground: true },
                { id: "stop", title: "结束", foreground: true },
              ],
            },`,
  `            {
              id: TIMER_ACTION_PAUSE,
              actions: [
                { id: "resume", title: "恢复", foreground: true },
                { id: "next", title: "新事项", foreground: true },
                { id: "stop", title: "结束", foreground: true },
              ],
            },`
);
app = once(
  app,
  `            {
              id: TIMER_ACTION_PAUSE_MULTI,
              actions: [
                { id: "resume", title: "恢复", foreground: true },
                { id: "next", title: "下一钟", foreground: true },
                { id: "stop", title: "结束", foreground: true },
              ],
            },`,
  `            {
              id: TIMER_ACTION_PAUSE_MULTI,
              actions: [
                { id: "resume", title: "恢复", foreground: true },
                { id: "next", title: "新事项", foreground: true },
                { id: "stop", title: "结束", foreground: true },
              ],
            },`
);

// Toast / label tighten
app = once(
  app,
  '    const label = forceNew ? "▶ 新事项计时" : "⏱️ 正计时已启动";',
  '    const label = forceNew ? "▶ 新事项" : "⏱️ 正计时已启动";'
);
app = once(
  app,
  '      toast("⏸ 已暂停 · " + trunc(String(t.taskText || ""), 14) + "（累计 " + formatSpentPrecise(timerElapsedOf(t)) + "）· 可点「新事项」同格另开", "info", 2600);',
  '      toast("⏸ 已暂停 · " + trunc(String(t.taskText || ""), 14) + " · 点「新事项」同格另开", "info", 2400);'
);
app = once(
  app,
  '      toast("请先切到今日再开新事项", "info", 1800);',
  '      toast("请先切到今日", "info", 1600);'
);

// ---------- 3. Cell「新事项」可见性：本格有暂停钟且无一在跑即可（不限 current-cell） ----------
app = once(
  app,
  `    // Round25：有暂停钟且无一在跑 → 显示「新事项」（同格可再开；本格已有暂停钟也显示）
    const isNowCell = !!(cellEl.classList && cellEl.classList.contains("current-cell"));
    const _todayTimers = Object.values(runningTimers).filter((t) => t && t.date === state.currentDate);
    const _hasPausedClock = _todayTimers.some((t) => !!t.pausedAt);
    const _hasRunningClock = _todayTimers.some((t) => !t.pausedAt);
    const _showNewClock = isNowCell && state.realm === "record" && _hasPausedClock && !_hasRunningClock;
    if (_showNewClock) {
      const nowBtn = document.createElement("button");
      nowBtn.type = "button";
      nowBtn.className = "cell-timer-btn cell-timer-now cell-timer-now-label";
      nowBtn.dataset.timerNow = "1";
      nowBtn.textContent = "新事项";
      nowBtn.title = "新事项计时 · 上一口保持暂停，本时辰格内独立开钟（不跳下一时辰）";
      nowBtn.setAttribute("aria-label", "新事项计时");`,
  `    // Round26：暂停且无一在跑 → 本格显示「新事项」（优先本格有暂停钟，否则当前格）
    const isNowCell = !!(cellEl.classList && cellEl.classList.contains("current-cell"));
    const _todayTimers = Object.values(runningTimers).filter((t) => t && t.date === state.currentDate);
    const _hasRunningClock = _todayTimers.some((t) => !t.pausedAt);
    const _cellPaused = listCellTimers(period, cell).some((t) => !!t.pausedAt);
    const _anyPaused = _todayTimers.some((t) => !!t.pausedAt);
    const _showNewClock = state.realm === "record" && !_hasRunningClock && _anyPaused && (_cellPaused || isNowCell);
    if (_showNewClock) {
      const nowBtn = document.createElement("button");
      nowBtn.type = "button";
      nowBtn.className = "cell-timer-btn cell-timer-now cell-timer-now-label";
      nowBtn.dataset.timerNow = "1";
      nowBtn.textContent = "新事项";
      nowBtn.title = "同格新事项 · 上一口保持暂停（不跳时辰）";
      nowBtn.setAttribute("aria-label", "新事项");`
);

// Clock strip: contextual 切钟 / 新事项；ops 文案收紧
app = once(
  app,
  `          : ('<button type="button" class="rcs-btn" data-rcs="toggle" data-p="' + t.period + '" data-c="' + t.cell + '" data-key="' + escapeHtml(tk) + '" title="' + (paused ? "恢复" : "暂停") + '">' + (paused ? "恢复" : "暂停") + "</button>"
            + '<button type="button" class="rcs-btn" data-rcs="next" data-p="' + t.period + '" data-c="' + t.cell + '" data-key="' + escapeHtml(tk) + '" title="同格新事项计时">新事项</button>'
            + '<button type="button" class="rcs-btn rcs-end" data-rcs="stop" data-p="' + t.period + '" data-c="' + t.cell + '" data-key="' + escapeHtml(tk) + '" title="结束·命名">结束</button>'))`,
  `          : ('<button type="button" class="rcs-btn" data-rcs="toggle" data-p="' + t.period + '" data-c="' + t.cell + '" data-key="' + escapeHtml(tk) + '" title="' + (paused ? "恢复" : "暂停") + '">' + (paused ? "恢复" : "暂停") + "</button>"
            + (paused
              ? ('<button type="button" class="rcs-btn rcs-new" data-rcs="next" data-p="' + t.period + '" data-c="' + t.cell + '" data-key="' + escapeHtml(tk) + '" title="同格新事项">新事项</button>')
              : (todayTimers.length > 1
                ? ('<button type="button" class="rcs-btn" data-rcs="cycle" data-p="' + t.period + '" data-c="' + t.cell + '" data-key="' + escapeHtml(tk) + '" title="切换其他钟">切钟</button>')
                : ('<button type="button" class="rcs-btn rcs-new" data-rcs="next" data-p="' + t.period + '" data-c="' + t.cell + '" data-key="' + escapeHtml(tk) + '" title="同格新事项（先暂停本口）">新事项</button>')))
            + '<button type="button" class="rcs-btn rcs-end" data-rcs="stop" data-p="' + t.period + '" data-c="' + t.cell + '" data-key="' + escapeHtml(tk) + '" title="结束·命名">结束</button>'))`
);

app = once(
  app,
  `      + (showNewClock ? ' · <b class="newc">可新事项</b>' : "")
      + "</div>"
      + '<div class="rcs-chips">'
      + todayTimers.map((t) => chip(t, false)).join("")
      + staleTimers.map((t) => chip(t, true)).join("")
      + "</div>"
      + '<div class="rcs-ops">'
      + (showNewClock ? '<button type="button" class="rcs-newclock" data-rcs="new-clock">▶ 新事项计时</button>' : "")`,
  `      + (showNewClock ? ' · <b class="newc">可开新事项</b>' : "")
      + "</div>"
      + '<div class="rcs-chips">'
      + todayTimers.map((t) => chip(t, false)).join("")
      + staleTimers.map((t) => chip(t, true)).join("")
      + "</div>"
      + '<div class="rcs-ops">'
      + (showNewClock ? '<button type="button" class="rcs-newclock" data-rcs="new-clock">▶ 新事项</button>' : "")`
);

// Strip click: cycle action
app = once(
  app,
  `        } else if (act === "next") {
          startFreshNewClock(null, p, c);
          if (state.realm === "record") renderRecord();
          else renderMandala();
        } else if (act === "stop") {`,
  `        } else if (act === "cycle") {
          cycleNextRunningTimer(p, c);
          if (state.realm === "record") renderRecord();
          else renderMandala();
        } else if (act === "next") {
          const cur = btn.dataset.key ? getTimerByKey(btn.dataset.key) : getRunningTimer(p, c);
          if (cur && !cur.pausedAt) pauseCellTimer(p, c, findTimerKey(cur));
          startFreshNewClock(null, p, c);
          if (state.realm === "record") renderRecord();
          else renderMandala();
        } else if (act === "stop") {`
);

// Light refresh: match by data-key when present
app = once(
  app,
  `    const patchChip = (root, t, stale) => {
      if (!root) return;
      root.querySelectorAll(stale ? ".timer-chip.stale, .rcs-chip.stale" : ".timer-chip:not(.stale), .rcs-chip:not(.stale)").forEach((chip) => {
        if (parseInt(chip.dataset.p, 10) !== t.period || parseInt(chip.dataset.c, 10) !== t.cell) return;
        if (stale && (chip.dataset.date || "") !== (t.date || "")) return;
        const clock = chip.querySelector(".timer-clock, .rcs-clock");
        if (clock) clock.textContent = _fmtTimerClock(t);
      });
    };`,
  `    const patchChip = (root, t, stale) => {
      if (!root) return;
      const tk = findTimerKey(t);
      root.querySelectorAll(stale ? ".timer-chip.stale, .rcs-chip.stale" : ".timer-chip:not(.stale), .rcs-chip:not(.stale)").forEach((chip) => {
        if (tk && chip.dataset.key && chip.dataset.key !== tk) return;
        if (!chip.dataset.key && (parseInt(chip.dataset.p, 10) !== t.period || parseInt(chip.dataset.c, 10) !== t.cell)) return;
        if (stale && (chip.dataset.date || "") !== (t.date || "")) return;
        const clock = chip.querySelector(".timer-clock, .rcs-clock");
        if (clock) clock.textContent = _fmtTimerClock(t);
      });
    };`
);

// ---------- 4. Edge-rail period pan: hysteresis + longer cooldown ----------
app = once(
  app,
  `  // Round25：边轨拖拽时左右贴边切时辰 + 淡紫闪
  let _sdPeriodPanAt = 0;
  function flashPeriodPan(dir) {
    try {
      document.body.classList.remove("sd-period-pan-left", "sd-period-pan-right");
      void document.body.offsetWidth;
      document.body.classList.add(dir < 0 ? "sd-period-pan-left" : "sd-period-pan-right");
      clearTimeout(flashPeriodPan._t);
      flashPeriodPan._t = setTimeout(() => {
        document.body.classList.remove("sd-period-pan-left", "sd-period-pan-right");
      }, 420);
      const tabs = document.querySelector(".period-tabs") || document.getElementById("periodTabs");
      if (tabs) {
        tabs.classList.add("period-pan-glow");
        clearTimeout(flashPeriodPan._t2);
        flashPeriodPan._t2 = setTimeout(() => tabs.classList.remove("period-pan-glow"), 420);
      }
    } catch (e) { /* 静默 */ }
  }
  function trySdPeriodPanAt(x, y) {
    if (Date.now() - _sdPeriodPanAt < 520) return false;
    const edge = Math.max(28, Math.min(48, window.innerWidth * 0.07));
    let dir = 0;
    if (x <= edge) dir = -1;
    else if (x >= window.innerWidth - edge) dir = 1;
    if (!dir) return false;
    _sdPeriodPanAt = Date.now();
    const next = (state.activePeriod + dir + PERIOD_COUNT) % PERIOD_COUNT;
    state.activePeriod = next;
    try {
      if (typeof renderPeriodTabs === "function") renderPeriodTabs();
      if (state.realm === "record") renderRecord();
      else renderMandala();
    } catch (e) { /* 静默 */ }
    flashPeriodPan(dir);
    haptic(12);
    showDragHint(x, y, (dir < 0 ? "← " : "→ ") + (PERIOD_NAMES[next] || ("第" + (next + 1) + "辰")));
    return true;
  }`,
  `  // Round26：边轨拖拽贴边切时辰 — 进入阈值 + 退出滞回 + 冷却，减连切抖动
  let _sdPeriodPanAt = 0;
  let _sdPeriodPanArmed = true;
  let _sdPeriodPanDir = 0;
  function flashPeriodPan(dir) {
    try {
      document.body.classList.remove("sd-period-pan-left", "sd-period-pan-right");
      void document.body.offsetWidth;
      document.body.classList.add(dir < 0 ? "sd-period-pan-left" : "sd-period-pan-right");
      clearTimeout(flashPeriodPan._t);
      flashPeriodPan._t = setTimeout(() => {
        document.body.classList.remove("sd-period-pan-left", "sd-period-pan-right");
      }, 360);
      const tabs = document.querySelector(".period-tabs") || document.getElementById("periodTabs");
      if (tabs) {
        tabs.classList.add("period-pan-glow");
        clearTimeout(flashPeriodPan._t2);
        flashPeriodPan._t2 = setTimeout(() => tabs.classList.remove("period-pan-glow"), 360);
      }
    } catch (e) { /* 静默 */ }
  }
  function trySdPeriodPanAt(x, y) {
    const w = window.innerWidth || 360;
    const enter = Math.max(32, Math.min(52, w * 0.085));
    const exit = Math.max(48, Math.min(78, w * 0.13));
    let zone = 0;
    if (x <= enter) zone = -1;
    else if (x >= w - enter) zone = 1;
    if (!zone) {
      if (x > exit && x < w - exit) {
        _sdPeriodPanArmed = true;
        _sdPeriodPanDir = 0;
      }
      return false;
    }
    if (!_sdPeriodPanArmed && zone === _sdPeriodPanDir) return false;
    if (Date.now() - _sdPeriodPanAt < 780) return false;
    _sdPeriodPanAt = Date.now();
    _sdPeriodPanArmed = false;
    _sdPeriodPanDir = zone;
    const next = (state.activePeriod + zone + PERIOD_COUNT) % PERIOD_COUNT;
    state.activePeriod = next;
    try {
      if (typeof renderPeriodTabs === "function") renderPeriodTabs();
      if (state.realm === "record") renderRecord();
      else renderMandala();
    } catch (e) { /* 静默 */ }
    flashPeriodPan(zone);
    haptic(10);
    showDragHint(x, y, (zone < 0 ? "← " : "→ ") + (PERIOD_NAMES[next] || ("第" + (next + 1) + "辰")));
    return true;
  }`
);

// ---------- 5. Record drag silk: shorter hold + RAF ghost; plan touch parity ----------
app = once(
  app,
  `              }, 280);
            }, { passive: true });
            itemEl.addEventListener("touchmove", (ev) => {
              if (!ts) return;
              const t = ev.touches[0];
              if (ts.ghost) {
                ev.preventDefault();
                ts.ghost.style.left = t.clientX + "px";
                ts.ghost.style.top = t.clientY + "px";
                trySdPeriodPanAt(t.clientX, t.clientY);
                const cell = sdHighlightCellAt(t.clientX, t.clientY);
                let hint = "拖到格子 · 贴边切时辰";
                if (cell) {
                  const p = parseInt(cell.dataset.period, 10);
                  const c = parseInt(cell.dataset.cell, 10);
                  hint = "移到 " + (!isNaN(p) && PERIOD_NAMES[p] || "") + (!isNaN(c) ? " 第" + (c + 1) + "格" : "");
                }
                showDragHint(t.clientX, t.clientY, hint);
                return;
              }
              const dx = Math.abs(t.clientX - ts.startX), dy = Math.abs(t.clientY - ts.startY);
              if (ts.holdTimer && (dx > 14 || dy > 14)) {
                clearTimeout(ts.holdTimer); ts.holdTimer = null;
              }
            }, { passive: false });
            const endTouch = (ev) => {
              if (!ts) return;
              const st = ts; ts = null;
              if (st.holdTimer) clearTimeout(st.holdTimer);
              if (!st.ghost) return;
              const t = (ev.changedTouches && ev.changedTouches[0]) || null;
              const x = t ? t.clientX : 0, y = t ? t.clientY : 0;
              st.ghost.remove();
              itemEl.classList.remove("dragging-item");
              document.body.classList.remove("kb-touch-dragging");
              hideDragHint();
              const targetCell = sdHighlightCellAt(x, y);
              document.querySelectorAll(".cell.drag-over").forEach((c) => c.classList.remove("drag-over"));
              const src = draggingTaskSource;
              draggingTaskSource = null;
              if (!targetCell || !src) return;
              const tP = parseInt(targetCell.dataset.period, 10);
              const tC = parseInt(targetCell.dataset.cell, 10);
              if (isNaN(tP) || isNaN(tC)) return;
              if (src.period === tP && src.cell === tC) return;
              swapOrMoveCellTask(src.period, src.cell, src.idx, tP, tC);
              renderAll();
            };
            itemEl.addEventListener("touchend", endTouch);
            itemEl.addEventListener("touchcancel", endTouch);
          })(item, period, cell, idx);

          planList.appendChild(item);`,
  `              }, 220);
            }, { passive: true });
            itemEl.addEventListener("touchmove", (ev) => {
              if (!ts) return;
              const t = ev.touches[0];
              if (ts.ghost) {
                ev.preventDefault();
                if (ts._raf) cancelAnimationFrame(ts._raf);
                const gx = t.clientX, gy = t.clientY;
                ts._raf = requestAnimationFrame(() => {
                  if (!ts || !ts.ghost) return;
                  ts.ghost.style.transform = "translate(-50%,-50%)";
                  ts.ghost.style.left = gx + "px";
                  ts.ghost.style.top = gy + "px";
                });
                trySdPeriodPanAt(gx, gy);
                const cell = sdHighlightCellAt(gx, gy);
                let hint = "拖到格子 · 贴边切时辰";
                if (cell) {
                  const p = parseInt(cell.dataset.period, 10);
                  const c = parseInt(cell.dataset.cell, 10);
                  hint = "移到 " + (!isNaN(p) && PERIOD_NAMES[p] || "") + (!isNaN(c) ? " 第" + (c + 1) + "格" : "");
                }
                showDragHint(gx, gy, hint);
                return;
              }
              const dx = Math.abs(t.clientX - ts.startX), dy = Math.abs(t.clientY - ts.startY);
              if (ts.holdTimer && (dx > 12 || dy > 12)) {
                clearTimeout(ts.holdTimer); ts.holdTimer = null;
              }
            }, { passive: false });
            const endTouch = (ev) => {
              if (!ts) return;
              const st = ts; ts = null;
              if (st.holdTimer) clearTimeout(st.holdTimer);
              if (st._raf) cancelAnimationFrame(st._raf);
              if (!st.ghost) return;
              const t = (ev.changedTouches && ev.changedTouches[0]) || null;
              const x = t ? t.clientX : 0, y = t ? t.clientY : 0;
              st.ghost.remove();
              itemEl.classList.remove("dragging-item");
              document.body.classList.remove("kb-touch-dragging");
              hideDragHint();
              const targetCell = sdHighlightCellAt(x, y);
              document.querySelectorAll(".cell.drag-over").forEach((c) => c.classList.remove("drag-over"));
              const src = draggingTaskSource;
              draggingTaskSource = null;
              if (!targetCell || !src) return;
              const tP = parseInt(targetCell.dataset.period, 10);
              const tC = parseInt(targetCell.dataset.cell, 10);
              if (isNaN(tP) || isNaN(tC)) return;
              if (src.period === tP && src.cell === tC) return;
              swapOrMoveCellTask(src.period, src.cell, src.idx, tP, tC);
              renderAll();
            };
            itemEl.addEventListener("touchend", endTouch);
            itemEl.addEventListener("touchcancel", endTouch);
          })(item, period, cell, idx);

          planList.appendChild(item);`
);

// Plan page touch drag parity (after plan HTML5 dragend)
const PLAN_DRAG_END = `          item.addEventListener("dragend", () => {
            item.classList.remove("dragging-item");
            draggingTaskSource = null;
          });

          // 双击任务条 → 从收集箱安排的移回收集箱（取消安排动作）`;

must(app.includes(PLAN_DRAG_END), "plan drag end mark not found");
must(!app.includes("Round26：计划页任务条触屏长按拖"), "plan touch already patched?");
app = once(
  app,
  PLAN_DRAG_END,
  `          item.addEventListener("dragend", () => {
            item.classList.remove("dragging-item");
            draggingTaskSource = null;
            document.querySelectorAll(".cell.drag-over").forEach((c) => c.classList.remove("drag-over"));
          });

          // Round26：计划页任务条触屏长按拖（与记录页对等丝滑）
          (function bindPlanTaskTouch(itemEl, p0, c0, i0) {
            let ts = null;
            itemEl.addEventListener("touchstart", (ev) => {
              if (ev.target.closest(".task-checkbox, button, input")) return;
              if (!ev.touches || ev.touches.length !== 1) return;
              const t = ev.touches[0];
              ts = { startX: t.clientX, startY: t.clientY, holdTimer: null, ghost: null };
              ts.holdTimer = setTimeout(() => {
                if (!ts) return;
                const ghost = document.createElement("div");
                ghost.className = "kb-drag-ghost sd-drag-ghost silk-ghost";
                ghost.textContent = (taskText(getCellTasks(p0, c0)[i0]) || "任务").slice(0, 28);
                document.body.appendChild(ghost);
                ts.ghost = ghost;
                draggingTaskSource = { period: p0, cell: c0, idx: i0 };
                itemEl.classList.add("dragging-item");
                document.body.classList.add("kb-touch-dragging");
                haptic(18);
                ghost.style.left = t.clientX + "px";
                ghost.style.top = t.clientY + "px";
                sdHighlightCellAt(t.clientX, t.clientY);
                showDragHint(t.clientX, t.clientY, "拖到格子 · 贴边切时辰");
              }, 220);
            }, { passive: true });
            itemEl.addEventListener("touchmove", (ev) => {
              if (!ts) return;
              const t = ev.touches[0];
              if (ts.ghost) {
                ev.preventDefault();
                if (ts._raf) cancelAnimationFrame(ts._raf);
                const gx = t.clientX, gy = t.clientY;
                ts._raf = requestAnimationFrame(() => {
                  if (!ts || !ts.ghost) return;
                  ts.ghost.style.transform = "translate(-50%,-50%)";
                  ts.ghost.style.left = gx + "px";
                  ts.ghost.style.top = gy + "px";
                });
                trySdPeriodPanAt(gx, gy);
                const cell = sdHighlightCellAt(gx, gy);
                let hint = "拖到格子 · 贴边切时辰";
                if (cell) {
                  const p = parseInt(cell.dataset.period, 10);
                  const c = parseInt(cell.dataset.cell, 10);
                  hint = "移到 " + (!isNaN(p) && PERIOD_NAMES[p] || "") + (!isNaN(c) ? " 第" + (c + 1) + "格" : "");
                }
                showDragHint(gx, gy, hint);
                return;
              }
              const dx = Math.abs(t.clientX - ts.startX), dy = Math.abs(t.clientY - ts.startY);
              if (ts.holdTimer && (dx > 12 || dy > 12)) {
                clearTimeout(ts.holdTimer); ts.holdTimer = null;
              }
            }, { passive: false });
            const endTouch = (ev) => {
              if (!ts) return;
              const st = ts; ts = null;
              if (st.holdTimer) clearTimeout(st.holdTimer);
              if (st._raf) cancelAnimationFrame(st._raf);
              if (!st.ghost) return;
              const t = (ev.changedTouches && ev.changedTouches[0]) || null;
              const x = t ? t.clientX : 0, y = t ? t.clientY : 0;
              st.ghost.remove();
              itemEl.classList.remove("dragging-item");
              document.body.classList.remove("kb-touch-dragging");
              hideDragHint();
              const targetCell = sdHighlightCellAt(x, y);
              document.querySelectorAll(".cell.drag-over").forEach((c) => c.classList.remove("drag-over"));
              const src = draggingTaskSource;
              draggingTaskSource = null;
              if (!targetCell || !src) return;
              const tP = parseInt(targetCell.dataset.period, 10);
              const tC = parseInt(targetCell.dataset.cell, 10);
              if (isNaN(tP) || isNaN(tC)) return;
              if (src.period === tP && src.cell === tC) return;
              swapOrMoveCellTask(src.period, src.cell, src.idx, tP, tC);
              renderAll();
            };
            itemEl.addEventListener("touchend", endTouch);
            itemEl.addEventListener("touchcancel", endTouch);
          })(item, period, cell, idx);

          // 双击任务条 → 从收集箱安排的移回收集箱（取消安排动作）`
);

// Record ghost class silk
app = once(
  app,
  '                ghost.className = "kb-drag-ghost sd-drag-ghost";\n                ghost.textContent = (taskText(getCellTasks(p0, c0)[i0]) || "任务").slice(0, 28);\n                document.body.appendChild(ghost);\n                ts.ghost = ghost;\n                draggingTaskSource = { period: p0, cell: c0, idx: i0 };\n                itemEl.classList.add("dragging-item");\n                document.body.classList.add("kb-touch-dragging");\n                haptic(22);',
  '                ghost.className = "kb-drag-ghost sd-drag-ghost silk-ghost";\n                ghost.textContent = (taskText(getCellTasks(p0, c0)[i0]) || "任务").slice(0, 28);\n                document.body.appendChild(ghost);\n                ts.ghost = ghost;\n                draggingTaskSource = { period: p0, cell: c0, idx: i0 };\n                itemEl.classList.add("dragging-item");\n                document.body.classList.add("kb-touch-dragging");\n                haptic(18);'
);

// ---------- 6. HTML hint tighten ----------
html = once(
  html,
  `        <div class="record-timer-hint" id="recordTimerHint" title="多时钟：任意时刻最多一口在跑；暂停后「新事项」在同一时辰格内独立计时；■ 结束命名写入本格">
          ⏱ 正计时：<b>⏱启动</b> → <b>暂停</b> → 琥珀 <b>新事项</b> = 同格独立开钟（不跳时辰）· 条内 <b>恢复/新事项/结束</b>
`,
  `        <div class="record-timer-hint" id="recordTimerHint" title="最多一口在跑；暂停后「新事项」同格另开；通知栏 恢复|新事项|结束；■ 命名写入">
          ⏱ <b>启动</b> → <b>暂停</b> → <b>新事项</b>（同格）· 条/通知 <b>恢复|新事项|结束</b>
`
);
html = once(
  html,
  `<small class="mm-task-sub" id="mmTaskSub">横屏更佳 · 点选 · 长按拖/编辑 · 估时/微移</small>`,
  `<small class="mm-task-sub" id="mmTaskSub">缩放/关在顶栏 · 点选 · 长按拖</small>`
);
html = once(
  html,
  `<div class="mm-hint" id="mmHint">💡 横屏效果更佳 · 点选 · 长按拖/编辑 · 估时·微移</div>`,
  `<div class="mm-hint" id="mmHint" hidden>点选 · 长按拖 · 顶栏缩放/关</div>`
);

// ---------- 7. CSS Round26 ----------
const CSS_R26 = `

/* ============================================================
 * Round26：新事项可见性 · 条拖丝滑 · 边轨滞回 · 导图工具常驻
 * ============================================================ */
.cell-timer-btn.cell-timer-now-label {
  min-width: 64px !important;
  height: 34px !important;
  padding: 0 10px !important;
  font-size: 12.5px !important;
  font-weight: 800 !important;
  letter-spacing: .02em;
  animation: r26-newpulse 1.8s ease-in-out infinite;
}
@keyframes r26-newpulse {
  0%, 100% { box-shadow: 0 2px 10px rgba(167,139,250,.4); }
  50% { box-shadow: 0 3px 16px rgba(167,139,250,.7); }
}
.rcs-chip .rcs-btn.rcs-new {
  background: linear-gradient(135deg, #a78bfa, #c4b5fd) !important;
  color: #1a1030 !important;
  font-weight: 800 !important;
}
.rcs-ops .rcs-newclock {
  min-height: 42px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: .03em;
}

.realm-record .cell-content-item.task-bar,
.realm-plan .cell-content-item.task-bar {
  transition: transform .18s cubic-bezier(.22,.68,0,1.2), opacity .18s ease, box-shadow .2s ease, background .2s ease;
  will-change: transform;
}
.realm-record .cell-content-item.task-bar.dragging-item,
.realm-plan .cell-content-item.task-bar.dragging-item {
  opacity: .35;
  transform: scale(.94);
  box-shadow: none;
}
.kb-drag-ghost.silk-ghost,
.sd-drag-ghost.silk-ghost {
  border-radius: 12px;
  padding: 8px 12px;
  font-weight: 650;
  letter-spacing: .01em;
  background: linear-gradient(135deg, rgba(124,92,255,.92), rgba(167,139,250,.88));
  color: #fff;
  box-shadow: 0 10px 28px rgba(80,50,160,.35), 0 2px 6px rgba(0,0,0,.2);
  pointer-events: none;
  z-index: 9999;
  backdrop-filter: blur(6px);
  transition: none;
}
.cell.drag-over {
  outline: 2px solid rgba(167,139,250,.65) !important;
  outline-offset: -2px;
  box-shadow: inset 0 0 0 1px rgba(196,181,253,.35), 0 0 18px rgba(124,92,255,.2);
  transition: box-shadow .16s ease, outline-color .16s ease;
}

body.sd-period-pan-left::after,
body.sd-period-pan-right::after {
  width: 44px;
  opacity: .42;
  transition: opacity .25s ease;
}
body.sd-period-pan-left .mandala-grid,
body.sd-period-pan-right .mandala-grid,
body.sd-period-pan-left .record-grid,
body.sd-period-pan-right .record-grid {
  transition: box-shadow .22s ease, transform .22s cubic-bezier(.22,.68,0,1.1);
}

/* 导图：主工具栏始终可达（缩放/关置顶固定） */
.mm-head {
  position: sticky;
  top: 0;
  z-index: 40;
  background: var(--bg-primary, #0f0f1e);
  padding-top: max(4px, env(safe-area-inset-top, 0px));
}
.mm-tb-primary {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  background: rgba(20,16,36,.92);
  border-radius: 10px;
  padding: 2px 4px;
  border: 1px solid rgba(167,139,250,.22);
}
.mm-tb-close {
  margin-left: auto !important;
  min-width: 44px !important;
  min-height: 44px !important;
  font-size: 18px;
  background: rgba(248,113,113,.22) !important;
  color: #fecaca !important;
  border: 1px solid rgba(248,113,113,.45) !important;
}
.mm-stats, .mm-hint { pointer-events: none; }
.mm-legend, .mm-chrome-hidden { display: none !important; }
.mm-canvas {
  background: var(--bg-primary, #0f0f1e) !important;
  background-image: none !important;
}
@media (orientation: landscape) and (max-height: 560px) {
  .mm-head {
    flex-direction: row !important;
    align-items: center;
    gap: 6px;
    padding: 2px 6px !important;
    flex-wrap: nowrap;
  }
  .mm-title { flex: 0 1 auto; max-width: 22vw; min-width: 0; }
  .mm-task-sub { display: none; }
  .mm-toolbar {
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    overflow: visible !important;
    align-items: center;
    gap: 6px !important;
  }
  .mm-tb-primary {
    order: 1 !important;
    flex: 0 0 auto !important;
  }
  .mm-tb-secondary {
    order: 2 !important;
    flex: 1 1 auto;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    max-width: none;
    min-width: 0;
  }
  .mm-tb-primary .mm-tb,
  .mm-tb-primary .mm-tb-close {
    min-height: 42px;
    min-width: 42px;
  }
}
@media (orientation: portrait), (max-width: 720px) {
  .mm-tb-primary {
    width: 100%;
    justify-content: flex-start;
  }
  .mm-tb-close { margin-left: auto !important; }
  .mm-tb-secondary { width: 100%; max-height: 28vh; overflow-y: auto; }
}
`;

if (!css.includes("Round26：新事项可见性")) {
  css += CSS_R26;
}

fs.writeFileSync(appPath, app);
fs.writeFileSync(cssPath, css);
fs.writeFileSync(htmlPath, html);
fs.writeFileSync(swPath, sw);
fs.writeFileSync(gradlePath, gradle);

console.log("Round26 patch OK → v124");

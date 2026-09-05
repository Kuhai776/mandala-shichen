/**
 * Round25 — 同格新事项 · 记录条拖 · 边轨切时辰 · 导图横屏 UX · v123
 * Run: node scripts/round25-patch.js
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

let app = fs.readFileSync(appPath, "utf8").replace(/\r\n/g, "\n");
let css = fs.readFileSync(cssPath, "utf8").replace(/\r\n/g, "\n");
let html = fs.readFileSync(htmlPath, "utf8").replace(/\r\n/g, "\n");
let sw = fs.readFileSync(swPath, "utf8").replace(/\r\n/g, "\n");
let gradle = fs.readFileSync(gradlePath, "utf8").replace(/\r\n/g, "\n");

// ---------- 1. Version bump 122 → 123 ----------
must(app.includes("const APP_BUILD = 122;"), "APP_BUILD 122 not found");
app = app.replace(
  "const APP_BUILD = 122; // 构建号：与 android versionCode 同步，版本徽标直接显示（用户可自证当前版本）",
  "const APP_BUILD = 123; // 构建号：与 android versionCode 同步，版本徽标直接显示（用户可自证当前版本）"
);
app = app.replace(
  '  const APP_VERSION_DATE = "2026-09-04";',
  '  const APP_VERSION_DATE = "2026-09-05";'
);
app = app.replace(
  `  const APP_CHANGELOG = [
    { v: "2.7.24·122", date: "2026-09-04", items: [
      "Round24：记录页多钟条显式 暂停/恢复/下一钟/结束 + 暂停态「新开钟」琥珀钮",
      "Round24：导图节点与分支中点「+」加子节点（安卓大触控）",
      "Round24：修复标签切换；竖屏工具栏换行，横屏横滑；导图画板安全区自适应",
    ]},`,
  `  const APP_CHANGELOG = [
    { v: "2.7.24·123", date: "2026-09-05", items: [
      "Round25：同格「新事项计时」——暂停后本时辰格内独立新钟，不跳下一时辰",
      "Round25：记录页任务条状可拖（含触屏）· 边轨拖拽左右切时辰淡紫动效",
      "Round25：导图横屏提示/工具栏置前 · 弱化边界装饰 · 更顺滑",
    ]},
    { v: "2.7.24·122", date: "2026-09-04", items: [
      "Round24：记录页多钟条显式 暂停/恢复/下一钟/结束 + 暂停态「新开钟」琥珀钮",
      "Round24：导图节点与分支中点「+」加子节点（安卓大触控）",
      "Round24：修复标签切换；竖屏工具栏换行，横屏横滑；导图画板安全区自适应",
    ]},`
);

sw = sw.replace(
  'const CACHE_NAME = "mandala-v122"; // v122 Round24：记录页新开钟 UI · 导图+ · 标签/工具栏/画板',
  'const CACHE_NAME = "mandala-v123"; // v123 Round25：同格新事项 · 条拖 · 边轨切时辰 · 导图横屏'
);
must(sw.includes("mandala-v123"), "SW bump failed");

gradle = gradle.replace("versionCode 122", "versionCode 123");
gradle = gradle.replace('versionName "2.7.24.122"', 'versionName "2.7.24.123"');
must(gradle.includes("versionCode 123"), "gradle bump failed");

html = html.replace(/\?v=20260904r24/g, "?v=20260905r25");
must(html.includes("20260905r25"), "html cache bust failed");

// ---------- 2. Multi-matter timer keys + same-cell 新事项 ----------
const OLD_TIMER_KEY = `  function timerKeyOf(date, p, c) { return date + "_" + p + "_" + c; }
  function getRunningTimer(period, cell) {
    return runningTimers[timerKeyOf(state.currentDate, period, cell)] || null;
  }`;

const NEW_TIMER_KEY = `  /** Round25：同格可多口独立事项钟；键 = date_p_c 或 date_p_c#matterId */
  function timerKeyOf(date, p, c, matterId) {
    const base = date + "_" + p + "_" + c;
    return matterId ? base + "#" + matterId : base;
  }
  function listCellTimers(period, cell, date) {
    date = date != null ? date : state.currentDate;
    const prefix = date + "_" + period + "_" + cell;
    return Object.keys(runningTimers).filter((k) => k === prefix || k.startsWith(prefix + "#"))
      .map((k) => {
        const t = runningTimers[k];
        if (!t) return null;
        t._key = k;
        if (!t.matterId && k.indexOf("#") > 0) t.matterId = k.split("#").slice(1).join("#");
        return t;
      }).filter(Boolean);
  }
  function findTimerKey(t) {
    if (!t) return null;
    if (t._key && runningTimers[t._key] === t) return t._key;
    for (const k of Object.keys(runningTimers)) {
      if (runningTimers[k] === t) return k;
    }
    return timerKeyOf(t.date || state.currentDate, t.period, t.cell, t.matterId || null);
  }
  function getRunningTimer(period, cell) {
    const list = listCellTimers(period, cell);
    if (!list.length) return null;
    const run = list.find((x) => !x.pausedAt);
    if (run) return run;
    return list.slice().sort((a, b) => (b.pausedAt || 0) - (a.pausedAt || 0))[0];
  }
  function getTimerByKey(key) {
    if (!key) return null;
    const t = runningTimers[key];
    if (t) t._key = key;
    return t || null;
  }`;

must(app.includes(OLD_TIMER_KEY), "timerKeyOf block not found");
app = app.replace(OLD_TIMER_KEY, NEW_TIMER_KEY);

// startCellTimer — support forceNew same-cell matter
const OLD_START = `  // 启动正计时：先自动暂停其他在跑的钟（A 在跑 → B 开钟时 A 冻结保留累计），再启动新钟
  function startCellTimer(period, cell, taskText) {
    const key = timerKeyOf(state.currentDate, period, cell);
    if (runningTimers[key] && !runningTimers[key].pausedAt) { toast("该格子已在计时中", "info"); return false; }
    if (runningTimers[key] && runningTimers[key].pausedAt) {
      // 暂停中的钟 → 恢复（先暂停其他）
      _pauseAllRunning(key);
      const t = runningTimers[key];
      t.startTime = Date.now();
      t.pausedAt = null;
      save(RUNNING_TIMERS_KEY, runningTimers);
      _startTimerTick();
      renderRunningTimerBar();
      renderMandala();
      toast("▶ 已恢复计时 · " + trunc(String(t.taskText || "任务"), 14), "success", 2000);
      haptic(20);
      try { _timerNotifForce = true; syncTimerNotification({ requestPerm: true }); } catch (e) {}
      return true;
    }
    _pauseAllRunning(key);
    runningTimers[key] = { startTime: Date.now(), taskText: String(taskText || "未命名任务"), period, cell, date: state.currentDate, accumMs: 0 };
    save(RUNNING_TIMERS_KEY, runningTimers);
    _startTimerTick();
    renderRunningTimerBar();
    renderMandala();
    const pausedN = Object.values(runningTimers).filter((x) => x.pausedAt && x.date === state.currentDate).length;
    toast("⏱️ 正计时已启动 · " + trunc(String(taskText || "任务"), 14) + (pausedN ? \`（其余 \${pausedN} 钟已暂停）\` : ""), "success", 2200);
    haptic(20);
    try { _timerNotifForce = true; syncTimerNotification({ requestPerm: true }); } catch (e) {}
    return true;
  }`;

const NEW_START = `  // 启动正计时：先自动暂停其他在跑的钟；opts.forceNew = 同格新事项（不恢复旧钟、不跳时辰）
  function startCellTimer(period, cell, taskText, opts) {
    opts = opts || {};
    const forceNew = !!opts.forceNew;
    const existing = getRunningTimer(period, cell);
    if (!forceNew && existing && !existing.pausedAt) { toast("该格子已在计时中", "info"); return false; }
    if (!forceNew && existing && existing.pausedAt) {
      const key = findTimerKey(existing);
      _pauseAllRunning(key);
      const t = existing;
      t.startTime = Date.now();
      t.pausedAt = null;
      save(RUNNING_TIMERS_KEY, runningTimers);
      _startTimerTick();
      renderRunningTimerBar();
      renderMandala();
      toast("▶ 已恢复计时 · " + trunc(String(t.taskText || "任务"), 14), "success", 2000);
      haptic(20);
      try { _timerNotifForce = true; syncTimerNotification({ requestPerm: true }); } catch (e) {}
      return true;
    }
    const siblings = listCellTimers(period, cell);
    const matterId = (siblings.length || forceNew)
      ? ("m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5))
      : null;
    const key = timerKeyOf(state.currentDate, period, cell, matterId);
    _pauseAllRunning(key);
    runningTimers[key] = {
      startTime: Date.now(),
      taskText: String(taskText || "未命名任务"),
      period, cell,
      date: state.currentDate,
      accumMs: 0,
      matterId: matterId || undefined,
      _key: key,
    };
    save(RUNNING_TIMERS_KEY, runningTimers);
    _startTimerTick();
    renderRunningTimerBar();
    renderMandala();
    const pausedN = Object.values(runningTimers).filter((x) => x.pausedAt && x.date === state.currentDate).length;
    const label = forceNew ? "▶ 新事项计时" : "⏱️ 正计时已启动";
    toast(label + " · " + trunc(String(taskText || "任务"), 14) + (pausedN ? \`（其余 \${pausedN} 钟已暂停）\` : ""), "success", 2200);
    haptic(20);
    try { _timerNotifForce = true; syncTimerNotification({ requestPerm: true }); } catch (e) {}
    return true;
  }`;

must(app.includes("function startCellTimer(period, cell, taskText) {"), "startCellTimer not found");
must(app.includes(OLD_START), "OLD_START block mismatch");
app = app.replace(OLD_START, NEW_START);

// pauseCellTimer — use findTimerKey
app = app.replace(
  `  function pauseCellTimer(period, cell) {
    const key = timerKeyOf(state.currentDate, period, cell);
    const t = runningTimers[key];
    if (!t || t.pausedAt) return false;`,
  `  function pauseCellTimer(period, cell, keyOrNull) {
    let key = keyOrNull || null;
    let t = key ? getTimerByKey(key) : getRunningTimer(period, cell);
    if (t && !key) key = findTimerKey(t);
    if (!t || t.pausedAt || !key) return false;`
);

app = app.replace(
  `        onClick: () => {
          startCellTimer(next.period, next.cell, next.taskText);
          if (state.realm === "record") renderRecord();
        },
      });
    } else {
      toast("⏸ 已暂停 · " + trunc(String(t.taskText || ""), 14) + "（累计 " + formatSpentPrecise(timerElapsedOf(t)) + "）", "info", 2200);
    }`,
  `        onClick: () => {
          startCellTimer(next.period, next.cell, next.taskText);
          if (state.realm === "record") renderRecord();
        },
      });
    } else {
      toast("⏸ 已暂停 · " + trunc(String(t.taskText || ""), 14) + "（累计 " + formatSpentPrecise(timerElapsedOf(t)) + "）· 可点「新事项」同格另开", "info", 2600);
    }`
);
app = app.replace('label: "开始下一钟"', 'label: "恢复其他钟"');

// stopCellTimer — key aware
app = app.replace(
  `  function stopCellTimer(period, cell, opts) {
    opts = opts || {};
    const key = timerKeyOf(state.currentDate, period, cell);
    const t = runningTimers[key];
    if (!t) return null;`,
  `  function stopCellTimer(period, cell, opts) {
    opts = opts || {};
    let key = opts.key || null;
    let t = key ? getTimerByKey(key) : getRunningTimer(period, cell);
    if (t && !key) key = findTimerKey(t);
    if (!t || !key) return null;`
);

// startFreshNewClock — SAME cell only
const OLD_FRESH = `  /** Round24：暂停态「新开钟」——上一口保持暂停，在当前时刻格（或下一空格）开新事项 */
  function startFreshNewClock(hintText) {
    if (!isToday(state.currentDate)) {
      toast("请先切到今日再开新钟", "info", 1800);
      return false;
    }
    const g = getCurrentGlobalCell();
    let targetP = g >= 0 ? Math.floor(g / CELLS_PER_PERIOD) : (state.activePeriod | 0);
    let targetC = g >= 0 ? (g % CELLS_PER_PERIOD) : 0;
    let guard = 0;
    while (getRunningTimer(targetP, targetC) && guard++ < PERIOD_COUNT * CELLS_PER_PERIOD) {
      const nc = nextPeriodCell(targetP, targetC);
      if (!nc) break;
      targetP = nc.p;
      targetC = nc.c;
    }
    if (getRunningTimer(targetP, targetC)) {
      toast("所有格子都有钟，请先结束一口", "warn", 2200);
      return false;
    }
    const tasks = getCellTasks(targetP, targetC) || [];
    const hintTask = tasks.find((t) => t && !t.sticky && String(t.text || "").trim());
    const hint = (hintText && String(hintText).trim()) || (hintTask && hintTask.text) || "未命名任务";
    startCellTimer(targetP, targetC, hint);
    toast("▶ 已新开钟 · " + trunc(String(hint), 14) + "（上一口保持暂停）", "success", 2200);
    try {
      if (state.realm !== "record") setRealm("record");
      jumpToCell(targetP, targetC);
      if (state.realm === "record") renderRecord();
    } catch (e) { /* 静默 */ }
    haptic(18);
    return true;
  }`;

const NEW_FRESH = `  /** Round25：同格「新事项计时」——上一口保持暂停，在同一时辰格内开独立新钟（绝不跳下一时辰） */
  function startFreshNewClock(hintText, periodHint, cellHint) {
    if (!isToday(state.currentDate)) {
      toast("请先切到今日再开新事项", "info", 1800);
      return false;
    }
    const g = getCurrentGlobalCell();
    let targetP = (periodHint != null && !isNaN(periodHint)) ? (periodHint | 0)
      : (g >= 0 ? Math.floor(g / CELLS_PER_PERIOD) : (state.activePeriod | 0));
    let targetC = (cellHint != null && !isNaN(cellHint)) ? (cellHint | 0)
      : (g >= 0 ? (g % CELLS_PER_PERIOD) : 0);
    // 若传入/当前格无上下文，优先落在「最近暂停钟」的同格
    if (periodHint == null || cellHint == null) {
      const paused = Object.values(runningTimers).filter((t) => t && t.date === state.currentDate && t.pausedAt);
      if (paused.length) {
        paused.sort((a, b) => (b.pausedAt || 0) - (a.pausedAt || 0));
        targetP = paused[0].period | 0;
        targetC = paused[0].cell | 0;
      } else if (g >= 0) {
        targetP = Math.floor(g / CELLS_PER_PERIOD);
        targetC = g % CELLS_PER_PERIOD;
      }
    }
    const tasks = getCellTasks(targetP, targetC) || [];
    const hintTask = tasks.find((t) => t && !t.sticky && String(t.text || "").trim());
    const hint = (hintText && String(hintText).trim()) || (hintTask && hintTask.text) || "未命名事项";
    const ok = startCellTimer(targetP, targetC, hint, { forceNew: true });
    if (!ok) return false;
    try {
      if (state.realm !== "record") setRealm("record");
      jumpToCell(targetP, targetC);
      if (state.realm === "record") renderRecord();
    } catch (e) { /* 静默 */ }
    haptic(18);
    return true;
  }`;

must(app.includes(OLD_FRESH), "startFreshNewClock block not found");
app = app.replace(OLD_FRESH, NEW_FRESH);

// startNextOrNewClock — when no other paused, same-cell 新事项 (not next cell)
const OLD_NEXT_TAIL = `    // 无其他暂停钟 → 新开钟：优先「当前时刻格」，若该格已有钟则下一格
    if (!isToday(state.currentDate)) {
      toast("没有可切换的下一钟", "info", 1800);
      return false;
    }
    const g = getCurrentGlobalCell();
    let targetP = curP | 0, targetC = curC | 0;
    if (g >= 0) {
      targetP = Math.floor(g / CELLS_PER_PERIOD);
      targetC = g % CELLS_PER_PERIOD;
    }
    if (getRunningTimer(targetP, targetC)) {
      const nc = nextPeriodCell(targetP, targetC);
      if (!nc) {
        toast("没有可切换的下一钟", "info", 1800);
        return false;
      }
      targetP = nc.p;
      targetC = nc.c;
    }
    if (getRunningTimer(targetP, targetC)) {
      const t = getRunningTimer(targetP, targetC);
      startCellTimer(targetP, targetC, t.taskText);
      toast("⏭ 下一钟 · " + trunc(String(t.taskText || "任务"), 14), "success", 1800);
      return true;
    }
    const tasks = getCellTasks(targetP, targetC) || [];
    const hintTask = tasks.find((t) => t && !t.sticky && String(t.text || "").trim());
    const hint = (hintTask && hintTask.text) || "未命名任务";
    startCellTimer(targetP, targetC, hint);
    toast("▶ 已新开钟 · " + trunc(String(hint), 14), "success", 2000);
    try {
      setRealm("record");
      jumpToCell(targetP, targetC);
    } catch (e) { /* 静默 */ }
    return true;
  }`;

const NEW_NEXT_TAIL = `    // Round25：无其他暂停钟 → 同格新事项计时（不跳时辰）
    if (!isToday(state.currentDate)) {
      toast("没有可切换的钟", "info", 1800);
      return false;
    }
    return startFreshNewClock(null, curP, curC);
  }`;

must(app.includes(OLD_NEXT_TAIL), "startNextOrNewClock tail not found");
app = app.replace(OLD_NEXT_TAIL, NEW_NEXT_TAIL);

app = app.replace(
  `      toast("⏭ 下一钟 · " + trunc(String(nxt.taskText || "任务"), 14), "success", 1800);`,
  `      toast("⏭ 切换事项 · " + trunc(String(nxt.taskText || "任务"), 14), "success", 1800);`
);

// Notification buttons
app = app.replace(
  `    // Round23：暂停态一律 恢复|下一钟|结束（可新开钟切事项；不再用「记任务」占第三键）
    if (paused) {
      return [
        { id: "resume", title: "恢复" },
        { id: "next", title: "下一钟" },
        { id: "stop", title: "结束" },
      ];
    }`,
  `    // Round25：暂停态 恢复|新事项|结束（同格新事项，非下一时辰）
    if (paused) {
      return [
        { id: "resume", title: "恢复" },
        { id: "next", title: "新事项" },
        { id: "stop", title: "结束" },
      ];
    }`
);

app = app.replace(
  `        // 在跑多钟：切钟轮转；暂停态：下一钟/新开钟
        if (t && !t.pausedAt) {
          const list = Object.values(runningTimers || {}).filter((x) => x && x.date === state.currentDate);
          if (list.length > 1) cycleNextRunningTimer(p, c);
          else startNextOrNewClock(p, c);
        } else {
          startNextOrNewClock(p, c);
        }`,
  `        // 在跑多钟：切钟轮转；暂停态：同格新事项
        if (t && !t.pausedAt) {
          const list = Object.values(runningTimers || {}).filter((x) => x && x.date === state.currentDate);
          if (list.length > 1) cycleNextRunningTimer(p, c);
          else startFreshNewClock(null, p, c);
        } else {
          startFreshNewClock(null, p, c);
        }`
);

// Cell button labels
app = app.replace(
  `      nowBtn.textContent = "新开钟";
      nowBtn.title = "新开钟 · 上一口保持暂停，本格开新事项";
      nowBtn.setAttribute("aria-label", "新开钟");`,
  `      nowBtn.textContent = "新事项";
      nowBtn.title = "新事项计时 · 上一口保持暂停，本时辰格内独立开钟（不跳下一时辰）";
      nowBtn.setAttribute("aria-label", "新事项计时");`
);
app = app.replace(
  `        const hint = taskTextHint || "未命名任务";
        startCellTimer(period, cell, hint);
        if (state.realm === "record") renderRecord();
        else renderMandala();
      };
      nowBtn.addEventListener("pointerup", fireNow);`,
  `        const hint = taskTextHint || "未命名事项";
        startFreshNewClock(hint, period, cell);
        if (state.realm === "record") renderRecord();
        else renderMandala();
      };
      nowBtn.addEventListener("pointerup", fireNow);`
);

// Clock strip chips — key-aware + 新事项 copy
app = app.replace(
  `      + (showNewClock ? ' · <b class="newc">可新开钟</b>' : "")`,
  `      + (showNewClock ? ' · <b class="newc">可新事项</b>' : "")`
);
app = app.replace(
  `      + (showNewClock ? '<button type="button" class="rcs-newclock" data-rcs="new-clock">▶ 新开钟</button>' : "")`,
  `      + (showNewClock ? '<button type="button" class="rcs-newclock" data-rcs="new-clock">▶ 新事项计时</button>' : "")`
);

const OLD_CHIP = `    const chip = (t, stale) => {
      const paused = !!t.pausedAt;
      const active = !stale && !paused;
      return '<div class="rcs-chip' + (paused ? " paused" : "") + (stale ? " stale" : "") + (active ? " active-run" : "") + '"'
        + ' data-p="' + t.period + '" data-c="' + t.cell + '"'
        + (stale ? ' data-date="' + escapeHtml(t.date || "") + '"' : "") + ">"
        + "<span>" + (stale ? "📅" : (paused ? "⏸" : "⏱")) + "</span>"
        + "<span>" + escapeHtml(trunc(t.taskText || "未命名", 10)) + "</span>"
        + '<span class="rcs-clock">' + _fmtTimerClock(t) + "</span>"
        + (stale
          ? ('<button type="button" class="rcs-btn" data-rcs="bring" data-date="' + escapeHtml(t.date || "") + '" data-p="' + t.period + '" data-c="' + t.cell + '" title="带到今日续计">→今</button>')
          : ('<button type="button" class="rcs-btn" data-rcs="toggle" data-p="' + t.period + '" data-c="' + t.cell + '" title="' + (paused ? "恢复" : "暂停") + '">' + (paused ? "恢复" : "暂停") + "</button>"
            + '<button type="button" class="rcs-btn" data-rcs="next" data-p="' + t.period + '" data-c="' + t.cell + '" title="下一钟/新开钟">下一钟</button>'
            + '<button type="button" class="rcs-btn rcs-end" data-rcs="stop" data-p="' + t.period + '" data-c="' + t.cell + '" title="结束·命名">结束</button>'))
        + "</div>";
    };`;

const NEW_CHIP = `    const chip = (t, stale) => {
      const paused = !!t.pausedAt;
      const active = !stale && !paused;
      const tk = findTimerKey(t) || "";
      return '<div class="rcs-chip' + (paused ? " paused" : "") + (stale ? " stale" : "") + (active ? " active-run" : "") + '"'
        + ' data-p="' + t.period + '" data-c="' + t.cell + '" data-key="' + escapeHtml(tk) + '"'
        + (stale ? ' data-date="' + escapeHtml(t.date || "") + '"' : "") + ">"
        + "<span>" + (stale ? "📅" : (paused ? "⏸" : "⏱")) + "</span>"
        + "<span>" + escapeHtml(trunc(t.taskText || "未命名", 10)) + "</span>"
        + '<span class="rcs-clock">' + _fmtTimerClock(t) + "</span>"
        + (stale
          ? ('<button type="button" class="rcs-btn" data-rcs="bring" data-date="' + escapeHtml(t.date || "") + '" data-p="' + t.period + '" data-c="' + t.cell + '" data-key="' + escapeHtml(tk) + '" title="带到今日续计">→今</button>')
          : ('<button type="button" class="rcs-btn" data-rcs="toggle" data-p="' + t.period + '" data-c="' + t.cell + '" data-key="' + escapeHtml(tk) + '" title="' + (paused ? "恢复" : "暂停") + '">' + (paused ? "恢复" : "暂停") + "</button>"
            + '<button type="button" class="rcs-btn" data-rcs="next" data-p="' + t.period + '" data-c="' + t.cell + '" data-key="' + escapeHtml(tk) + '" title="同格新事项计时">新事项</button>'
            + '<button type="button" class="rcs-btn rcs-end" data-rcs="stop" data-p="' + t.period + '" data-c="' + t.cell + '" data-key="' + escapeHtml(tk) + '" title="结束·命名">结束</button>'))
        + "</div>";
    };`;

must(app.includes(OLD_CHIP), "chip template not found");
app = app.replace(OLD_CHIP, NEW_CHIP);

// Strip click handlers — key aware
app = app.replace(
  `        if (act === "toggle") {
          const t = getRunningTimer(p, c);
          if (!t) return;
          if (t.pausedAt) startCellTimer(p, c);
          else pauseCellTimer(p, c);
          if (state.realm === "record") renderRecord();
          else renderMandala();
        } else if (act === "next") {
          startNextOrNewClock(p, c);
          if (state.realm === "record") renderRecord();
          else renderMandala();
        } else if (act === "stop") {
          e.preventDefault();
          stopCellTimer(p, c, { quick: !!e.shiftKey });
        } else if (act === "bring") {`,
  `        if (act === "toggle") {
          const tk = btn.dataset.key || "";
          const t = tk ? getTimerByKey(tk) : getRunningTimer(p, c);
          if (!t) return;
          if (t.pausedAt) startCellTimer(p, c, t.taskText);
          else pauseCellTimer(p, c, tk || findTimerKey(t));
          if (state.realm === "record") renderRecord();
          else renderMandala();
        } else if (act === "next") {
          startFreshNewClock(null, p, c);
          if (state.realm === "record") renderRecord();
          else renderMandala();
        } else if (act === "stop") {
          e.preventDefault();
          stopCellTimer(p, c, { quick: !!e.shiftKey, key: btn.dataset.key || null });
        } else if (act === "bring") {`
);

// stopAllTodayTimers — use findTimerKey
app = app.replace(
  `    list.forEach((t) => {
      const key = timerKeyOf(t.date, t.period, t.cell);
      const duration = timerElapsedOf(t);
      delete runningTimers[key];`,
  `    list.forEach((t) => {
      const key = findTimerKey(t);
      const duration = timerElapsedOf(t);
      if (key) delete runningTimers[key];`
);

// Hint text in index
html = html.replace(
  `⏱ 正计时：<b>⏱启动</b> → <b>暂停</b> → 暂停后点琥珀 <b>新开钟</b> 切事项 · 条内可 <b>恢复/下一钟/结束</b>`,
  `⏱ 正计时：<b>⏱启动</b> → <b>暂停</b> → 琥珀 <b>新事项</b> = 同格独立开钟（不跳时辰）· 条内 <b>恢复/新事项/结束</b>`
);
html = html.replace(
  `title="多时钟：任意时刻最多一口钟在跑；暂停后出现「新开钟」可切事项；■ 结束会弹命名并写入本格"`,
  `title="多时钟：任意时刻最多一口在跑；暂停后「新事项」在同一时辰格内独立计时；■ 结束命名写入本格"`
);

// Mind map hint
html = html.replace(
  `<div class="mm-hint" id="mmHint">安卓：点选 · 长按拖/松手编辑 · 估时·微移 · 主轴滑改序</div>`,
  `<div class="mm-hint" id="mmHint">💡 横屏效果更佳 · 点选 · 长按拖/编辑 · 估时·微移</div>`
);
html = html.replace(
  `<small class="mm-task-sub" id="mmTaskSub">点选 · 长按拖/编辑 · 估时/微移 · 底栏调整</small>`,
  `<small class="mm-task-sub" id="mmTaskSub">横屏更佳 · 点选 · 长按拖/编辑 · 估时/微移</small>`
);

// Reorder mm toolbar: primary zoom/fit/close first for landscape
const OLD_MM_TB = `        <div class="mm-toolbar">
          <button type="button" class="tool-btn mm-tb" id="mmUndo" title="撤销 (Ctrl+Z)">↩</button>
          <button type="button" class="tool-btn mm-tb" id="mmRedo" title="重做 (Ctrl+Y)">↪</button>
          <span class="mm-sep"></span>
          <button type="button" class="tool-btn mm-tb" id="mmLayout" title="切换布局方向（左右 ↔ 上下）">⇄ 布局</button>
          <button type="button" class="tool-btn mm-tb" id="mmOutlineToggle" title="显示/隐藏文本大纲">☰ 大纲</button>
          <button type="button" class="tool-btn mm-tb" id="mmLibraryBtn" title="打开导图库（新建/打开/重命名/删除/导出多张导图）">📚 导图库</button>
          <span class="mm-sep"></span>
          <input type="search" id="mmSearch" class="mm-search" placeholder="🔍 搜索节点…" autocomplete="off" />
          <span class="mm-sep"></span>
          <button type="button" class="tool-btn mm-tb" id="mmZoomOut" title="缩小 (−)">−</button>
          <span class="mm-zoom-label" id="mmZoomLabel">100%</span>
          <button type="button" class="tool-btn mm-tb" id="mmZoomIn" title="放大 (+)">＋</button>
          <button type="button" class="tool-btn mm-tb" id="mmFit" title="适应画布 (0)">⛶</button>
          <button type="button" class="tool-btn mm-tb" id="mmResetLayout" title="清除全部手动摆放偏移，恢复自动布局">⟳</button>
          <span class="mm-sep"></span>`;

const NEW_MM_TB = `        <div class="mm-toolbar">
          <div class="mm-tb-primary">
            <button type="button" class="tool-btn mm-tb" id="mmZoomOut" title="缩小 (−)">−</button>
            <span class="mm-zoom-label" id="mmZoomLabel">100%</span>
            <button type="button" class="tool-btn mm-tb" id="mmZoomIn" title="放大 (+)">＋</button>
            <button type="button" class="tool-btn mm-tb" id="mmFit" title="适应画布 (0)">⛶</button>
            <button type="button" class="tool-btn mm-tb" id="mmUndo" title="撤销 (Ctrl+Z)">↩</button>
            <button type="button" class="tool-btn mm-tb" id="mmRedo" title="重做 (Ctrl+Y)">↪</button>
            <button type="button" class="icon-btn mm-tb-close" id="mmClose" aria-label="关闭">✕</button>
          </div>
          <div class="mm-tb-secondary">
          <button type="button" class="tool-btn mm-tb" id="mmLayout" title="切换布局方向（左右 ↔ 上下）">⇄ 布局</button>
          <button type="button" class="tool-btn mm-tb" id="mmOutlineToggle" title="显示/隐藏文本大纲">☰ 大纲</button>
          <button type="button" class="tool-btn mm-tb" id="mmLibraryBtn" title="打开导图库（新建/打开/重命名/删除/导出多张导图）">📚 导图库</button>
          <span class="mm-sep"></span>
          <input type="search" id="mmSearch" class="mm-search" placeholder="🔍 搜索节点…" autocomplete="off" />
          <span class="mm-sep"></span>
          <button type="button" class="tool-btn mm-tb" id="mmResetLayout" title="清除全部手动摆放偏移，恢复自动布局">⟳</button>
          <span class="mm-sep"></span>`;

must(html.includes(OLD_MM_TB), "mm toolbar head not found");
html = html.replace(OLD_MM_TB, NEW_MM_TB);

// Close duplicate mmClose at end of toolbar — remove trailing close, close secondary div
must(html.includes('<button type="button" class="icon-btn" id="mmClose" aria-label="关闭">✕</button>'), "trailing mmClose not found");
html = html.replace(
  `          <button type="button" class="tool-btn mm-tb mm-save" id="mmSave" title="保存思维导图到导图库（可随时回看编辑）">💾 保存</button>
          <button type="button" class="icon-btn" id="mmClose" aria-label="关闭">✕</button>
        </div>`,
  `          <button type="button" class="tool-btn mm-tb mm-save" id="mmSave" title="保存思维导图到导图库（可随时回看编辑）">💾 保存</button>
          </div>
        </div>`
);

// ---------- Edge-rail period pan while dragging ----------
const EDGE_PAN_HELPER = `
  // Round25：边轨拖拽时左右贴边切时辰 + 淡紫闪
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
  }

`;

must(app.includes("  function moveSdGhost(st, x, y) {"), "moveSdGhost not found");
app = app.replace("  function moveSdGhost(st, x, y) {", EDGE_PAN_HELPER + "  function moveSdGhost(st, x, y) {");

app = app.replace(
  `        if (sdTouch.ghost) {
          e.preventDefault();
          moveSdGhost(sdTouch, t.clientX, t.clientY);
          const cell = sdHighlightCellAt(t.clientX, t.clientY);
          let hint = "拖到时辰格子松手";
          if (cell) {
            const p = parseInt(cell.dataset.period, 10);
            const c = parseInt(cell.dataset.cell, 10);
            hint = "安排到 " + (!isNaN(p) && PERIOD_NAMES[p] || "") + (!isNaN(c) ? " 第" + (c + 1) + "格" : "");
          }
          showDragHint(t.clientX, t.clientY, hint);
          return;
        }`,
  `        if (sdTouch.ghost) {
          e.preventDefault();
          moveSdGhost(sdTouch, t.clientX, t.clientY);
          trySdPeriodPanAt(t.clientX, t.clientY);
          const cell = sdHighlightCellAt(t.clientX, t.clientY);
          let hint = "拖到格子 · 贴边可切时辰";
          if (cell) {
            const p = parseInt(cell.dataset.period, 10);
            const c = parseInt(cell.dataset.cell, 10);
            hint = "安排到 " + (!isNaN(p) && PERIOD_NAMES[p] || "") + (!isNaN(c) ? " 第" + (c + 1) + "格" : "");
          }
          showDragHint(t.clientX, t.clientY, hint);
          return;
        }`
);

// Also pan on HTML5 dragover for desktop edge-rail
if (!app.includes("window._sdDragPeriodPanBound")) {
  const BIND_MARK = "  function attachDragHandlers(cellEl, period, cell) {";
  must(app.includes(BIND_MARK), "attachDragHandlers not found");
  app = app.replace(
    BIND_MARK,
    `  if (!window._sdDragPeriodPanBound) {
    window._sdDragPeriodPanBound = true;
    document.addEventListener("dragover", (e) => {
      if (!draggingSideSource && !draggingTaskSource) return;
      trySdPeriodPanAt(e.clientX, e.clientY);
    }, true);
  }
  function attachDragHandlers(cellEl, period, cell) {`
  );
}

// ---------- Record task touch drag (like plan) ----------
const RECORD_TOUCH_DRAG = `
          // Round25：记录页任务条触屏长按拖到其他格（对齐计划页）
          (function bindRecordTaskTouch(itemEl, p0, c0, i0) {
            let ts = null;
            itemEl.addEventListener("touchstart", (ev) => {
              if (ev.target.closest(".task-checkbox, .task-note-edit-btn, button, input")) return;
              if (!ev.touches || ev.touches.length !== 1) return;
              const t = ev.touches[0];
              ts = { startX: t.clientX, startY: t.clientY, holdTimer: null, ghost: null };
              ts.holdTimer = setTimeout(() => {
                if (!ts) return;
                const ghost = document.createElement("div");
                ghost.className = "kb-drag-ghost sd-drag-ghost";
                ghost.textContent = (taskText(getCellTasks(p0, c0)[i0]) || "任务").slice(0, 28);
                document.body.appendChild(ghost);
                ts.ghost = ghost;
                draggingTaskSource = { period: p0, cell: c0, idx: i0 };
                itemEl.classList.add("dragging-item");
                document.body.classList.add("kb-touch-dragging");
                haptic(22);
                ghost.style.left = t.clientX + "px";
                ghost.style.top = t.clientY + "px";
                sdHighlightCellAt(t.clientX, t.clientY);
                showDragHint(t.clientX, t.clientY, "拖到格子 · 贴边切时辰");
              }, 280);
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
`;

const RECORD_DRAG_MARK = `          // v94 拖拽：记录页任务条 → 其他格子（桌面 HTML5 DnD；触屏用长按拖拽同款）
          item.addEventListener("dragstart", (e) => {
            e.stopPropagation();
            draggingTaskSource = { period, cell, idx };
            item.classList.add("dragging-item");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(idx));
          });
          item.addEventListener("dragend", () => {
            item.classList.remove("dragging-item");
            draggingTaskSource = null;
          });
          planList.appendChild(item);`;

must(app.includes(RECORD_DRAG_MARK), "record drag mark not found");
must(!app.includes("Round25：记录页任务条触屏长按拖到其他格"), "record touch already patched?");
app = app.replace(
  RECORD_DRAG_MARK,
  `          // v94 拖拽：记录页任务条 → 其他格子（桌面 HTML5 DnD；触屏用长按拖拽同款）
          item.addEventListener("dragstart", (e) => {
            e.stopPropagation();
            draggingTaskSource = { period, cell, idx };
            item.classList.add("dragging-item");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(idx));
          });
          item.addEventListener("dragend", () => {
            item.classList.remove("dragging-item");
            draggingTaskSource = null;
            document.querySelectorAll(".cell.drag-over").forEach((c) => c.classList.remove("drag-over"));
          });
` + RECORD_TOUCH_DRAG + `
          planList.appendChild(item);`
);

// Mind map: hide legend by default chrome, smoother
app = app.replace(
  `    _renderLegend() {
      if (!this.els.legend) return;
      const dimDots = KNOWLEDGE_DIMENSIONS.map((d) => \`<span class="mm-leg-item"><span class="mm-leg-dot" style="background:\${d.color}"></span>\${d.code}</span>\`).join("");
      this.els.legend.innerHTML = \`<span class="mm-leg-title">图例</span>\${dimDots}<span class="mm-leg-item"><span class="mm-leg-dot" style="background:rgba(124,92,255,0.5);border:1px solid #7c5cff;"></span>主线</span><span class="mm-leg-item"><span class="mm-leg-dot" style="background:#ffa94d"></span>支线</span><span class="mm-leg-item"><span class="mm-leg-dot" style="background:#4dc3ff"></span>子步</span><span class="mm-leg-item" title="青绿描边 + ↩ 角标 = 该节点已安排到今日时间格子，点 ↩ 直达"><span class="mm-leg-dot" style="background:rgba(45,212,191,.25);border:1.5px solid #2dd4bf;"></span>↩ 已上格子</span>\`;
    }`,
  `    _renderLegend() {
      if (!this.els.legend) return;
      // Round25：默认隐藏边界/图例装饰，减少画板杂讯
      this.els.legend.hidden = true;
      this.els.legend.innerHTML = "";
      this.els.legend.classList.add("mm-chrome-hidden");
    }`
);

// Soften pan/zoom transitions in _applyView if present
if (app.includes("_applyView() {\n      if (!this.els.g) return;")) {
  // leave as-is if different format
}
app = app.replace(
  `    _applyView() {
      if (this.els.g) this.els.g.setAttribute("transform", \`translate(\${this.view.x},\${this.view.y}) scale(\${this.view.scale})\`);
      if (this.els.zoomLabel) this.els.zoomLabel.textContent = Math.round(this.view.scale * 100) + "%";
    }`,
  `    _applyView() {
      if (this.els.g) {
        this.els.g.style.transition = this._panning || this._dragging ? "none" : "transform .12s ease-out";
        this.els.g.setAttribute("transform", \`translate(\${this.view.x},\${this.view.y}) scale(\${this.view.scale})\`);
      }
      if (this.els.zoomLabel) this.els.zoomLabel.textContent = Math.round(this.view.scale * 100) + "%";
    }`
);

// ---------- CSS Round25 ----------
const CSS_R25 = `

/* ============================================================
 * Round25：同格新事项 · 边轨切时辰淡紫 · 导图横屏工具栏 · 弱化边界
 * ============================================================ */
.cell-timer-btn.cell-timer-now-label {
  background: linear-gradient(135deg, #a78bfa, #c4b5fd) !important;
  color: #1a1030 !important;
  box-shadow: 0 2px 10px rgba(167,139,250,.45);
}
.rcs-ops .rcs-newclock {
  background: linear-gradient(135deg, #a78bfa, #c4b5fd) !important;
  color: #1a1030 !important;
  box-shadow: 0 3px 12px rgba(167,139,250,.4);
}
.rcs-sum b.newc { color: #c4b5fd; }

body.sd-period-pan-left .mandala-grid,
body.sd-period-pan-right .mandala-grid,
body.sd-period-pan-left .record-grid,
body.sd-period-pan-right .record-grid {
  box-shadow: inset 0 0 0 2px rgba(167,139,250,.35), 0 0 24px rgba(124,92,255,.18);
  transition: box-shadow .28s ease;
}
body.sd-period-pan-left .period-tabs,
body.sd-period-pan-right .period-tabs,
.period-tabs.period-pan-glow {
  background: linear-gradient(90deg, rgba(124,92,255,.12), rgba(167,139,250,.08), transparent);
}
body.sd-period-pan-left::after,
body.sd-period-pan-right::after {
  content: "";
  position: fixed;
  top: 0; bottom: 0;
  width: 36px;
  pointer-events: none;
  z-index: 90;
  opacity: .55;
  transition: opacity .3s ease;
}
body.sd-period-pan-left::after {
  left: 0;
  background: linear-gradient(90deg, rgba(124,92,255,.28), transparent);
}
body.sd-period-pan-right::after {
  right: 0;
  background: linear-gradient(270deg, rgba(124,92,255,.28), transparent);
}

.realm-record .cell-content-item.task-bar {
  border-radius: 10px;
  background: rgba(124,92,255,.08);
  border: 1px solid rgba(124,92,255,.18);
  margin-bottom: 4px;
}
.realm-record .cell-content-item.task-bar.dragging-item {
  opacity: .4;
  transform: scale(.96);
}

.mm-toolbar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.mm-tb-primary {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  flex: 0 0 auto;
}
.mm-tb-secondary {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  min-width: 0;
}
.mm-tb-secondary::-webkit-scrollbar { display: none; }
.mm-tb-close {
  margin-left: auto;
  min-width: 40px;
  min-height: 40px;
  border-radius: 10px;
  background: rgba(248,113,113,.15);
  color: #fca5a5;
  border: 1px solid rgba(248,113,113,.35);
}
.mm-legend.mm-chrome-hidden,
.mm-chrome-hidden { display: none !important; }
.mm-canvas {
  background: var(--bg-primary, #0f0f1e) !important; /* Round25：去掉点阵边界装饰 */
}
.mm-hint {
  display: block !important;
  font-size: 11px;
  color: #c4b5fd;
  background: rgba(30,20,50,.72) !important;
  border: 1px solid rgba(167,139,250,.25);
}
@media (orientation: landscape) and (max-height: 520px) {
  .mm-head { flex-direction: row !important; align-items: center; gap: 8px; padding: 4px 8px !important; }
  .mm-title { flex: 0 1 auto; max-width: 28vw; }
  .mm-toolbar { flex-direction: row !important; flex-wrap: nowrap !important; overflow: visible !important; align-items: center; }
  .mm-tb-primary { flex: 0 0 auto; order: 2; }
  .mm-tb-secondary {
    flex: 1 1 auto;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    order: 1;
    max-width: 55vw;
  }
  .mm-tb-primary .mm-tb, .mm-tb-primary .mm-tb-close {
    min-height: 40px; min-width: 40px;
  }
  .mm-hint { bottom: 8px !important; left: 8px; }
  .mm-stats { opacity: .55; max-width: 40vw; }
}
@media (orientation: portrait), (max-width: 720px) {
  .mm-tb-primary { width: 100%; }
  .mm-tb-secondary { width: 100%; flex-wrap: wrap !important; }
  .mm-hint { display: block !important; bottom: max(64px, env(safe-area-inset-bottom, 0px) + 48px) !important; }
}
`;

if (!css.includes("Round25：同格新事项")) {
  css += CSS_R25;
}

// Write files
fs.writeFileSync(appPath, app.replace(/\n/g, "\r\n"));
fs.writeFileSync(cssPath, css.replace(/\n/g, "\r\n"));
fs.writeFileSync(htmlPath, html.replace(/\n/g, "\r\n"));
fs.writeFileSync(swPath, sw.replace(/\n/g, "\r\n"));
fs.writeFileSync(gradlePath, gradle.replace(/\n/g, "\r\n"));

const round25 = `# Round 25（v2.7.24·123）· 同格新事项 + 条拖 + 边轨切时辰 + 导图横屏

日期：2026-09-05  
范围：\`d:\\\\Downloads\\\\mandala-shichen\`  
承接：Round24（v122）→ **用户纠偏：新开钟 ≠ 下一时辰，而是同格内切事项**

---

## 机制纠偏（核心）

| 错误理解 | 正确理解 |
|----------|----------|
| 「下一钟 / 新开钟」= 跳到**下一个时辰格子** | 同一时辰格子内：事项 A 暂停后，开事项 B 的**独立计时** |
| 一格一口钟 | **一格可多口事项钟**（\`date_p_c\` / \`date_p_c#matterId\`） |

流程：做 A → ⏸ 暂停（累计保留）→ **新事项计时** 开 B（同格）→ 任意时刻最多一口在跑 → ■ 结束命名写入本格。

---

## 本轮完成

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 同格新事项 | ✅ | \`forceNew\` + matterId；\`startFreshNewClock\` 不再 \`nextPeriodCell\` |
| 文案 | ✅ | 新事项 / 新事项计时；通知栏暂停态「恢复\\|新事项\\|结束」 |
| 记录任务条 | ✅ | 条状强化 + HTML5/触屏长按拖格 |
| 边轨切时辰 | ✅ | 拖拽贴边左右切 \`activePeriod\` + 淡紫光效 |
| 导图 UX | ✅ | 「横屏效果更佳」；主工具（缩放/关）置前；藏图例边界点阵 |
| 版本 | ✅ | APP_BUILD / SW / versionCode → **123** |

---

## 版本信号

| 信号 | 值 |
|------|-----|
| \`APP_BUILD\` | **123** |
| SW | \`mandala-v123\` |
| 缓存戳 | \`?v=20260905r25\` |
| Android | \`versionCode 123\` / \`versionName 2.7.24.123\` |

## 改动文件

- \`www/app.js\` — 同格多事项钟、条拖、边轨切时辰、导图 chrome
- \`www/styles.css\` — 淡紫动效、工具栏主次行、弱化画板装饰
- \`www/index.html\` / \`www/sw.js\` / \`android/app/build.gradle\`
- \`ROUND25.md\` / \`scripts/round25-patch.js\`
`;

fs.writeFileSync(path.join(ROOT, "ROUND25.md"), round25.replace(/\n/g, "\r\n"));

console.log("Round25 patch OK → v123");

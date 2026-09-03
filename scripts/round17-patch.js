/**
 * Round17 patch — apply against www + android version signals.
 * Run: node scripts/round17-patch.js
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function read(p) {
  return fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
}
function write(p, s) {
  fs.writeFileSync(path.join(root, p), s.replace(/\r\n/g, "\n"), "utf8");
  console.log("wrote", p);
}
function mustReplace(src, from, to, label) {
  if (src.includes(to.slice(0, Math.min(48, to.length))) && label && src.includes(label)) {
    // soft: already largely patched
  }
  if (!src.includes(from)) {
    if (label && src.includes(label)) {
      console.log("skip (already):", label);
      return src;
    }
    throw new Error("NOT FOUND: " + (label || from.slice(0, 80)));
  }
  return src.replace(from, to);
}
function insertAfter(src, anchor, insert, label) {
  if (label && src.includes(label)) {
    console.log("skip insert:", label);
    return src;
  }
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("anchor missing: " + (label || anchor.slice(0, 60)));
  return src.slice(0, i + anchor.length) + insert + src.slice(i + anchor.length);
}

let app = read("www/app.js");

// Ensure changelog / build (may already be 115)
if (!app.includes("APP_BUILD = 115")) {
  app = mustReplace(app, "const APP_BUILD = 114;", "const APP_BUILD = 115;", "APP_BUILD 115");
}
if (!app.includes("2.7.24·115")) {
  app = mustReplace(
    app,
    `{ v: "2.7.24·114", date: "2026-09-03", items: [
      "Round16：去掉应用内快捷球，改通知栏正计时（暂停/恢复/结束）",
      "Round16：开钟时申请通知权限；全停取消通知；无插件时网页静默",
    ]},`,
    `{ v: "2.7.24·115", date: "2026-09-03", items: [
      "Round17：边轨/多钟/溢出徽章/导图改名同步格子 · 通知栏节流+切钟+记任务",
      "Round17：安卓开钟钮触控加固 · 主题一致性 · 通知/边轨/导图轻量边界助手",
    ]},
    { v: "2.7.24·114", date: "2026-09-03", items: [
      "Round16：去掉应用内快捷球，改通知栏正计时（暂停/恢复/结束）",
      "Round16：开钟时申请通知权限；全停取消通知；无插件时网页静默",
    ]},`,
    "changelog 115"
  );
}

// ---- Replace Round16 notif block with Round17 ----
const OLD_NOTIF = `  // Round16：通知栏正计时（取代应用内快捷球）——进行中通知 + 暂停/恢复/结束
  const TIMER_NOTIF_ID = 16114;
  const TIMER_ACTION_TYPE = "mandala_timer_actions";
  const TIMER_NOTIF_CHANNEL = "mandala_timer";
  let _timerNotifReady = false;
  let _timerNotifListenerBound = false;
  let _timerNotifSyncing = false;

  async function ensureTimerNotifReady() {
    const LN = getLocalNotifications();
    if (!LN) return null;
    try {
      if (typeof LN.requestPermissions === "function") {
        await LN.requestPermissions();
      }
      if (typeof LN.createChannel === "function") {
        try {
          await LN.createChannel({
            id: TIMER_NOTIF_CHANNEL,
            name: "正计时",
            description: "进行中的格子正计时与快捷操作",
            importance: 3,
            visibility: 1,
            sound: "",
            vibration: false,
          });
        } catch (e) { /* 通道已存在或平台不支持 */ }
      }
      if (typeof LN.registerActionTypes === "function") {
        await LN.registerActionTypes({
          types: [{
            id: TIMER_ACTION_TYPE,
            actions: [
              { id: "pause", title: "暂停", foreground: true },
              { id: "resume", title: "恢复", foreground: true },
              { id: "stop", title: "结束", foreground: true },
            ],
          }],
        });
      }
      if (!_timerNotifListenerBound && typeof LN.addListener === "function") {
        _timerNotifListenerBound = true;
        LN.addListener("localNotificationActionPerformed", (ev) => {
          try {
            const actionId = ev && ev.actionId;
            if (!actionId || actionId === "tap") return;
            const extra = (ev.notification && ev.notification.extra) || {};
            const p = parseInt(extra.period, 10);
            const c = parseInt(extra.cell, 10);
            if (Number.isNaN(p) || Number.isNaN(c)) return;
            if (actionId === "pause") {
              const t = getRunningTimer(p, c);
              if (t && !t.pausedAt) pauseCellTimer(p, c);
            } else if (actionId === "resume") {
              const t = getRunningTimer(p, c);
              if (t && t.pausedAt) startCellTimer(p, c, t.taskText);
            } else if (actionId === "stop") {
              stopCellTimer(p, c);
            }
            if (state.realm === "record") renderRecord();
            else renderMandala();
            syncTimerNotification();
          } catch (e) { /* 静默 */ }
        });
      }
      _timerNotifReady = true;
      return LN;
    } catch (e) {
      return null;
    }
  }

  async function cancelTimerNotification() {
    const LN = getLocalNotifications();
    if (!LN) return;
    try {
      if (typeof LN.cancel === "function") {
        await LN.cancel({ notifications: [{ id: TIMER_NOTIF_ID }] });
      }
    } catch (e) { /* 静默 */ }
    try {
      if (typeof LN.removeDeliveredNotifications === "function") {
        await LN.removeDeliveredNotifications({ notifications: [{ id: TIMER_NOTIF_ID }] });
      }
    } catch (e) { /* 静默 */ }
  }

  async function syncTimerNotification(opts) {
    opts = opts || {};
    const LN = getLocalNotifications();
    if (!LN) return; // 网页/桌面/未装插件：优雅 no-op
    if (_timerNotifSyncing) return;
    _timerNotifSyncing = true;
    try {
      const list = Object.values(runningTimers || {}).filter((t) => t && t.date === state.currentDate);
      if (!list.length) {
        await cancelTimerNotification();
        return;
      }
      if (opts.requestPerm || !_timerNotifReady) {
        const ok = await ensureTimerNotifReady();
        if (!ok) return;
      }
      const run = list.find((t) => !t.pausedAt) || list[0];
      const elMs = timerElapsedOf(run);
      const mm = Math.floor(elMs / 60000), ss = Math.floor((elMs % 60000) / 1000);
      const timeStr = String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
      const cellLabel = (PERIOD_NAMES[run.period] || ("第" + (run.period + 1) + "辰")) + " 第" + (run.cell + 1) + "格";
      const taskLab = trunc(String(run.taskText || "任务"), 16);
      const status = run.pausedAt ? "已暂停" : "计时中";
      const title = (run.pausedAt ? "⏸ " : "⏱ ") + timeStr + " · " + taskLab;
      const body = status + " · " + cellLabel + (list.length > 1 ? "（共" + list.length + "口钟）" : "");
      await LN.schedule({
        notifications: [{
          id: TIMER_NOTIF_ID,
          title: title,
          body: body,
          channelId: TIMER_NOTIF_CHANNEL,
          ongoing: true,
          autoCancel: false,
          silent: true,
          sound: undefined,
          actionTypeId: TIMER_ACTION_TYPE,
          extra: { period: run.period, cell: run.cell },
          schedule: { at: new Date(Date.now() + 80) },
        }],
      });
    } catch (e) { /* 静默 */ }
    finally { _timerNotifSyncing = false; }
  }`;

const NEW_NOTIF = `  // Round16/17：通知栏正计时 —— 暂停/恢复/结束/切钟/记任务（文案·节流见 MandalaR17）
  const TIMER_NOTIF_ID = 16115;
  const TIMER_ACTION_TYPE = "mandala_timer_actions";
  const TIMER_NOTIF_CHANNEL = "mandala_timer";
  let _timerNotifReady = false;
  let _timerNotifListenerBound = false;
  let _timerNotifSyncing = false;
  let _timerNotifQueued = false;
  let _timerNotifLastTitle = "";
  let _timerNotifLastAt = 0;
  let _timerNotifForce = false;
  let _notifTickN = 0;

  function _r17() { return (typeof window !== "undefined" && window.MandalaR17) || null; }

  function cycleNextRunningTimer(curP, curC) {
    const list = Object.values(runningTimers || {}).filter((t) => t && t.date === state.currentDate);
    if (list.length < 2) { toast("仅一口钟，无需切换", "info", 1600); return false; }
    let idx = list.findIndex((t) => t.period === curP && t.cell === curC);
    if (idx < 0) idx = 0;
    const next = list[(idx + 1) % list.length];
    if (!next) return false;
    startCellTimer(next.period, next.cell, next.taskText);
    toast("⏭ 已切至 · " + trunc(String(next.taskText || "任务"), 14), "success", 1800);
    return true;
  }

  function notifQuickAddTask(period, cell) {
    try {
      setRealm("record");
      jumpToCell(period, cell);
      const name = prompt("记入本格任务名（写入计划任务）", "");
      if (name === null) return;
      const text = String(name).trim();
      if (!text) { toast("已取消", "info"); return; }
      const tasks = getCellTasks(period, cell).slice();
      tasks.push(normalizeTask({ text: text }));
      setCellTasks(period, cell, tasks);
      const t = getRunningTimer(period, cell);
      if (t && (!t.taskText || t.taskText === "未命名任务")) {
        t.taskText = text;
        save(RUNNING_TIMERS_KEY, runningTimers);
      }
      renderRecord();
      renderMandala();
      _timerNotifForce = true;
      syncTimerNotification();
      toast("✓ 已记入第" + (cell + 1) + "格 · " + trunc(text, 14), "success");
      haptic(18);
    } catch (e) { toast("记任务失败", "warn"); }
  }

  function syncMindmapRenameToCells(oldText, newText) {
    const R = _r17();
    let n = 0;
    if (R && R.syncTextAcrossCells) {
      n = R.syncTextAcrossCells({
        oldText: oldText, newText: newText,
        getCellTasks: getCellTasks, setCellTasks: setCellTasks,
        periodCount: PERIOD_COUNT, cellsPerPeriod: CELLS_PER_PERIOD,
      });
    } else {
      const ot = String(oldText || "").trim();
      const nt = String(newText || "").trim();
      if (!ot || !nt || ot === nt) return 0;
      for (let p = 0; p < PERIOD_COUNT; p++) {
        for (let c = 0; c < CELLS_PER_PERIOD; c++) {
          const arr = getCellTasks(p, c);
          if (!arr || !arr.length) continue;
          let changed = false;
          const next = arr.map((t) => {
            if (!t || t.sticky) return t;
            if (String(t.text || "").trim() !== ot) return t;
            changed = true; n++;
            return Object.assign({}, t, { text: nt });
          });
          if (changed) setCellTasks(p, c, next);
        }
      }
    }
    if (n > 0) {
      try { renderMandala(); } catch (e) {}
      try { if (state.realm === "record") renderRecord(); } catch (e) {}
      toast("导图改名已同步 " + n + " 条格子任务", "success", 2200);
    }
    return n;
  }

  async function ensureTimerNotifReady() {
    const LN = getLocalNotifications();
    if (!LN) return null;
    try {
      if (typeof LN.requestPermissions === "function") {
        await LN.requestPermissions();
      }
      if (typeof LN.createChannel === "function") {
        try {
          await LN.createChannel({
            id: TIMER_NOTIF_CHANNEL,
            name: "正计时",
            description: "进行中的格子正计时与快捷操作",
            importance: 3,
            visibility: 1,
            sound: "",
            vibration: false,
          });
        } catch (e) { /* 通道已存在或平台不支持 */ }
      }
      if (typeof LN.registerActionTypes === "function") {
        await LN.registerActionTypes({
          types: [{
            id: TIMER_ACTION_TYPE,
            actions: [
              { id: "pause", title: "暂停", foreground: true },
              { id: "resume", title: "恢复", foreground: true },
              { id: "next", title: "切钟", foreground: true },
              { id: "add", title: "记任务", foreground: true },
              { id: "stop", title: "结束", foreground: true },
            ],
          }],
        });
      }
      if (!_timerNotifListenerBound && typeof LN.addListener === "function") {
        _timerNotifListenerBound = true;
        LN.addListener("localNotificationActionPerformed", (ev) => {
          try {
            const actionId = ev && ev.actionId;
            const extra = (ev.notification && ev.notification.extra) || {};
            const p = parseInt(extra.period, 10);
            const c = parseInt(extra.cell, 10);
            if (Number.isNaN(p) || Number.isNaN(c)) return;
            if (!actionId || actionId === "tap") {
              setRealm("record");
              jumpToCell(p, c);
              return;
            }
            if (actionId === "pause") {
              const t = getRunningTimer(p, c);
              if (t && !t.pausedAt) pauseCellTimer(p, c);
            } else if (actionId === "resume") {
              const t = getRunningTimer(p, c);
              if (t && t.pausedAt) startCellTimer(p, c, t.taskText);
            } else if (actionId === "next") {
              cycleNextRunningTimer(p, c);
            } else if (actionId === "add") {
              notifQuickAddTask(p, c);
            } else if (actionId === "stop") {
              stopCellTimer(p, c);
            }
            if (state.realm === "record") renderRecord();
            else renderMandala();
            _timerNotifForce = true;
            syncTimerNotification();
          } catch (e) { /* 静默 */ }
        });
      }
      _timerNotifReady = true;
      return LN;
    } catch (e) {
      return null;
    }
  }

  async function cancelTimerNotification() {
    const LN = getLocalNotifications();
    if (!LN) return;
    _timerNotifLastTitle = "";
    try {
      if (typeof LN.cancel === "function") {
        await LN.cancel({ notifications: [{ id: TIMER_NOTIF_ID }] });
      }
    } catch (e) { /* 静默 */ }
    try {
      if (typeof LN.removeDeliveredNotifications === "function") {
        await LN.removeDeliveredNotifications({ notifications: [{ id: TIMER_NOTIF_ID }] });
      }
    } catch (e) { /* 静默 */ }
  }

  async function syncTimerNotification(opts) {
    opts = opts || {};
    const LN = getLocalNotifications();
    if (!LN) return; // 网页/桌面/未装插件：优雅 no-op
    if (_timerNotifSyncing) { _timerNotifQueued = true; return; }
    _timerNotifSyncing = true;
    try {
      const list = Object.values(runningTimers || {}).filter((t) => t && t.date === state.currentDate);
      if (!list.length) {
        await cancelTimerNotification();
        return;
      }
      if (opts.requestPerm || !_timerNotifReady) {
        const ok = await ensureTimerNotifReady();
        if (!ok) return;
      }
      const R = _r17();
      const run = (R && R.pickTimerForNotif) ? R.pickTimerForNotif(list) : (list.find((t) => !t.pausedAt) || list[0]);
      const elMs = timerElapsedOf(run);
      const timeStr = (R && R.formatNotifClock) ? R.formatNotifClock(elMs) : (() => {
        const mm = Math.floor(elMs / 60000), ss = Math.floor((elMs % 60000) / 1000);
        return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
      })();
      const cellLabel = (PERIOD_NAMES[run.period] || ("第" + (run.period + 1) + "辰")) + " 第" + (run.cell + 1) + "格";
      const taskLab = trunc(String(run.taskText || "任务"), 16);
      const status = run.pausedAt ? "已暂停" : "计时中";
      const title = (run.pausedAt ? "⏸ " : "⏱ ") + timeStr + " · " + taskLab;
      const body = status + " · " + cellLabel + (list.length > 1 ? " · 共" + list.length + "口钟 · 可切钟" : "");
      const force = _timerNotifForce || !!opts.force || !!opts.requestPerm;
      _timerNotifForce = false;
      if (!force) {
        if (R && R.shouldSkipNotifSchedule && R.shouldSkipNotifSchedule(_timerNotifLastTitle, title, _timerNotifLastAt, 4500)) return;
        if (!R && _timerNotifLastTitle === title && (Date.now() - _timerNotifLastAt) < 4500) return;
      }
      await LN.schedule({
        notifications: [{
          id: TIMER_NOTIF_ID,
          title: title,
          body: body,
          channelId: TIMER_NOTIF_CHANNEL,
          ongoing: true,
          autoCancel: false,
          silent: true,
          sound: undefined,
          actionTypeId: TIMER_ACTION_TYPE,
          extra: { period: run.period, cell: run.cell, deep: "record-cell" },
          schedule: { at: new Date(Date.now() + 80) },
        }],
      });
      _timerNotifLastTitle = title;
      _timerNotifLastAt = Date.now();
    } catch (e) { /* 静默 */ }
    finally {
      _timerNotifSyncing = false;
      if (_timerNotifQueued) {
        _timerNotifQueued = false;
        syncTimerNotification(opts);
      }
    }
  }`;

if (app.includes("TIMER_NOTIF_ID = 16115") && app.includes("cycleNextRunningTimer")) {
  console.log("skip notif block (already r17)");
} else {
  app = mustReplace(app, OLD_NOTIF, NEW_NOTIF, "notif r17");
}

// ---- Cell timer touch reliability ----
const OLD_ATTACH = `      nowBtn.title = "当前格开钟 · 青绿快捷钮（多钟：开新钟会自动暂停其他在跑的钟）";
      nowBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const hint = taskTextHint || "未命名任务";
        startCellTimer(period, cell, hint);
        if (state.realm === "record") renderRecord();
        else renderMandala();
      });
      wrap.appendChild(nowBtn);
    }
    const timerBtn = document.createElement("button");
    timerBtn.className = "cell-timer-btn" + (_rt ? (_rtPaused ? " paused" : " running") : "") + ((!_rt && isNowCell) ? " secondary" : "");
    timerBtn.dataset.timerBtn = "1";
    timerBtn.type = "button";
    timerBtn.title = !_rt
      ? "⏱ 启动正计时（来了别的事 → 开新钟会自动暂停这口；■ 结束时命名并写入记录）"
      : _rtPaused
        ? "▶ 恢复计时（累计不丢；恢复时其他在跑的钟自动暂停）"
        : "⏸ 暂停计时（保留累计；点 ■ 结束 → 命名 → 写入）";
    timerBtn.textContent = !_rt ? "⏱" : (_rtPaused ? "▶" : "⏸");
    timerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const hint = taskTextHint || (_rt && _rt.taskText) || "未命名任务";
      toggleCellTimer(period, cell, hint);
      if (state.realm === "record") renderRecord();
      else renderMandala();
    });
    wrap.appendChild(timerBtn);
    if (_rt) {
      const endBtn = document.createElement("button");
      endBtn.className = "cell-timer-end";
      endBtn.type = "button";
      endBtn.title = "■ 结束计时 → 命名并写入（Shift+点 = 已命名秒归档）";
      endBtn.textContent = "■";
      endBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        stopCellTimer(period, cell, { quick: !!e.shiftKey });
      });
      wrap.appendChild(endBtn);
    }`;

const NEW_ATTACH = `      nowBtn.title = "当前格开钟 · 青绿快捷钮（多钟：开新钟会自动暂停其他在跑的钟）";
      nowBtn.style.touchAction = "manipulation";
      const fireNow = (e) => {
        if (nowBtn._fired && Date.now() - nowBtn._fired < 380) return;
        nowBtn._fired = Date.now();
        e.stopPropagation();
        e.preventDefault();
        const hint = taskTextHint || "未命名任务";
        startCellTimer(period, cell, hint);
        if (state.realm === "record") renderRecord();
        else renderMandala();
      };
      nowBtn.addEventListener("pointerup", fireNow);
      nowBtn.addEventListener("click", fireNow);
      wrap.appendChild(nowBtn);
    }
    const timerBtn = document.createElement("button");
    timerBtn.className = "cell-timer-btn" + (_rt ? (_rtPaused ? " paused" : " running") : "") + ((!_rt && isNowCell) ? " secondary" : "");
    timerBtn.dataset.timerBtn = "1";
    timerBtn.type = "button";
    timerBtn.style.touchAction = "manipulation";
    timerBtn.title = !_rt
      ? "⏱ 启动正计时（来了别的事 → 开新钟会自动暂停这口；■ 结束时命名并写入记录）"
      : _rtPaused
        ? "▶ 恢复计时（累计不丢；恢复时其他在跑的钟自动暂停）"
        : "⏸ 暂停计时（保留累计；点 ■ 结束 → 命名 → 写入）";
    timerBtn.textContent = !_rt ? "⏱" : (_rtPaused ? "▶" : "⏸");
    const fireToggle = (e) => {
      if (timerBtn._fired && Date.now() - timerBtn._fired < 380) return;
      timerBtn._fired = Date.now();
      e.stopPropagation();
      e.preventDefault();
      const hint = taskTextHint || (_rt && _rt.taskText) || "未命名任务";
      toggleCellTimer(period, cell, hint);
      if (state.realm === "record") renderRecord();
      else renderMandala();
    };
    timerBtn.addEventListener("pointerup", fireToggle);
    timerBtn.addEventListener("click", fireToggle);
    wrap.appendChild(timerBtn);
    if (_rt) {
      const endBtn = document.createElement("button");
      endBtn.className = "cell-timer-end";
      endBtn.type = "button";
      endBtn.style.touchAction = "manipulation";
      endBtn.title = "■ 结束计时 → 命名并写入（Shift+点 = 已命名秒归档）";
      endBtn.textContent = "■";
      const fireEnd = (e) => {
        if (endBtn._fired && Date.now() - endBtn._fired < 380) return;
        endBtn._fired = Date.now();
        e.stopPropagation();
        e.preventDefault();
        stopCellTimer(period, cell, { quick: !!e.shiftKey });
      };
      endBtn.addEventListener("pointerup", fireEnd);
      endBtn.addEventListener("click", fireEnd);
      wrap.appendChild(endBtn);
    }`;

if (app.includes("fireNow = (e)") || app.includes("const fireNow")) {
  console.log("skip cell timer touch (already)");
} else {
  app = mustReplace(app, OLD_ATTACH, NEW_ATTACH, "cell timer touch");
}

// ---- Timer tick: throttle notif to ~5s ----
const OLD_TICK = `    _timerTick = setInterval(() => {
      if (!_tryLightTimerRefresh()) renderRunningTimerBar();
      try { syncTimerNotification(); } catch (e) {}
    }, 1000);`;
const NEW_TICK = `    _notifTickN = 0;
    _timerTick = setInterval(() => {
      if (!_tryLightTimerRefresh()) renderRunningTimerBar();
      // Round17：走秒每秒刷新 UI；通知栏约每 5 秒或强制时再写（降 Android 重刷）
      _notifTickN++;
      if (_notifTickN % 5 === 0) {
        try { syncTimerNotification(); } catch (e) {}
      }
    }, 1000);`;
if (app.includes("_notifTickN % 5")) {
  console.log("skip tick throttle");
} else {
  app = mustReplace(app, OLD_TICK, NEW_TICK, "tick throttle");
}

// Force sync on start/pause already calls syncTimerNotification with requestPerm — also set force on pause/stop
app = app.replace(
  /try \{ syncTimerNotification\(\{ requestPerm: true \}\); \} catch \(e\) \{\}/g,
  "try { _timerNotifForce = true; syncTimerNotification({ requestPerm: true }); } catch (e) {}"
);

// ---- Overflow badge in renderRecord ----
const OLD_CHIP = `          parts.forEach((p) => {
            const chip = document.createElement("div");
            chip.className = "record-actual-chip";
            chip.textContent = p;
            strip.appendChild(chip);
          });`;
const NEW_CHIP = `          parts.forEach((p) => {
            const chip = document.createElement("div");
            const ov = /（续·溢出）|续·溢出/.test(p) || !!record.overflowInherit;
            chip.className = "record-actual-chip" + (ov && /续·溢出/.test(p) ? " record-overflow-chip" : (ov && parts.length === 1 ? " record-overflow-chip" : ""));
            chip.textContent = p;
            if (ov && /续·溢出/.test(p)) {
              const badge = document.createElement("span");
              badge.className = "record-overflow-badge";
              badge.textContent = "溢出";
              chip.appendChild(document.createTextNode(" "));
              chip.appendChild(badge);
            }
            strip.appendChild(chip);
          });
          if (record.overflowInherit) cellEl.classList.add("has-overflow");`;
if (app.includes("record-overflow-chip")) {
  console.log("skip overflow chip");
} else {
  app = mustReplace(app, OLD_CHIP, NEW_CHIP, "overflow chip");
}

// ---- Mindmap rename sync in editNode ----
const OLD_EDIT = `        if (save && cur) {
          const node = this.findNode(cur);
          if (node) {
            const v = input.value.trim();
            if (v && v !== node.text) { this.pushHistory(); node.text = v; this.render(); this._showNodePanel(cur); }
          }
        }`;
const NEW_EDIT = `        if (save && cur) {
          const node = this.findNode(cur);
          if (node) {
            const v = input.value.trim();
            if (v && v !== node.text) {
              const oldT = node.text;
              this.pushHistory();
              node.text = v;
              try { syncMindmapRenameToCells(oldT, v); } catch (e) {}
              this.render();
              this._showNodePanel(cur);
            }
          }
        }`;
if (app.includes("syncMindmapRenameToCells(oldT")) {
  console.log("skip editNode sync");
} else {
  app = mustReplace(app, OLD_EDIT, NEW_EDIT, "editNode sync");
}

// Panel text commit also syncs
const OLD_PANEL = `        if (ev.target.classList.contains("mm-pf-text")) n.text = ev.target.value;`;
const NEW_PANEL = `        if (ev.target.classList.contains("mm-pf-text")) {
          const oldT = n.text;
          n.text = ev.target.value;
          try { if (String(oldT || "").trim() !== String(n.text || "").trim()) syncMindmapRenameToCells(oldT, n.text); } catch (e) {}
        }`;
if (app.includes("mm-pf-text")) {
  if (app.includes("syncMindmapRenameToCells(oldT, n.text)")) {
    console.log("skip panel sync");
  } else if (app.includes(OLD_PANEL)) {
    app = mustReplace(app, OLD_PANEL, NEW_PANEL, "panel text sync");
  } else {
    console.log("WARN: panel text line not exact");
  }
}

// ---- jumpToTask: prefer MandalaR17 loc map ----
const OLD_JUMP = `    jumpToTask(nodeId) {
      const n = this.findNode(nodeId);
      if (!n) return;
      const text = (n.text || "").trim();
      let found = null;
      outer:
      for (let p = 0; p < PERIOD_COUNT; p++) {
        for (let c = 0; c < CELLS_PER_PERIOD; c++) {
          const arr = getCellTasks(p, c);
          if (arr.some((t) => (t.text || "").trim() === text)) { found = { p, c }; break outer; }
        }
      }`;
const NEW_JUMP = `    jumpToTask(nodeId) {
      const n = this.findNode(nodeId);
      if (!n) return;
      const text = (n.text || "").trim();
      let found = null;
      const R = (typeof window !== "undefined" && window.MandalaR17) || null;
      if (R && R.findCellByText) {
        found = R.findCellByText({ text: text, getCellTasks: getCellTasks, periodCount: PERIOD_COUNT, cellsPerPeriod: CELLS_PER_PERIOD });
      }
      if (!found) {
        outer:
        for (let p = 0; p < PERIOD_COUNT; p++) {
          for (let c = 0; c < CELLS_PER_PERIOD; c++) {
            const arr = getCellTasks(p, c);
            if (arr.some((t) => (t.text || "").trim() === text)) { found = { p, c }; break outer; }
          }
        }
      }`;
if (app.includes("R.findCellByText")) {
  console.log("skip jumpToTask");
} else {
  app = mustReplace(app, OLD_JUMP, NEW_JUMP, "jumpToTask r17");
}

// ---- Side rail Chinese polish ----
app = app.replace(
  'el.sdTaskLabel.textContent = "任务 · 贴当前 / 贴下一空格";',
  'el.sdTaskLabel.textContent = "任务 · 贴入当前格 / 下一空格";'
);
app = app.replace(
  'el.sdTaskLabel.textContent = "任务（" + rows.length + "）· 当前贴 → " + stickHint;',
  'el.sdTaskLabel.textContent = "任务（" + rows.length + "）· 贴入目标 → " + stickHint;'
);
app = app.replace(
  "title=\"拖到格子：空=移入 · 有任务=交换\">'",
  "title=\"拖到格子：空格移入 · 有任务则交换（Shift=追加）\">'"
);

write("www/app.js", app);

// ---- styles ----
let css = read("www/styles.css");
const CSS_MARK = "/* Round17：溢出徽章 · 开钟触控 · 亮色边轨/浮动条 */";
if (!css.includes(CSS_MARK)) {
  css += `

${CSS_MARK}
.record-actual-chip.record-overflow-chip {
  background: rgba(251, 191, 36, 0.14);
  border-color: rgba(251, 191, 36, 0.45);
  color: var(--text-primary, #f0f0ff);
}
.record-overflow-badge {
  display: inline-block; margin-left: 4px; padding: 0 6px; border-radius: 999px;
  font-size: 9.5px; font-weight: 800; letter-spacing: .3px; line-height: 1.45;
  background: rgba(251, 191, 36, 0.92); color: #1a1200; vertical-align: middle;
}
.cell.has-overflow { box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.35); }
@media (pointer: coarse), (max-width: 720px) {
  .cell-timer-controls .cell-timer-btn,
  .cell-timer-controls .cell-timer-end {
    width: 32px; height: 32px; font-size: 13px; opacity: 1;
  }
  .cell-timer-btn.cell-timer-now {
    width: 34px; height: 34px; font-size: 14px;
  }
  .cell-timer-controls { gap: 5px; top: 3px; right: 3px; z-index: 8; }
}
[data-theme="light"] .side-drawer.edge-rail {
  background: rgba(255,255,255,.94) !important;
  border-color: rgba(124,92,255,.28);
  box-shadow: 0 10px 28px rgba(30,20,60,.12), 0 0 0 1px rgba(0,0,0,.06);
}
[data-theme="light"] .side-drawer.edge-rail .sd-task {
  background: rgba(248,247,255,.96);
  border-color: rgba(124,92,255,.18);
}
[data-theme="light"] .side-drawer.edge-rail .sd-stick-btn.sd-swap-btn {
  color: #0f766e; border-color: rgba(20,184,166,.45); background: rgba(45,212,191,.16);
}
[data-theme="light"] .mm-float-bar {
  background: rgba(255,255,255,.96) !important;
  border-color: rgba(124,92,255,.35) !important;
  color: #1a1a2e;
}
[data-theme="light"] .mm-float-bar button {
  color: #1a1a2e !important;
  background: rgba(124,92,255,.08);
}
[data-theme="light"] .record-overflow-badge { background: #f59e0b; color: #fff; }
`;
  write("www/styles.css", css);
} else {
  console.log("skip css r17");
}

// ---- index.html cache + helper script ----
let html = read("www/index.html");
html = html.replace(/styles\.css\?v=[^"]+/g, "styles.css?v=20260903r17");
html = html.replace(/app\.js\?v=[^"]+/g, "app.js?v=20260903r17");
if (!html.includes("lib/r17-helpers.js")) {
  html = html.replace(
    '<script src="lib/mermaid.min.js"></script>',
    '<script src="lib/mermaid.min.js"></script>\n  <script src="lib/r17-helpers.js?v=20260903r17"></script>'
  );
}
write("www/index.html", html);

let sw = read("www/sw.js");
sw = sw.replace(/mandala-v114/g, "mandala-v115");
sw = sw.replace(/v114 Round16[^\n]*/, "v115 Round17：精细化 + 通知栏节流/切钟/记任务 + 导图改名同步");
write("www/sw.js", sw);

let gradle = read("android/app/build.gradle");
gradle = gradle.replace(/versionCode 114/, "versionCode 115");
gradle = gradle.replace(/versionName "2\.7\.24\.114"/, 'versionName "2.7.24.115"');
write("android/app/build.gradle", gradle);

console.log("Round17 patch done");

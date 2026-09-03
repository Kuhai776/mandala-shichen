/**
 * Round19 polish — multi-clock pickNext · notif copy · overflow/edge UX · mindmap timer sync · bump 117
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const write = (p, s) => {
  fs.writeFileSync(path.join(root, p), s.replace(/\r\n/g, "\n"), "utf8");
  console.log("wrote", p);
};

let helpers = read("www/lib/r17-helpers.js");

if (!helpers.includes("pickNextTimer")) {
  helpers = helpers.replace(
    "  function computeEdgeRailLayout(gr, viewportH, safeBottom) {",
    `  /** 多钟：按列表顺序取下一口（相对当前 period/cell） */
  function pickNextTimer(list, curP, curC) {
    if (!list || !list.length) return null;
    if (list.length === 1) return list[0];
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t && t.period === curP && t.cell === curC) { idx = i; break; }
    }
    if (idx < 0) idx = 0;
    return list[(idx + 1) % list.length] || null;
  }

  function computeEdgeRailLayout(gr, viewportH, safeBottom) {`
  );
  // tighten edge layout for narrow + rail width
  helpers = helpers.replace(
    `  function computeEdgeRailLayout(gr, viewportH, safeBottom) {
    if (!gr || !gr.width || gr.bottom < 40) return null;
    var top = Math.max(8, Math.round(gr.top));
    var bottomSafe = 72 + (safeBottom || 0);
    var maxHeight = Math.max(180, Math.min(Math.round(gr.height + 28), (viewportH || 800) - top - bottomSafe));
    var left = Math.max(4, Math.min(14, Math.round(gr.left) - 2));
    return { top: top, maxHeight: maxHeight, left: left };
  }`,
    `  function computeEdgeRailLayout(gr, viewportH, safeBottom, opts) {
    if (!gr || !gr.width || gr.bottom < 40) return null;
    opts = opts || {};
    var top = Math.max(8, Math.round(gr.top));
    var bottomSafe = 72 + (safeBottom || 0);
    var maxHeight = Math.max(180, Math.min(Math.round(gr.height + 28), (viewportH || 800) - top - bottomSafe));
    var railW = opts.railWidth || 56;
    var left = Math.max(2, Math.min(12, Math.round(gr.left) - Math.min(8, Math.floor(railW * 0.12))));
    if ((opts.viewportW || 0) > 0 && left + railW > opts.viewportW - 4) {
      left = Math.max(2, (opts.viewportW || 360) - railW - 4);
    }
    return { top: top, maxHeight: maxHeight, left: left };
  }`
  );
  // enhance buildNotifCopy with next-clock
  helpers = helpers.replace(
    `    var multi = (list && list.length > 1) ? (" · 共" + list.length + "口钟") : "";
    return {
      title: (run.pausedAt ? "⏸ " : "⏱ ") + timeStr + " · " + taskLab,
      body: status + " · " + cellLabel + multi,
      timeStr: timeStr,
      cellLabel: cellLabel,
      status: status,
    };
  }`,
    `    var body = status + " · " + cellLabel;
    if (list && list.length > 1) {
      var nxt = pickNextTimer(list, run.period, run.cell);
      var nxtLab = trunc(String((nxt && nxt.taskText) || "任务"), 10);
      var curIdx = -1;
      for (var i = 0; i < list.length; i++) {
        if (list[i] === run || (list[i] && list[i].period === run.period && list[i].cell === run.cell)) {
          curIdx = i; break;
        }
      }
      var ord = (curIdx < 0 ? 1 : curIdx + 1) + "/" + list.length;
      body += " · " + ord + " · 下一口「" + nxtLab + "」";
    }
    return {
      title: (run.pausedAt ? "⏸ " : "⏱ ") + timeStr + " · " + taskLab,
      body: body,
      timeStr: timeStr,
      cellLabel: cellLabel,
      status: status,
    };
  }`
  );
  // shouldSkipNotif: also consider body
  helpers = helpers.replace(
    `  function shouldSkipNotifSchedule(prevTitle, nextTitle, lastAt, gapMs) {
    gapMs = gapMs == null ? 4500 : gapMs;
    if (!nextTitle) return true;
    if (prevTitle !== nextTitle) return false;
    return (Date.now() - (lastAt || 0)) < gapMs;
  }`,
    `  function shouldSkipNotifSchedule(prevTitle, nextTitle, lastAt, gapMs, prevBody, nextBody) {
    gapMs = gapMs == null ? 4500 : gapMs;
    if (!nextTitle) return true;
    if (prevTitle !== nextTitle) return false;
    if (prevBody != null && nextBody != null && prevBody !== nextBody) return false;
    return (Date.now() - (lastAt || 0)) < gapMs;
  }`
  );
  helpers = helpers.replace(
    "    computeEdgeRailLayout: computeEdgeRailLayout,",
    "    computeEdgeRailLayout: computeEdgeRailLayout,\n    pickNextTimer: pickNextTimer,"
  );
  // header comment
  helpers = helpers.replace(
    " * Round17 · 轻量边界助手（不依赖 app 闭包）",
    " * Round17–19 · 轻量边界助手（不依赖 app 闭包）"
  );
  write("www/lib/r17-helpers.js", helpers);
} else {
  console.log("skip helpers (already has pickNextTimer)");
}

let app = read("www/app.js");

if (!app.includes("APP_BUILD = 117")) {
  app = app.replace("const APP_BUILD = 116;", "const APP_BUILD = 117;");
  if (!app.includes("2.7.24·117")) {
    app = app.replace(
      `{ v: "2.7.24·116", date: "2026-09-03", items: [
      "Round18：通知栏展示下一口钟名 · 边轨定位纯函数外置 · 切钟文案收紧",
    ]},`,
      `{ v: "2.7.24·117", date: "2026-09-03", items: [
      "Round19：多钟切钟顺序一致 · 通知栏口序+下一口 · 溢出/边轨/导图改名同步在跑钟",
    ]},
    { v: "2.7.24·116", date: "2026-09-03", items: [
      "Round18：通知栏展示下一口钟名 · 边轨定位纯函数外置 · 切钟文案收紧",
    ]},`
    );
  }
}

// cycleNextRunningTimer → use pickNextTimer
const oldCycle = `  function cycleNextRunningTimer(curP, curC) {
    const list = Object.values(runningTimers || {}).filter((t) => t && t.date === state.currentDate);
    if (list.length < 2) { toast("仅一口钟，无需切换", "info", 1600); return false; }
    let idx = list.findIndex((t) => t.period === curP && t.cell === curC);
    if (idx < 0) idx = 0;
    const next = list[(idx + 1) % list.length];
    if (!next) return false;
    startCellTimer(next.period, next.cell, next.taskText);
    toast("⏭ 已切至 · " + trunc(String(next.taskText || "任务"), 14), "success", 1800);
    return true;
  }`;
const newCycle = `  function cycleNextRunningTimer(curP, curC) {
    const list = Object.values(runningTimers || {}).filter((t) => t && t.date === state.currentDate);
    if (list.length < 2) { toast("仅一口钟，无需切换", "info", 1600); return false; }
    const R = _r17();
    const next = (R && R.pickNextTimer) ? R.pickNextTimer(list, curP, curC) : (() => {
      let idx = list.findIndex((t) => t.period === curP && t.cell === curC);
      if (idx < 0) idx = 0;
      return list[(idx + 1) % list.length];
    })();
    if (!next) return false;
    startCellTimer(next.period, next.cell, next.taskText);
    const ord = list.findIndex((t) => t === next || (t.period === next.period && t.cell === next.cell));
    toast("⏭ 已切至 " + ((ord < 0 ? 1 : ord + 1) + "/" + list.length) + " · " + trunc(String(next.taskText || "任务"), 14), "success", 1800);
    return true;
  }`;
if (app.includes("R.pickNextTimer")) console.log("skip cycle pickNext");
else if (app.includes(oldCycle)) app = app.replace(oldCycle, newCycle);
else console.log("WARN: cycleNextRunningTimer pattern missing");

// syncTimerNotification body → use buildNotifCopy when possible
const oldNotifBody = `      const R = _r17();
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
      let body = status + " · " + cellLabel;
      if (list.length > 1) {
        const idx = list.findIndex((t) => t === run || (t.period === run.period && t.cell === run.cell));
        const nxt = list[((idx < 0 ? 0 : idx) + 1) % list.length];
        const nxtLab = trunc(String((nxt && nxt.taskText) || "任务"), 10);
        body += " · 共" + list.length + "口 · 下一口「" + nxtLab + "」";
      }
      const force = _timerNotifForce || !!opts.force || !!opts.requestPerm;
      _timerNotifForce = false;
      if (!force) {
        if (R && R.shouldSkipNotifSchedule && R.shouldSkipNotifSchedule(_timerNotifLastTitle, title, _timerNotifLastAt, 4500)) return;
        if (!R && _timerNotifLastTitle === title && (Date.now() - _timerNotifLastAt) < 4500) return;
      }`;

const newNotifBody = `      const R = _r17();
      const run = (R && R.pickTimerForNotif) ? R.pickTimerForNotif(list) : (list.find((t) => !t.pausedAt) || list[0]);
      let title, body;
      if (R && R.buildNotifCopy) {
        const copy = R.buildNotifCopy(run, list, PERIOD_NAMES, trunc);
        title = copy.title;
        body = copy.body;
      } else {
        const elMs = timerElapsedOf(run);
        const timeStr = (R && R.formatNotifClock) ? R.formatNotifClock(elMs) : (() => {
          const mm = Math.floor(elMs / 60000), ss = Math.floor((elMs % 60000) / 1000);
          return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
        })();
        const cellLabel = (PERIOD_NAMES[run.period] || ("第" + (run.period + 1) + "辰")) + " 第" + (run.cell + 1) + "格";
        const taskLab = trunc(String(run.taskText || "任务"), 16);
        const status = run.pausedAt ? "已暂停" : "计时中";
        title = (run.pausedAt ? "⏸ " : "⏱ ") + timeStr + " · " + taskLab;
        body = status + " · " + cellLabel;
        if (list.length > 1) {
          const nxt = (R && R.pickNextTimer) ? R.pickNextTimer(list, run.period, run.cell) : list[0];
          body += " · 下一口「" + trunc(String((nxt && nxt.taskText) || "任务"), 10) + "」";
        }
      }
      const force = _timerNotifForce || !!opts.force || !!opts.requestPerm;
      _timerNotifForce = false;
      if (!force) {
        if (R && R.shouldSkipNotifSchedule && R.shouldSkipNotifSchedule(_timerNotifLastTitle, title, _timerNotifLastAt, 4500, _timerNotifLastBody, body)) return;
        if (!R && _timerNotifLastTitle === title && (Date.now() - _timerNotifLastAt) < 4500) return;
      }`;

if (app.includes("buildNotifCopy(run, list")) console.log("skip notif buildNotifCopy wire");
else if (app.includes(oldNotifBody)) app = app.replace(oldNotifBody, newNotifBody);
else console.log("WARN: notif body pattern missing");

// track last body
if (!app.includes("_timerNotifLastBody")) {
  app = app.replace(
    '  let _timerNotifLastTitle = "";\n  let _timerNotifLastAt = 0;',
    '  let _timerNotifLastTitle = "";\n  let _timerNotifLastBody = "";\n  let _timerNotifLastAt = 0;'
  );
  app = app.replace(
    "    _timerNotifLastTitle = \"\";\n    try {\n      if (typeof LN.cancel === \"function\") {",
    "    _timerNotifLastTitle = \"\";\n    _timerNotifLastBody = \"\";\n    try {\n      if (typeof LN.cancel === \"function\") {"
  );
  app = app.replace(
    "      _timerNotifLastTitle = title;\n      _timerNotifLastAt = Date.now();",
    "      _timerNotifLastTitle = title;\n      _timerNotifLastBody = body;\n      _timerNotifLastAt = Date.now();"
  );
}

// pauseCellTimer: use pickNextTimer for "开始下一钟"
const oldPauseNext = `    const others = Object.values(runningTimers).filter((x) => x && x.date === state.currentDate && x.pausedAt && !(x.period === period && x.cell === cell));
    const next = others[0];
    if (next) {
      toast("⏸ 已暂停 · " + trunc(String(t.taskText || ""), 12) + "（累计 " + formatSpentPrecise(timerElapsedOf(t)) + "）", "info", 5200, {
        label: "开始下一钟",
        onClick: () => {
          startCellTimer(next.period, next.cell, next.taskText);
          if (state.realm === "record") renderRecord();
        },
      });
    } else {
      toast("⏸ 已暂停 · " + trunc(String(t.taskText || ""), 14) + "（累计 " + formatSpentPrecise(timerElapsedOf(t)) + "）", "info", 2200);
    }`;
const newPauseNext = `    const allToday = Object.values(runningTimers).filter((x) => x && x.date === state.currentDate);
    const Rpause = _r17();
    let next = (Rpause && Rpause.pickNextTimer) ? Rpause.pickNextTimer(allToday, period, cell) : null;
    if (next && next.period === period && next.cell === cell) next = null;
    if (next && !next.pausedAt) {
      /* 下一口若仍在跑则跳过，找暂停的 */
      const paused = allToday.filter((x) => x.pausedAt && !(x.period === period && x.cell === cell));
      next = paused[0] || null;
    } else if (!next) {
      next = allToday.find((x) => x.pausedAt && !(x.period === period && x.cell === cell)) || null;
    }
    if (next) {
      toast("⏸ 已暂停 · " + trunc(String(t.taskText || ""), 12) + "（累计 " + formatSpentPrecise(timerElapsedOf(t)) + "）", "info", 5200, {
        label: "开始下一钟",
        onClick: () => {
          startCellTimer(next.period, next.cell, next.taskText);
          if (state.realm === "record") renderRecord();
        },
      });
    } else {
      toast("⏸ 已暂停 · " + trunc(String(t.taskText || ""), 14) + "（累计 " + formatSpentPrecise(timerElapsedOf(t)) + "）", "info", 2200);
    }`;
if (app.includes("Rpause && Rpause.pickNextTimer")) console.log("skip pause next");
else if (app.includes(oldPauseNext)) app = app.replace(oldPauseNext, newPauseNext);
else console.log("WARN: pause next pattern missing");

// record clock strip next button
const oldRcsNext = `        } else if (act === "next") {
          const t = getRunningTimer(p, c);
          if (t && !t.pausedAt) pauseCellTimer(p, c);
          const others = Object.values(runningTimers).filter((x) => x && x.date === state.currentDate && x.pausedAt && !(x.period === p && x.cell === c));
          if (others[0]) startCellTimer(others[0].period, others[0].cell, others[0].taskText);
          else toast("没有可切换的下一钟", "info", 1800);
          if (state.realm === "record") renderRecord();
          else renderMandala();`;
const newRcsNext = `        } else if (act === "next") {
          const t = getRunningTimer(p, c);
          if (t && !t.pausedAt) pauseCellTimer(p, c);
          const list = Object.values(runningTimers).filter((x) => x && x.date === state.currentDate);
          const Rn = _r17();
          let nxt = (Rn && Rn.pickNextTimer) ? Rn.pickNextTimer(list, p, c) : null;
          if (nxt && nxt.period === p && nxt.cell === c) nxt = null;
          if (!nxt) nxt = list.find((x) => x.pausedAt && !(x.period === p && x.cell === c)) || null;
          if (nxt) startCellTimer(nxt.period, nxt.cell, nxt.taskText);
          else toast("没有可切换的下一钟", "info", 1800);
          if (state.realm === "record") renderRecord();
          else renderMandala();`;
if (app.includes("Rn && Rn.pickNextTimer")) console.log("skip rcs next");
else if (app.includes(oldRcsNext)) app = app.replace(oldRcsNext, newRcsNext);
else console.log("WARN: rcs next pattern missing");

// overflow: use isOverflowLabel + cell corner mark
const oldOv = `          parts.forEach((p) => {
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
const newOv = `          parts.forEach((p) => {
            const chip = document.createElement("div");
            const R17 = _r17();
            const isOvLine = (R17 && R17.isOverflowLabel) ? R17.isOverflowLabel(p) : /（续·溢出）|续·溢出/.test(p);
            const ov = isOvLine || !!record.overflowInherit;
            chip.className = "record-actual-chip" + (isOvLine || (ov && parts.length === 1) ? " record-overflow-chip" : "");
            chip.textContent = p;
            if (isOvLine) {
              const badge = document.createElement("span");
              badge.className = "record-overflow-badge";
              badge.textContent = "溢出";
              chip.appendChild(document.createTextNode(" "));
              chip.appendChild(badge);
            }
            strip.appendChild(chip);
          });
          if (record.overflowInherit) {
            cellEl.classList.add("has-overflow");
            if (!cellEl.querySelector(".cell-overflow-mark")) {
              const mk = document.createElement("span");
              mk.className = "cell-overflow-mark";
              mk.textContent = "溢";
              mk.title = "含溢出继承记录";
              cellEl.appendChild(mk);
            }
          }`;
if (app.includes("cell-overflow-mark")) console.log("skip overflow mark");
else if (app.includes(oldOv)) app = app.replace(oldOv, newOv);
else console.log("WARN: overflow pattern missing");

// mindmap rename → also sync running timer taskText
const oldMmSync = `    if (n > 0) {
      try { renderMandala(); } catch (e) {}
      try { if (state.realm === "record") renderRecord(); } catch (e) {}
      toast("导图改名已同步 " + n + " 条格子任务", "success", 2200);
    }
    return n;
  }`;
const newMmSync = `    if (n > 0) {
      // Round19：同步在跑/暂停钟的任务名，避免通知栏仍显示旧文案
      try {
        const ot = String(oldText || "").trim();
        const nt = String(newText || "").trim();
        Object.keys(runningTimers || {}).forEach((k) => {
          const t = runningTimers[k];
          if (t && String(t.taskText || "").trim() === ot) t.taskText = nt;
        });
        save(RUNNING_TIMERS_KEY, runningTimers);
        _timerNotifForce = true;
        syncTimerNotification();
        renderRunningTimerBar();
      } catch (e) {}
      try { renderMandala(); } catch (e) {}
      try { if (state.realm === "record") renderRecord(); } catch (e) {}
      toast("导图改名已同步 " + n + " 条格子任务", "success", 2200);
    }
    return n;
  }`;
if (app.includes("同步在跑/暂停钟的任务名")) console.log("skip mm timer sync");
else if (app.includes(oldMmSync)) app = app.replace(oldMmSync, newMmSync);
else console.log("WARN: mm sync toast pattern missing");

// edge rail: pass viewportW + rail width
const oldPosWire = `    const layout = (R && R.computeEdgeRailLayout)
      ? R.computeEdgeRailLayout(gr, window.innerHeight, parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom")) || 0)
      : null;`;
const newPosWire = `    const layout = (R && R.computeEdgeRailLayout)
      ? R.computeEdgeRailLayout(gr, window.innerHeight, parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom")) || 0, {
          viewportW: window.innerWidth,
          railWidth: drawer.classList.contains("expanded") ? 200 : 56,
        })
      : null;`;
if (app.includes("railWidth: drawer.classList")) console.log("skip edge rail opts");
else if (app.includes(oldPosWire)) app = app.replace(oldPosWire, newPosWire);
else console.log("WARN: edge rail layout wire missing");

// stick hint: show cursor when set
const oldStickHint = `    const stickNow = resolveStickTargetCell({ next: false });
    const stickNext = resolveStickTargetCell({ next: true });
    const stickHint = stickNow.label + (stickNow.empty ? "（空）" : "（追加）");
    if (el.sdTaskLabel) {
      el.sdTaskLabel.hidden = false;
      el.sdTaskLabel.textContent = "任务（" + rows.length + "）· 贴入目标 → " + stickHint;
    }`;
const newStickHint = `    const stickNow = resolveStickTargetCell({ next: false });
    const stickNext = resolveStickTargetCell({ next: true });
    const stickHint = stickNow.label + (stickNow.empty ? "（空）" : "（追加）");
    if (el.sdTaskLabel) {
      el.sdTaskLabel.hidden = false;
      const curMark = sdStickCursor ? (" · 游标第" + (sdStickCursor.c + 1) + "格") : "";
      el.sdTaskLabel.textContent = "任务（" + rows.length + "）· 贴入目标 → " + stickHint + curMark;
    }`;
if (app.includes("游标第")) console.log("skip stick cursor hint");
else if (app.includes(oldStickHint)) app = app.replace(oldStickHint, newStickHint);
else console.log("WARN: stick hint pattern missing");

// multi-clock active chip highlight in record strip
const oldChip = `    const chip = (t, stale) => {
      const paused = !!t.pausedAt;
      return '<div class="rcs-chip' + (paused ? " paused" : "") + (stale ? " stale" : "") + '"'
        + ' data-p="' + t.period + '" data-c="' + t.cell + '"'`;
const newChip = `    const chip = (t, stale) => {
      const paused = !!t.pausedAt;
      const active = !stale && !paused;
      return '<div class="rcs-chip' + (paused ? " paused" : "") + (stale ? " stale" : "") + (active ? " active-run" : "") + '"'
        + ' data-p="' + t.period + '" data-c="' + t.cell + '"'`;
if (app.includes('active-run"')) console.log("skip active-run chip");
else if (app.includes(oldChip)) app = app.replace(oldChip, newChip);
else console.log("WARN: rcs chip pattern missing");

write("www/app.js", app);

let css = read("www/styles.css");
if (!css.includes("cell-overflow-mark")) {
  css += `

/* Round19：溢出角标 · 多钟在跑高亮 · 边轨拖入反馈 */
.cell.has-overflow { position: relative; }
.cell-overflow-mark {
  position: absolute; left: 4px; bottom: 4px; z-index: 3;
  font-size: 9px; font-weight: 800; line-height: 1.2;
  padding: 1px 5px; border-radius: 6px;
  background: rgba(251, 191, 36, 0.92); color: #1a1200;
  pointer-events: none; letter-spacing: .2px;
}
[data-theme="light"] .cell-overflow-mark { background: #f59e0b; color: #fff; }
.rcs-chip.active-run {
  box-shadow: 0 0 0 1.5px rgba(45, 212, 191, 0.55), 0 4px 12px rgba(0,0,0,.18);
  border-color: rgba(45, 212, 191, 0.45);
}
.cell.drag-over {
  outline: 2px solid rgba(45, 212, 191, 0.65);
  outline-offset: -2px;
  background: rgba(45, 212, 191, 0.08);
}
.side-drawer.edge-rail .sd-task-label,
#sdTaskLabel {
  font-variant-numeric: tabular-nums;
}
`;
  write("www/styles.css", css);
} else {
  console.log("skip css r19");
}

let html = read("www/index.html");
html = html.replace(/20260903r18/g, "20260903r19").replace(/20260903r17/g, "20260903r19");
write("www/index.html", html);

let sw = read("www/sw.js");
sw = sw.replace(/mandala-v11[67]/g, "mandala-v117");
if (!sw.includes("Round19")) {
  sw = sw.replace(/\/\/ v11[67][^\n]*/, "// v117 Round19：多钟顺序/通知口序 · 溢出角标 · 导图改名同步在跑钟");
}
write("www/sw.js", sw);

let gradle = read("android/app/build.gradle");
gradle = gradle.replace(/versionCode 11[67]/, "versionCode 117");
gradle = gradle.replace(/versionName "2\.7\.24\.11[67]"/, 'versionName "2.7.24.117"');
write("android/app/build.gradle", gradle);

const md = `# Round 19（v2.7.24·117）· 承接 Round17/18 收紧

日期：2026-09-03  
范围：\`d:\\Downloads\\mandala-shichen\`  
承接：Round18（116）通知下一口 + 边轨定位外置 → **多钟/通知/溢出/边轨/导图摩擦再收一轮**

---

## 本轮完成

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 多钟 · 切钟顺序 | ✅ | \`MandalaR17.pickNextTimer\`；通知切钟 / 记录条 ⏭ / 暂停「下一钟」同源 |
| 通知栏 · 口序 | ✅ | body 显示 \`1/3 · 下一口「…」\`；\`buildNotifCopy\` 统一；节流兼看 body |
| 溢出 · 角标 | ✅ | \`isOverflowLabel\`；继承格左下角「溢」标记 |
| 边轨 · 定位/游标 | ✅ | 布局计入轨宽与视口；贴入提示显示 stick 游标格 |
| 导图 · 改名→在跑钟 | ✅ | 同步 \`runningTimers.taskText\` + 强制刷通知 |
| 多钟条 · 在跑高亮 | ✅ | \`.rcs-chip.active-run\` |

## 架构演进（续）

- 仍集中在 \`www/lib/r17-helpers.js\`（Round17–19 共用边界），不拆 \`MindMapEditor\` 巨石。
- 纯逻辑新增：\`pickNextTimer\`、通知 copy 含口序、边轨 \`railWidth/viewportW\`。

## 仍待（后续）

- 导图 \`MindMapEditor\` 拆 render / touch / export
- 边轨触屏拖入状态机完整外置
- 原生悬浮窗 / 前台服务（商店策略成本高）

## 版本信号

| 信号 | 值 |
|------|-----|
| \`APP_BUILD\` | **117** |
| SW | \`mandala-v117\` |
| 缓存戳 | \`?v=20260903r19\` |
| Android | \`versionCode 117\` / \`versionName 2.7.24.117\` |

## 改动文件

- \`www/app.js\` / \`www/lib/r17-helpers.js\` / \`www/styles.css\`
- \`www/index.html\` / \`www/sw.js\` / \`android/app/build.gradle\`
- \`scripts/round19-patch.js\` / \`ROUND19.md\`
`;
write("ROUND19.md", md);

console.log("Round19 patch done");

/**
 * Round17–19 · 轻量边界助手（不依赖 app 闭包）
 * 供 app.js 可选调用；缺失时 app 内仍有兜底。
 * 职责：通知栏文案/节流、导图改名→格子同步、溢出标签识别。
 */
(function (global) {
  "use strict";

  function pickTimerForNotif(list) {
    if (!list || !list.length) return null;
    return list.find(function (t) { return t && !t.pausedAt; }) || list[0];
  }

  function formatNotifClock(ms) {
    var elMs = Math.max(0, Number(ms) || 0);
    var mm = Math.floor(elMs / 60000);
    var ss = Math.floor((elMs % 60000) / 1000);
    return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
  }

  function buildNotifCopy(run, list, periodNames, truncFn) {
    if (!run) return null;
    var trunc = typeof truncFn === "function" ? truncFn : function (s, n) {
      s = String(s || "");
      return s.length > n ? s.slice(0, n) + "…" : s;
    };
    var names = periodNames || {};
    var timeStr = formatNotifClock(
      run.pausedAt
        ? (run.accumMs || 0)
        : ((run.accumMs || 0) + Math.max(0, Date.now() - (run.startTime || Date.now())))
    );
    var cellLabel = (names[run.period] || ("第" + (run.period + 1) + "辰")) + " 第" + (run.cell + 1) + "格";
    var taskLab = trunc(String(run.taskText || "任务"), 16);
    var status = run.pausedAt ? "已暂停" : "计时中";
    var body = status + " · " + cellLabel;
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
  }

  /** 标题未变且距上次调度不足 gapMs → 跳过（降 Android 重刷） */
  function shouldSkipNotifSchedule(prevTitle, nextTitle, lastAt, gapMs, prevBody, nextBody) {
    gapMs = gapMs == null ? 4500 : gapMs;
    if (!nextTitle) return true;
    if (prevTitle !== nextTitle) return false;
    if (prevBody != null && nextBody != null && prevBody !== nextBody) return false;
    return (Date.now() - (lastAt || 0)) < gapMs;
  }

  function isOverflowLabel(text) {
    return /（续·溢出）|续·溢出/.test(String(text || ""));
  }

  /**
   * 导图节点改名 → 同步今日格子任务文案（精确全文匹配）
   * @returns 更新条数
   */
  function syncTextAcrossCells(opts) {
    opts = opts || {};
    var oldText = String(opts.oldText || "").trim();
    var newText = String(opts.newText || "").trim();
    if (!oldText || !newText || oldText === newText) return 0;
    var getCellTasks = opts.getCellTasks;
    var setCellTasks = opts.setCellTasks;
    var periodCount = opts.periodCount | 0;
    var cellsPerPeriod = opts.cellsPerPeriod | 0;
    if (typeof getCellTasks !== "function" || typeof setCellTasks !== "function") return 0;
    var n = 0;
    for (var p = 0; p < periodCount; p++) {
      for (var c = 0; c < cellsPerPeriod; c++) {
        var arr = getCellTasks(p, c);
        if (!arr || !arr.length) continue;
        var changed = false;
        var next = arr.map(function (t) {
          if (!t || t.sticky) return t;
          if (String(t.text || "").trim() !== oldText) return t;
          changed = true;
          n++;
          return Object.assign({}, t, { text: newText });
        });
        if (changed) setCellTasks(p, c, next);
      }
    }
    return n;
  }

  function findCellByText(opts) {
    opts = opts || {};
    var text = String(opts.text || "").trim();
    if (!text) return null;
    var getCellTasks = opts.getCellTasks;
    var periodCount = opts.periodCount | 0;
    var cellsPerPeriod = opts.cellsPerPeriod | 0;
    if (typeof getCellTasks !== "function") return null;
    for (var p = 0; p < periodCount; p++) {
      for (var c = 0; c < cellsPerPeriod; c++) {
        var arr = getCellTasks(p, c) || [];
        if (arr.some(function (t) { return t && !t.sticky && String(t.text || "").trim() === text; })) {
          return { p: p, c: c };
        }
      }
    }
    return null;
  }

  /** 构建 text → {p,c} 索引（导图跳格 / 改名） */
  function buildTaskLocMap(opts) {
    opts = opts || {};
    var map = Object.create(null);
    var getCellTasks = opts.getCellTasks;
    var periodCount = opts.periodCount | 0;
    var cellsPerPeriod = opts.cellsPerPeriod | 0;
    if (typeof getCellTasks !== "function") return map;
    for (var p = 0; p < periodCount; p++) {
      for (var c = 0; c < cellsPerPeriod; c++) {
        (getCellTasks(p, c) || []).forEach(function (t) {
          var s = t && !t.sticky ? String(t.text || "").trim() : "";
          if (s && !map[s]) map[s] = { p: p, c: c };
        });
      }
    }
    return map;
  }

  /** 多钟：按列表顺序取下一口（相对当前 period/cell） */
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

  function computeEdgeRailLayout(gr, viewportH, safeBottom, opts) {
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
  }

  global.MandalaR17 = {
    pickTimerForNotif: pickTimerForNotif,
    formatNotifClock: formatNotifClock,
    buildNotifCopy: buildNotifCopy,
    shouldSkipNotifSchedule: shouldSkipNotifSchedule,
    isOverflowLabel: isOverflowLabel,
    syncTextAcrossCells: syncTextAcrossCells,
    findCellByText: findCellByText,
    buildTaskLocMap: buildTaskLocMap,
    computeEdgeRailLayout: computeEdgeRailLayout,
    pickNextTimer: pickNextTimer,
  };
})(typeof window !== "undefined" ? window : globalThis);

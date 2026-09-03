/**
 * Round14/15 patch — apply once against www/app.js + styles + version files.
 * Run: node scripts/round14-patch.js
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function read(p) {
  // Normalize CRLF so patches match regardless of Windows line endings
  return fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
}
function write(p, s) {
  // Keep LF in repo for consistency
  fs.writeFileSync(path.join(root, p), s.replace(/\r\n/g, "\n"), "utf8");
  console.log("wrote", p);
}
function mustReplace(src, from, to, label) {
  if (!src.includes(from)) {
    // try soft fail if already patched
    if (src.includes(to.slice(0, Math.min(60, to.length))) || (label && src.includes(label))) {
      console.log("skip (already?):", label || from.slice(0, 40));
      return src;
    }
    throw new Error("NOT FOUND: " + (label || from.slice(0, 80)));
  }
  return src.replace(from, to);
}
function insertAfter(src, anchor, insert, label) {
  if (src.includes(label)) { console.log("skip insert:", label); return src; }
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("anchor missing: " + label);
  return src.slice(0, i + anchor.length) + insert + src.slice(i + anchor.length);
}

let app = read("www/app.js");

// ---- Version ----
app = mustReplace(app,
`  const APP_VERSION = "2.7.24";
  const APP_BUILD = 112; // 构建号：与 android versionCode 同步，版本徽标直接显示（用户可自证当前版本）
  const APP_VERSION_DATE = "2026-09-02";
  const APP_CHANGELOG = [
    { v: "2.7.24·112", date: "2026-09-02", items: [
      "Round13：边轨贴齐九宫格（随格子定位）+ 窄屏藏置顶钮",
      "Round13：记录页多钟条支持跨日带到今日/清跨日；走秒轻量刷新不闪烁",
      "Round13：导图底栏「估时」+ 微移（12px）加深手动调整",
    ]},`,
`  const APP_VERSION = "2.7.24";
  const APP_BUILD = 113; // 构建号：与 android versionCode 同步，版本徽标直接显示（用户可自证当前版本）
  const APP_VERSION_DATE = "2026-09-03";
  const APP_CHANGELOG = [
    { v: "2.7.24·113", date: "2026-09-03", items: [
      "Round14/15：边轨主题对齐 + 格子任务交换（拖放/⇄交换钮）",
      "Round14/15：记录页当前格青绿开钟钮 + 超时溢出继承下一格",
      "Round14/15：导图 depends_on→关联线、长按拖节点、浮动条可点；应用内快捷球",
    ]},
    { v: "2.7.24·112", date: "2026-09-02", items: [
      "Round13：边轨贴齐九宫格（随格子定位）+ 窄屏藏置顶钮",
      "Round13：记录页多钟条支持跨日带到今日/清跨日；走秒轻量刷新不闪烁",
      "Round13：导图底栏「估时」+ 微移（12px）加深手动调整",
    ]},`,
"version bump");

// ---- Overflow inherit helper + rewrite doCommit ----
const overflowHelper = `
  // Round14/15：下一格子（跨时辰）
  function nextPeriodCell(period, cell) {
    let p = period | 0, c = (cell | 0) + 1;
    if (c >= CELLS_PER_PERIOD) { c = 0; p += 1; }
    if (p >= PERIOD_COUNT) return null;
    return { p, c };
  }
  // Round14/15：超时溢出写入后续格子（记录对齐时辰格）
  function commitTimerWithOverflow(startP, startC, name, durationMs, meta) {
    meta = meta || {};
    let remainSec = Math.max(1, Math.round(durationMs / 1000));
    const cap = Math.max(60, Math.round(SECONDS_PER_CELL));
    let p = startP, c = startC;
    const chunks = [];
    let guard = 0;
    while (remainSec > 0 && guard++ < 40) {
      const writeSec = Math.min(remainSec, cap);
      const rec = getCellRecord(p, c) || {};
      if (name) {
        const parts = String(rec.actual || "").split(/\\n|; /).map((s) => s.trim()).filter(Boolean);
        const tag = chunks.length ? (name + "（续·溢出）") : name;
        if (!parts.includes(tag) && !parts.includes(name)) parts.push(tag);
        else if (chunks.length && !parts.includes(tag)) parts.push(tag);
        rec.actual = parts.join("\\n");
      } else if (!rec.actual) {
        rec.actual = meta.fallbackText || "未命名任务";
      }
      const prevSec = parseSpentToSec(rec.spent);
      rec.spent = formatSpentPrecise((prevSec + writeSec) * 1000);
      rec.timerMs = (rec.timerMs || 0) + writeSec * 1000;
      if (!chunks.length) {
        rec.timerStart = meta.timerStart || Date.now();
        rec.timerAuto = true;
      }
      rec.timerEnd = Date.now();
      if (chunks.length) rec.overflowInherit = true;
      setCellRecord(p, c, rec);
      chunks.push({ p, c, sec: writeSec });
      remainSec -= writeSec;
      if (remainSec <= 0) break;
      const nx = nextPeriodCell(p, c);
      if (!nx) break;
      p = nx.p; c = nx.c;
    }
    return chunks;
  }
`;

if (!app.includes("commitTimerWithOverflow")) {
  app = app.replace(
    "  // Round1/Round7：正计时锚点控件——仅记录页使用（计划页已去除）——⏱启动 / ⏸暂停 / ▶恢复 + ■结束命名",
    overflowHelper + "\n  // Round1/Round7：正计时锚点控件——仅记录页使用（计划页已去除）——⏱启动 / ⏸暂停 / ▶恢复 + ■结束命名"
  );
  console.log("inserted overflow helper");
}

const oldDoCommit = `    const doCommit = (nameOverride) => {
      const cur = runningTimers[key];
      if (!cur) return;
      const name = (nameOverride != null ? nameOverride : (cur.taskText || "")).trim();
      const duration = timerElapsedOf(cur);
      delete runningTimers[key];
      save(RUNNING_TIMERS_KEY, runningTimers);
      // Round7：精确到秒写入 spent（可累加）
      const addSec = Math.max(1, Math.round(duration / 1000));
      const rec = getCellRecord(period, cell) || {};
      if (name) {
        // 条状记录：用换行分隔，避免一长串「连续串联」
        const parts = String(rec.actual || "").split(/\\n|; /).map((s) => s.trim()).filter(Boolean);
        if (!parts.includes(name)) parts.push(name);
        rec.actual = parts.join("\\n");
      } else if (!rec.actual) {
        rec.actual = cur.taskText;
      }
      const prevSec = parseSpentToSec(rec.spent);
      rec.spent = formatSpentPrecise((prevSec + addSec) * 1000);
      rec.timerMs = (rec.timerMs || 0) + duration;
      rec.timerStart = cur.startTime;
      rec.timerEnd = Date.now();
      rec.timerAuto = true;
      setCellRecord(period, cell, rec);
      if (!Object.keys(runningTimers).length) _stopTimerTick();
      renderRunningTimerBar();
      renderMandala();
      renderRecord();
      haptic(20);
      toast("⏱️ 已记录 " + formatSpentPrecise(duration) + " → " + (PERIOD_NAMES[period] || "第" + (period + 1) + "辰") + " 第" + (cell + 1) + "格", "success");
    };`;

const newDoCommit = `    const doCommit = (nameOverride) => {
      const cur = runningTimers[key];
      if (!cur) return;
      const name = (nameOverride != null ? nameOverride : (cur.taskText || "")).trim();
      const duration = timerElapsedOf(cur);
      delete runningTimers[key];
      save(RUNNING_TIMERS_KEY, runningTimers);
      // Round14/15：超时溢出继承到后续时辰格（记录对齐格子时长）
      const chunks = commitTimerWithOverflow(period, cell, name, duration, {
        timerStart: cur.startTime,
        fallbackText: cur.taskText,
      });
      if (!Object.keys(runningTimers).length) _stopTimerTick();
      renderRunningTimerBar();
      renderQuickTimerBubble && renderQuickTimerBubble();
      renderMandala();
      renderRecord();
      haptic(20);
      if (chunks.length > 1) {
        const last = chunks[chunks.length - 1];
        toast("⏱️ 已记录 " + formatSpentPrecise(duration) + " · 溢出继承 " + chunks.length + " 格（至第" + (last.c + 1) + "格）", "success", 3600);
      } else {
        toast("⏱️ 已记录 " + formatSpentPrecise(duration) + " → " + (PERIOD_NAMES[period] || "第" + (period + 1) + "辰") + " 第" + (cell + 1) + "格", "success");
      }
    };`;

if (app.includes("commitTimerWithOverflow(period, cell")) {
  console.log("skip doCommit (already)");
} else {
  app = mustReplace(app, oldDoCommit, newDoCommit, "doCommit overflow");
}

// ---- Current-cell colored start button ----
const oldAttach = `    const timerBtn = document.createElement("button");
    timerBtn.className = "cell-timer-btn" + (_rt ? (_rtPaused ? " paused" : " running") : "");
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
    wrap.appendChild(timerBtn);`;

const newAttach = `    // Round14/15：当前时刻格 —— 青绿「开钟」钮（与普通⏱区分，方便多钟）
    const isNowCell = !!(cellEl.classList && cellEl.classList.contains("current-cell"));
    if (!_rt && isNowCell && state.realm === "record") {
      const nowBtn = document.createElement("button");
      nowBtn.type = "button";
      nowBtn.className = "cell-timer-btn cell-timer-now";
      nowBtn.dataset.timerNow = "1";
      nowBtn.textContent = "▶";
      nowBtn.title = "当前格开钟 · 青绿快捷钮（多钟：开新钟会自动暂停其他在跑的钟）";
      nowBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const hint = taskTextHint || "未命名任务";
        startCellTimer(period, cell, hint);
        renderQuickTimerBubble && renderQuickTimerBubble();
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
      renderQuickTimerBubble && renderQuickTimerBubble();
      if (state.realm === "record") renderRecord();
      else renderMandala();
    });
    wrap.appendChild(timerBtn);`;

if (!app.includes("cell-timer-now")) {
  app = mustReplace(app, oldAttach, newAttach, "now start btn");
}

// ---- stepsToTree: wire depends_on → meta.link ----
const oldStepsEnd = `        }
      });
      return root;
    }

    // 树 → steps（应用到列表）`;

const newStepsEnd = `        }
      });
      // Round14/15：depends_on / link 字段 → 导图关联线（解析修复）
      const allByIdx = new Map();
      const collect = [];
      const walkCollect = (n) => { collect.push(n); (n.children || []).forEach(walkCollect); };
      walkCollect(root);
      // 主线按原 steps 下标；支线也尝试挂 depends
      const nodeByStepIdx = new Map(mainNodes);
      steps.forEach((s, idx) => {
        if (s.branch === "side") {
          // 支线节点在父下，按文本匹配最近新建
          const parent = typeof s.parent_step === "number" ? mainNodes.get(s.parent_step) : null;
          const kids = parent ? parent.children : [];
          const hit = kids.find((c) => c.text === s.text && c.type === "side");
          if (hit) nodeByStepIdx.set(idx, hit);
        }
      });
      steps.forEach((s, idx) => {
        const from = nodeByStepIdx.get(idx);
        if (!from || from._isRoot) return;
        let toId = null;
        let label = "关联";
        if (s.link || s.link_to || (s.meta && s.meta.link)) {
          const ref = s.link || s.link_to || s.meta.link;
          if (typeof ref === "number" && nodeByStepIdx.has(ref)) toId = nodeByStepIdx.get(ref).id;
          else if (typeof ref === "string") {
            const byId = collect.find((n) => n.id === ref);
            const byText = collect.find((n) => (n.text || "").trim() === String(ref).trim());
            toId = (byId || byText || {}).id || null;
          }
          label = s.linkLabel || s.link_label || "关联";
        } else if (s.depends_on !== null && s.depends_on !== undefined && s.depends_on !== "") {
          const dep = typeof s.depends_on === "number" ? s.depends_on : parseInt(s.depends_on, 10);
          if (!isNaN(dep) && nodeByStepIdx.has(dep)) {
            toId = nodeByStepIdx.get(dep).id;
            label = "依赖";
          }
        }
        if (toId && toId !== from.id) {
          from.meta = from.meta || {};
          from.meta.link = toId;
          from.meta.linkLabel = label;
        }
      });
      return root;
    }

    // 树 → steps（应用到列表）`;

if (!app.includes("depends_on → 导图关联线") && !app.includes("depends_on / link 字段")) {
  app = mustReplace(app, oldStepsEnd, newStepsEnd, "wire depends_on");
}

// ---- findNode: fallback resolve by text for broken links ----
app = mustReplace(app,
`    findNode(id, n) {
      n = n || this.root;
      if (n.id === id) return n;
      for (const c of n.children) { const r = this.findNode(id, c); if (r) return r; }
      return null;
    }`,
`    findNode(id, n) {
      n = n || this.root;
      if (!id || !n) return null;
      if (n.id === id) return n;
      for (const c of n.children) { const r = this.findNode(id, c); if (r) return r; }
      return null;
    }
    // Round14：关联目标 id 失效时按文案兜底解析
    resolveLinkTarget(ref) {
      if (!ref) return null;
      const byId = this.findNode(ref);
      if (byId) return byId;
      return this.findNodeByText(String(ref));
    }`,
"resolveLinkTarget");

app = mustReplace(app,
`        if (n.meta && n.meta.link) {
          const t = this.findNode(n.meta.link);
          const p = this._nodePos.get(n.id);
          const tp = t && this._nodePos.get(t.id);`,
`        if (n.meta && n.meta.link) {
          const t = this.resolveLinkTarget ? this.resolveLinkTarget(n.meta.link) : this.findNode(n.meta.link);
          // 若按文案解析到节点，回写为稳定 id
          if (t && t.id !== n.meta.link) n.meta.link = t.id;
          const p = this._nodePos.get(n.id);
          const tp = t && this._nodePos.get(t.id);`,
"renderLinks resolve");

// ---- Touch: long-press shorter + selected node arms drag; don't steal to pan so easily ----
app = mustReplace(app,
`      const TAP_MS = 420, DRAG_PX = 12, LONG_PRESS_MS = 260, SWIPE_PX = 52;`,
`      const TAP_MS = 420, DRAG_PX = 10, LONG_PRESS_MS = 180, SWIPE_PX = 64;`,
"touch constants");

app = mustReplace(app,
`          const jumpEl = hit && hit.closest ? hit.closest("[data-mm-jump]") : null;
          if (jumpEl) { this.jumpToTask(jumpEl.getAttribute("data-mm-jump")); return; }
          const foldEl = hit && hit.closest ? hit.closest("[data-fold]") : null;
          if (foldEl) {
            const id = foldEl.getAttribute("data-fold");
            const n = this.findNode(id);
            if (n) { n.collapsed = !n.collapsed; this.pushHistory(); this.render(); }
            return;
          }
          const nodeEl = hit && hit.closest ? hit.closest("[data-node]") : null;
          if (nodeEl) {
            const id = nodeEl.getAttribute("data-node");
            tp = { mode: "node", id, x: t.clientX, y: t.clientY, moved: false, armed: false, swiped: false, lpTimer: null };
            this.selectNode(id, { center: false, panel: false });
            tp.lpTimer = setTimeout(() => {
              if (!tp || tp.mode !== "node" || tp.moved || tp.swiped) return;
              tp.armed = true;
              haptic(18);
              toast("↕ 拖改位置/隶属 · 松手未拖=编辑", "info", 1500);
            }, LONG_PRESS_MS);
          } else {
            tp = { mode: "pan", x: t.clientX, y: t.clientY, ox: this.view.x, oy: this.view.y };
          }`,
`          // Round14：↩ 角标不在 touchstart 跳转（避免抢拖拽）；短按松手再跳
          const jumpEl = hit && hit.closest ? hit.closest("[data-mm-jump]") : null;
          const foldEl = hit && hit.closest ? hit.closest("[data-fold]") : null;
          if (foldEl && !jumpEl) {
            const id = foldEl.getAttribute("data-fold");
            const n = this.findNode(id);
            if (n) { n.collapsed = !n.collapsed; this.pushHistory(); this.render(); }
            return;
          }
          const nodeEl = hit && hit.closest ? hit.closest("[data-node]") : null;
          if (nodeEl) {
            const id = nodeEl.getAttribute("data-node");
            const already = this.selectedId === id;
            tp = { mode: "node", id, x: t.clientX, y: t.clientY, moved: false, armed: !!already, swiped: false, lpTimer: null, jumpId: jumpEl ? jumpEl.getAttribute("data-mm-jump") : null };
            this.selectNode(id, { center: false, panel: false });
            // 已选中：立刻可拖；未选中：短长按武装
            if (!already) {
              tp.lpTimer = setTimeout(() => {
                if (!tp || tp.mode !== "node" || tp.moved || tp.swiped) return;
                tp.armed = true;
                tp.jumpId = null; // 武装后取消角标跳转
                haptic(18);
                toast("↕ 拖节点改位置/隶属 · 松手未拖=编辑", "info", 1400);
              }, LONG_PRESS_MS);
            } else {
              haptic(10);
            }
          } else {
            tp = { mode: "pan", x: t.clientX, y: t.clientY, ox: this.view.x, oy: this.view.y };
          }`,
"touchstart node drag");

app = mustReplace(app,
`          if (!tp.armed && dist > DRAG_PX && !tp.swiped) {
            clearLp();
            tp = { mode: "pan", x: tp.x, y: tp.y, ox: this.view.x, oy: this.view.y };
            this.view.x = tp.ox + (t.clientX - tp.x);
            this.view.y = tp.oy + (t.clientY - tp.y);
            this._applyView();
            return;
          }
          if (tp.armed && !tp.moved && dist > 4) {
            tp.moved = true;
            this._beginDragVisual(tp.id, t.clientX, t.clientY);
            haptic(12);
          }
          if (tp.moved) this._moveDragVisual(t.clientX, t.clientY);`,
`          // Round14：节点上移动 → 优先拖节点（不再轻易变成平移，解决 task 节点拖不动）
          if (!tp.armed && dist > DRAG_PX && !tp.swiped) {
            clearLp();
            tp.armed = true;
          }
          if (tp.armed && !tp.moved && dist > 4) {
            tp.moved = true;
            tp.jumpId = null;
            this._beginDragVisual(tp.id, t.clientX, t.clientY);
            haptic(12);
          }
          if (tp.moved) this._moveDragVisual(t.clientX, t.clientY);`,
"touchmove drag priority");

app = mustReplace(app,
`          } else if (was.armed && !was.moved) {
            // Round12：长按未拖 → 直接编辑（安卓更自然）
            this.editNode(was.id);
            haptic(15);
          } else {
            if (this._linkFrom) {
              this.completeLinkTo(was.id);
              tp = null;
              return;
            }
            const now = Date.now();
            if (this._lastTap && this._lastTap.id === was.id && now - this._lastTap.t < TAP_MS) {
              this.editNode(was.id);
              this._lastTap = null;
            } else {
              this._lastTap = { id: was.id, t: now };
              this._showNodePanel(was.id);
              this._updateFloatBar && this._updateFloatBar();
            }
          }`,
`          } else if (was.armed && !was.moved) {
            // Round12：长按未拖 → 直接编辑（安卓更自然）
            this.editNode(was.id);
            haptic(15);
          } else {
            if (was.jumpId && !was.moved) {
              this.jumpToTask(was.jumpId);
              tp = null;
              return;
            }
            if (this._linkFrom) {
              this.completeLinkTo(was.id);
              tp = null;
              return;
            }
            const now = Date.now();
            if (this._lastTap && this._lastTap.id === was.id && now - this._lastTap.t < TAP_MS) {
              this.editNode(was.id);
              this._lastTap = null;
            } else {
              this._lastTap = { id: was.id, t: now };
              this._showNodePanel(was.id);
              this._updateFloatBar && this._updateFloatBar();
            }
          }`,
"touchend jump defer");

// ---- Float bar: pointerup + theme-ready class ----
app = mustReplace(app,
`      if (els.floatBar) {
        const stopBubble = (e) => { e.stopPropagation(); };
        els.floatBar.addEventListener("pointerdown", stopBubble);
        els.floatBar.addEventListener("touchstart", stopBubble, { passive: true });
        els.floatBar.addEventListener("click", (e) => {
          e.stopPropagation();
          const btn = e.target.closest("[data-a]");
          if (!btn || !this.selectedId) return;
          const a = btn.dataset.a;
          if (a === "child") this.addChild(this.selectedId);
          else if (a === "edit") this.editNode(this.selectedId);
          else if (a === "est") this.editEstMin(this.selectedId);
          else if (a === "nudge-l") this.nudgeNode(this.selectedId, -24, 0);
          else if (a === "nudge-r") this.nudgeNode(this.selectedId, 24, 0);
          else if (a === "nudge-u") this.nudgeNode(this.selectedId, 0, -24);
          else if (a === "nudge-d") this.nudgeNode(this.selectedId, 0, 24);
          else if (a === "fold") this.toggleFold(this.selectedId);
          else if (a === "accordion") this.accordionSiblings(this.selectedId);
          else if (a === "up") this.moveNode(this.selectedId, -1);
          else if (a === "down") this.moveNode(this.selectedId, 1);
          else if (a === "promote") this.promote(this.selectedId);
          else if (a === "demote") this.demote(this.selectedId);
          else if (a === "focus") this.focusNode(this.selectedId);
          else if (a === "link") this.beginLinkMode(this.selectedId);
          else if (a === "jump") this.jumpToTask(this.selectedId);
          else if (a === "del") this.deleteNode(this.selectedId);
        });
      }`,
`      if (els.floatBar) {
        const stopBubble = (e) => { e.stopPropagation(); };
        els.floatBar.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault && e.pointerType === "touch" && e.preventDefault(); });
        els.floatBar.addEventListener("touchstart", stopBubble, { passive: true });
        const runFloatAction = (e) => {
          e.stopPropagation();
          e.preventDefault();
          const btn = e.target.closest("[data-a]");
          if (!btn || !this.selectedId) return;
          if (btn._mmFired && Date.now() - btn._mmFired < 400) return; // 防 click+pointerup 双触发
          btn._mmFired = Date.now();
          const a = btn.dataset.a;
          haptic(12);
          if (a === "child") this.addChild(this.selectedId);
          else if (a === "edit") this.editNode(this.selectedId);
          else if (a === "est") this.editEstMin(this.selectedId);
          else if (a === "nudge-l") this.nudgeNode(this.selectedId, -24, 0);
          else if (a === "nudge-r") this.nudgeNode(this.selectedId, 24, 0);
          else if (a === "nudge-u") this.nudgeNode(this.selectedId, 0, -24);
          else if (a === "nudge-d") this.nudgeNode(this.selectedId, 0, 24);
          else if (a === "fold") this.toggleFold(this.selectedId);
          else if (a === "accordion") this.accordionSiblings(this.selectedId);
          else if (a === "up") this.moveNode(this.selectedId, -1);
          else if (a === "down") this.moveNode(this.selectedId, 1);
          else if (a === "promote") this.promote(this.selectedId);
          else if (a === "demote") this.demote(this.selectedId);
          else if (a === "focus") this.focusNode(this.selectedId);
          else if (a === "link") this.beginLinkMode(this.selectedId);
          else if (a === "jump") this.jumpToTask(this.selectedId);
          else if (a === "del") this.deleteNode(this.selectedId);
          requestAnimationFrame(() => this._updateFloatBar && this._updateFloatBar());
        };
        els.floatBar.addEventListener("pointerup", runFloatAction);
        els.floatBar.addEventListener("click", runFloatAction);
      }`,
"float bar pointerup");

// ---- Side rail swap buttons ----
app = mustReplace(app,
`      const stickBtns = r.kind === "inbox"
        ? ('<button type="button" class="sd-stick-btn" data-stick="' + i + '" data-mode="cur" title="贴到' + escapeHtml(stickHint) + '">贴当前</button>'
          + '<button type="button" class="sd-stick-btn ghost" data-stick="' + i + '" data-mode="next" title="贴到下一空格 · ' + escapeHtml(stickNext.label) + '">贴下一空格</button>')
        : ('<button type="button" class="sd-stick-btn" data-stick="' + i + '" data-mode="cur" title="移到' + escapeHtml(stickHint) + '">移到当前格</button>');
      return '<div class="sd-task" draggable="true" data-i="' + i + '" title="一键贴格 · 或长按拖入">'
        + '<span class="sd-task-top">' + kindBadge + '<span class="sd-task-text">' + escapeHtml(r.text) + "</span></span>"
        + hierLine + noteLine
        + '<span class="sd-task-meta">' + tagPills + '<span class="sd-task-loc">' + escapeHtml(loc) + "</span></span>"
        + '<span class="sd-task-actions">' + stickBtns + '<span class="sd-drag-hint">⋮⋮ 长按拖入</span></span>'
        + "</div>";`,
`      const stickBtns = r.kind === "inbox"
        ? ('<button type="button" class="sd-stick-btn" data-stick="' + i + '" data-mode="cur" title="贴到' + escapeHtml(stickHint) + '">贴当前</button>'
          + '<button type="button" class="sd-stick-btn ghost" data-stick="' + i + '" data-mode="next" title="贴到下一空格 · ' + escapeHtml(stickNext.label) + '">贴下一空格</button>')
        : ('<button type="button" class="sd-stick-btn" data-stick="' + i + '" data-mode="cur" title="移到空格 / 有任务则交换 · ' + escapeHtml(stickHint) + '">移/换当前</button>'
          + '<button type="button" class="sd-stick-btn ghost sd-swap-btn" data-stick="' + i + '" data-mode="swap" title="与当前格首条任务交换">⇄ 交换</button>');
      return '<div class="sd-task" draggable="true" data-i="' + i + '" title="拖到格子：空=移入 · 有任务=交换">'
        + '<span class="sd-task-top">' + kindBadge + '<span class="sd-task-text">' + escapeHtml(r.text) + "</span></span>"
        + hierLine + noteLine
        + '<span class="sd-task-meta">' + tagPills + '<span class="sd-task-loc">' + escapeHtml(loc) + "</span></span>"
        + '<span class="sd-task-actions">' + stickBtns + '<span class="sd-drag-hint">⋮⋮ 拖入/交换</span></span>'
        + "</div>";`,
"sd swap buttons");

app = mustReplace(app,
`        haptic(18);
        stickSideRowToCurrentCell(src, {
          next: mode === "next",
          keepOpen: mode === "next" || r.kind === "inbox",
        });
      });
    });
    el.sdTasks.querySelectorAll(".sd-task").forEach((btn) => {`,
`        haptic(18);
        if (mode === "swap" && src.kind === "cell") {
          const tgt = resolveStickTargetCell({ next: false });
          if (!getCellTasks(tgt.p, tgt.c).length) {
            toast("当前格为空，无法交换 · 请用「移/换当前」", "info");
            return;
          }
          if (swapOrMoveCellTask(src.p, src.c, src.ti, tgt.p, tgt.c, { append: false })) {
            jumpToCell(tgt.p, tgt.c);
            renderAll();
            renderSideDrawer();
          }
          return;
        }
        stickSideRowToCurrentCell(src, {
          next: mode === "next",
          keepOpen: mode === "next" || r.kind === "inbox",
        });
      });
    });
    el.sdTasks.querySelectorAll(".sd-task").forEach((btn) => {`,
"sd swap click");

// ---- Quick timer bubble (in-app) ----
const bubbleCode = `
  // Round14/15：应用内快捷球（非系统悬浮窗）——看钟/暂停/结束；通知栏需另装 Local Notifications
  function renderQuickTimerBubble() {
    let fab = document.getElementById("quickTimerBubble");
    const list = Object.values(runningTimers || {}).filter((t) => t && t.date === state.currentDate);
    if (!list.length) {
      if (fab) fab.hidden = true;
      return;
    }
    if (!fab) {
      fab = document.createElement("div");
      fab.id = "quickTimerBubble";
      fab.className = "quick-timer-bubble";
      fab.innerHTML = '<button type="button" class="qtb-main" id="qtbMain" title="快捷计时">⏱</button>'
        + '<div class="qtb-panel" id="qtbPanel" hidden></div>';
      document.body.appendChild(fab);
      fab.querySelector("#qtbMain").addEventListener("click", (e) => {
        e.stopPropagation();
        const panel = fab.querySelector("#qtbPanel");
        panel.hidden = !panel.hidden;
        if (!panel.hidden) renderQuickTimerBubble();
      });
    }
    fab.hidden = false;
    const run = list.find((t) => !t.pausedAt) || list[0];
    const elMs = timerElapsedOf(run);
    const mm = Math.floor(elMs / 60000), ss = Math.floor((elMs % 60000) / 1000);
    const main = fab.querySelector("#qtbMain");
    if (main) {
      main.textContent = (run.pausedAt ? "⏸" : "⏱") + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
      main.classList.toggle("paused", !!run.pausedAt);
      main.classList.toggle("running", !run.pausedAt);
    }
    const panel = fab.querySelector("#qtbPanel");
    if (panel && !panel.hidden) {
      panel.innerHTML = list.map((t) => {
        const key = timerKeyOf(t.date, t.period, t.cell);
        const dur = _fmtTimerDur(timerElapsedOf(t));
        const lab = trunc(String(t.taskText || "任务"), 10);
        return '<div class="qtb-row" data-k="' + escapeHtml(key) + '">'
          + '<span class="qtb-lab">' + (t.pausedAt ? "⏸" : "▶") + " " + escapeHtml(lab) + " · " + dur + "</span>"
          + '<button type="button" data-q="toggle" data-p="' + t.period + '" data-c="' + t.cell + '">' + (t.pausedAt ? "恢复" : "暂停") + "</button>"
          + '<button type="button" data-q="end" data-p="' + t.period + '" data-c="' + t.cell + '">结束</button>'
          + "</div>";
      }).join("")
        + '<div class="qtb-hint">系统通知栏快捷操作需安装 @capacitor/local-notifications（见 ROUND14.md）</div>';
      panel.querySelectorAll("button[data-q]").forEach((b) => {
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          const p = parseInt(b.dataset.p, 10), c = parseInt(b.dataset.c, 10);
          if (b.dataset.q === "toggle") toggleCellTimer(p, c);
          else if (b.dataset.q === "end") stopCellTimer(p, c);
          renderQuickTimerBubble();
          if (state.realm === "record") renderRecord();
        });
      });
    }
  }
  // 挂到 tick：走秒时刷新快捷球
  const _origLight = typeof _tryLightTimerRefresh === "function" ? null : null;
`;

if (!app.includes("renderQuickTimerBubble")) {
  // insert before attachCellTimerControls (after overflow helper)
  app = app.replace(
    "  // Round1/Round7：正计时锚点控件——仅记录页使用（计划页已去除）——⏱启动 / ⏸暂停 / ▶恢复 + ■结束命名",
    bubbleCode + "\n  // Round1/Round7：正计时锚点控件——仅记录页使用（计划页已去除）——⏱启动 / ⏸暂停 / ▶恢复 + ■结束命名"
  );
  console.log("inserted bubble");
}

// Hook tick to refresh bubble
app = mustReplace(app,
`    _timerTick = setInterval(() => {
      if (!_tryLightTimerRefresh()) renderRunningTimerBar();
    }, 1000);`,
`    _timerTick = setInterval(() => {
      if (!_tryLightTimerRefresh()) renderRunningTimerBar();
      try { renderQuickTimerBubble(); } catch (e) {}
    }, 1000);`,
"tick bubble");

// Also call after start/pause
app = mustReplace(app,
`    toast("⏱️ 正计时已启动 · " + trunc(String(taskText || "任务"), 14) + (pausedN ? \`（其余 \${pausedN} 钟已暂停）\` : ""), "success", 2200);
    haptic(20);
    return true;
  }`,
`    toast("⏱️ 正计时已启动 · " + trunc(String(taskText || "任务"), 14) + (pausedN ? \`（其余 \${pausedN} 钟已暂停）\` : ""), "success", 2200);
    haptic(20);
    try { renderQuickTimerBubble(); } catch (e) {}
    return true;
  }`,
"start bubble");

write("www/app.js", app);

// ---- CSS ----
let css = read("www/styles.css");
if (!css.includes("Round14/15")) {
  css += `

/* ============================================================
 * Round14/15：边轨主题对齐 · 当前格开钟 · 快捷球 · 导图浮动条
 * ============================================================ */
.side-drawer.edge-rail {
  background: var(--glass-bg, rgba(26, 26, 46, 0.88)) !important;
  border: 1px solid var(--border-active, rgba(124,92,255,.45));
  color: var(--text-primary);
  box-shadow: 0 10px 28px rgba(0,0,0,.35), 0 0 0 1px var(--border);
}
.side-drawer.edge-rail .sd-title { color: var(--accent-light, #9d85ff); }
.side-drawer.edge-rail .sd-tag,
.side-drawer.edge-rail .sd-tag-pill {
  background: var(--bg-tertiary, #252544);
  color: var(--text-secondary, #a0a0c0);
  border-color: var(--border);
}
.side-drawer.edge-rail .sd-tag.active,
.side-drawer.edge-rail .sd-tag-pill.active {
  background: var(--accent, #7c5cff);
  border-color: var(--accent);
  color: #fff;
}
.side-drawer.edge-rail .sd-task {
  background: var(--bg-card, #1e1e38);
  border-color: var(--border);
  color: var(--text-primary);
}
.side-drawer.edge-rail .sd-kind.inbox {
  background: rgba(45,212,191,.16); color: #5eead4; border: 1px solid rgba(45,212,191,.35);
  font-size: 10px; padding: 1px 6px; border-radius: 999px; font-weight: 700;
}
.side-drawer.edge-rail .sd-kind.cell {
  background: rgba(124,92,255,.16); color: var(--accent-light); border: 1px solid rgba(124,92,255,.35);
  font-size: 10px; padding: 1px 6px; border-radius: 999px; font-weight: 700;
}
.sd-stick-btn.sd-swap-btn {
  border-color: rgba(45,212,191,.45);
  background: rgba(45,212,191,.14);
  color: #5eead4;
}
.sd-stick-btn.sd-swap-btn:active { background: rgba(45,212,191,.28); }

.cell-timer-btn.cell-timer-now {
  opacity: 1 !important;
  background: linear-gradient(135deg, #14b8a6, #2dd4bf) !important;
  color: #042f2e !important;
  box-shadow: 0 2px 10px rgba(45,212,191,.45);
  font-weight: 800;
}
.cell-timer-btn.secondary { opacity: .72; }
.cell.current-cell .cell-timer-controls { z-index: 5; }

.mm-float-bar {
  z-index: 60 !important;
  pointer-events: auto !important;
  background: var(--bg-card, rgba(30,30,56,.97)) !important;
  border: 1px solid var(--border-active, rgba(124,92,255,.55)) !important;
  color: var(--text-primary);
}
.mm-float-bar button {
  pointer-events: auto !important;
  color: var(--text-primary) !important;
  background: rgba(124,92,255,.12);
  border: 1px solid rgba(124,92,255,.25);
}
.mm-float-bar button b { color: var(--text-secondary, #c8c8e8) !important; }
.mm-float-bar button:active,
.mm-float-bar button:hover {
  background: rgba(124,92,255,.32) !important;
}
.mm-float-bar button[data-a="link"].on {
  background: rgba(255,169,77,.22) !important;
  border-color: rgba(255,169,77,.5);
}
.mm-float-bar.mm-float-dock {
  z-index: 70 !important;
  background: var(--bg-card, rgba(22,22,42,.98)) !important;
}
.mm-node { touch-action: none; }
.mm-node > rect { pointer-events: all; }

.quick-timer-bubble {
  position: fixed;
  right: max(12px, env(safe-area-inset-right));
  bottom: max(72px, calc(env(safe-area-inset-bottom) + 64px));
  z-index: 1250;
  display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
}
.quick-timer-bubble[hidden] { display: none !important; }
.qtb-main {
  min-width: 56px; height: 44px; padding: 0 12px; border-radius: 999px;
  border: 1px solid rgba(124,92,255,.45);
  background: linear-gradient(135deg, var(--accent, #7c5cff), #5b8cff);
  color: #fff; font-weight: 800; font-size: 12px; font-variant-numeric: tabular-nums;
  box-shadow: 0 6px 20px rgba(124,92,255,.4);
  cursor: pointer; touch-action: manipulation;
}
.qtb-main.paused { background: linear-gradient(135deg, #a78bfa, #7474a0); }
.qtb-main.running { animation: timerPulseSoft 1.8s infinite; }
.qtb-panel {
  width: min(92vw, 280px);
  background: var(--bg-card, #1e1e38);
  border: 1px solid var(--border-active, rgba(124,92,255,.4));
  border-radius: 14px; padding: 8px; box-shadow: 0 12px 28px rgba(0,0,0,.45);
}
.qtb-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.qtb-lab { flex: 1; font-size: 11.5px; color: var(--text-primary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qtb-row button {
  flex: 0 0 auto; min-height: 32px; padding: 4px 8px; border-radius: 8px; font-size: 11px; font-weight: 700;
  border: 1px solid rgba(124,92,255,.35); background: rgba(124,92,255,.16); color: #d4c8ff; cursor: pointer;
}
.qtb-hint { font-size: 10px; color: var(--text-muted); line-height: 1.4; margin-top: 4px; }
[data-theme="light"] .side-drawer.edge-rail {
  background: rgba(255,255,255,.92) !important;
}
[data-theme="light"] .qtb-panel { background: #fff; }
`;
  write("www/styles.css", css);
} else {
  console.log("skip css");
}

// ---- index / sw / gradle ----
let html = read("www/index.html");
html = html.replace(/styles\.css\?v=[^"]+/g, "styles.css?v=20260903r14");
html = html.replace(/app\.js\?v=[^"]+/g, "app.js?v=20260903r14");
write("www/index.html", html);

let sw = read("www/sw.js");
sw = sw.replace(/mandala-v112[^\\n]*/, "mandala-v113\"; // v113 Round14/15：边轨交换+溢出继承+导图拖拽+快捷球");
if (!sw.includes("mandala-v113")) {
  sw = sw.replace(/const CACHE_NAME = "[^"]+";.*/, 'const CACHE_NAME = "mandala-v113"; // v113 Round14/15');
}
write("www/sw.js", sw);

let gradle = read("android/app/build.gradle");
gradle = gradle.replace(/versionCode\\s+\\d+/, "versionCode 113");
gradle = gradle.replace(/versionName\\s+"[^"]+"/, 'versionName "2.7.24.113"');
write("android/app/build.gradle", gradle);

const md = `# Round 14 / 15 抛光小结（v2.7.24·113）

日期：2026-09-03  
范围：\`d:\\\\Downloads\\\\mandala-shichen\`（未改 \`mant\`）  
承接：Round13（112）→ 边轨主题/交换、导图交互、多钟与溢出继承、应用内快捷球

---

## 一、左侧边轨 · 主题与交换

| 子维度 | 状态 | 说明 |
|--------|------|------|
| 主题 token 对齐 | ✅ | 使用 \`--glass-bg / --accent / --bg-card\`，亮暗主题可读 |
| 紧凑浮动轨 | ✅ | 仍贴主九宫格，非左隐藏整页 |
| 格子↔格子交换 | ✅ | 拖入有任务格默认 **交换**；Shift=追加 |
| 边轨⇄交换钮 | ✅ | 已安排任务：「移/换当前」+「⇄ 交换」 |
| 拖入贴格 | ✅ | 空格移入 / 有任务交换；长按拖入保留 |

---

## 二、思维导图 · 交互与关联解析

| 子维度 | 状态 | 说明 |
|--------|------|------|
| depends_on→关联线 | ✅ | \`stepsToTree\` 解析依赖为 \`meta.link\` +「依赖」文案 |
| 失效 id 兜底 | ✅ | \`resolveLinkTarget\` 按文案回写稳定 id |
| 长按/已选拖节点 | ✅ | 已选中立刻可拖；未选 180ms 武装；移动不再误变平移 |
| ↩ 角标不抢拖 | ✅ | 短按松手才跳格 |
| 浮动条可点 | ✅ | \`pointerup\`+\`click\`、防双触发；z-index/主题色加强 |
| 可读性 | ✅ | 节点 touch-action、按钮对比度 |

---

## 三、记录页 · 多钟与溢出继承

| 子维度 | 状态 | 说明 |
|--------|------|------|
| 当前格青绿开钟钮 | ✅ | \`.cell-timer-now\` ▶，与普通⏱区分 |
| 多钟协作 | ✅ | 开新钟自动暂停其他；条/球可切 |
| 超时溢出继承 | ✅ | 记入时按 \`SECONDS_PER_CELL\` 切开，多余写入后续格（标「续·溢出」） |

---

## 四、Android 快捷操作 · 可行性诚实说明

| 能力 | 状态 | 说明 |
|------|------|------|
| **应用内快捷球** | ✅ 已做 | 右下角球：看时长 / 暂停恢复 / 结束；随 tick 刷新 |
| **通知栏操作** | ⚠ 未装插件 | 工程依赖无 \`@capacitor/local-notifications\`；要做需：\`npm i @capacitor/local-notifications\` + Android 权限 + action callback |
| **系统悬浮球** | ⚠ 未做原生 | 需 \`SYSTEM_ALERT_WINDOW\` + 自定义 Capacitor 插件/前台服务；成本高，本轮用应用内球替代 |
| 后台保活前台服务 | ❌ 未做 | 需原生 Foreground Service；WebView  alone 不可靠 |

建议下一轮：先装 Local Notifications，做「进行中」通知 + 暂停/结束 Action；悬浮窗再评估。

---

## 五、版本信号

- \`APP_BUILD\`：**113**
- \`APP_VERSION\`：**2.7.24**
- \`sw.js\`：\`mandala-v113\`
- \`index.html\`：\`?v=20260903r14\`
- Android：\`versionCode 113\` / \`versionName 2.7.24.113\`

---

## 本地预览

\`\`\`bash
cd d:\\\\Downloads\\\\mandala-shichen
npm start
# 硬刷新确认徽标 v2.7.24·113
\`\`\`

回归建议：边轨拖交换、记录页当前格 ▶ 开钟、记入超时>1格看溢出、导图长按拖 task 节点、点浮动条、看右下角快捷球。

## 关键文件

- \`www/app.js\` — 交换/溢出/开钟钮/导图解析与拖拽/浮动条/快捷球/版本 113
- \`www/styles.css\` — 边轨主题、开钟钮、浮动条、快捷球
- \`www/index.html\` / \`www/sw.js\` / \`android/app/build.gradle\`
- \`ROUND14.md\` — 本文件
`;

write("ROUND14.md", md);
write("ROUND15.md", md.replace("Round 14 / 15", "Round 15（同 14 收口）").replace("ROUND14.md", "ROUND15.md（与 ROUND14 同步）"));

console.log("DONE Round14/15 patch");

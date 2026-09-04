/**
 * Round24 patch — record 新开钟 UI · mindmap + · tabs · toolbar · canvas · v122
 * Run: node scripts/round24-patch.js
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

// ---------- 1. Version bump ----------
must(app.includes("const APP_BUILD = 121;"), "APP_BUILD 121 not found");
app = app.replace(
  "const APP_BUILD = 121; // 构建号：与 android versionCode 同步，版本徽标直接显示（用户可自证当前版本）",
  "const APP_BUILD = 122; // 构建号：与 android versionCode 同步，版本徽标直接显示（用户可自证当前版本）"
);
app = app.replace(
  `  const APP_CHANGELOG = [
    { v: "2.7.24·121", date: "2026-09-04", items: [
      "Round23：通知栏走秒≈1s（JS tick + FGS 原生自走秒）",
      "Round23：暂停态通知三键 恢复|下一钟|结束（可新开钟切事项）",
    ]},`,
  `  const APP_CHANGELOG = [
    { v: "2.7.24·122", date: "2026-09-04", items: [
      "Round24：记录页多钟条显式 暂停/恢复/下一钟/结束 + 暂停态「新开钟」琥珀钮",
      "Round24：导图节点与分支中点「+」加子节点（安卓大触控）",
      "Round24：修复标签切换；竖屏工具栏换行，横屏横滑；导图画板安全区自适应",
    ]},
    { v: "2.7.24·121", date: "2026-09-04", items: [
      "Round23：通知栏走秒≈1s（JS tick + FGS 原生自走秒）",
      "Round23：暂停态通知三键 恢复|下一钟|结束（可新开钟切事项）",
    ]},`
);

// ---------- 2. startFreshNewClock ----------
const START_FRESH = `
  /** Round24：暂停态「新开钟」——上一口保持暂停，在当前时刻格（或下一空格）开新事项 */
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
  }

`;

if (!app.includes("function startFreshNewClock")) {
  must(app.includes("function startNextOrNewClock(curP, curC)"), "startNextOrNewClock missing");
  app = app.replace(
    "  /** Round23：通知/条内「下一钟」——优先恢复其他已有钟；否则在当前时刻格（或下一格）新开钟（对齐 Round20） */\n  function startNextOrNewClock(curP, curC) {",
    START_FRESH + "  /** Round23：通知/条内「下一钟」——优先恢复其他已有钟；否则在当前时刻格（或下一格）新开钟（对齐 Round20） */\n  function startNextOrNewClock(curP, curC) {"
  );
}

// ---------- 3. attachCellTimerControls — visible 新开钟 label ----------
const OLD_ATTACH_NEW = `    // Round20：仅当「有暂停钟且无一在跑」时，在当前时刻格显示青绿「新开钟」——方便切事项；在跑时不刷冗余 ▶
    const isNowCell = !!(cellEl.classList && cellEl.classList.contains("current-cell"));
    const _todayTimers = Object.values(runningTimers).filter((t) => t && t.date === state.currentDate);
    const _hasPausedClock = _todayTimers.some((t) => !!t.pausedAt);
    const _hasRunningClock = _todayTimers.some((t) => !t.pausedAt);
    const _showNewClock = !_rt && isNowCell && state.realm === "record" && _hasPausedClock && !_hasRunningClock;
    if (_showNewClock) {
      const nowBtn = document.createElement("button");
      nowBtn.type = "button";
      nowBtn.className = "cell-timer-btn cell-timer-now";
      nowBtn.dataset.timerNow = "1";
      nowBtn.textContent = "▶";
      nowBtn.title = "新开钟 · 上一口保持暂停，本格开新事项（方便切换不同事项及时记录）";
      nowBtn.setAttribute("aria-label", "新开钟");
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
    }`;

const NEW_ATTACH_NEW = `    // Round24：仅当「有暂停钟且无一在跑」时显示琥珀「新开钟」文案钮（在跑不刷冗余启动）
    const isNowCell = !!(cellEl.classList && cellEl.classList.contains("current-cell"));
    const _todayTimers = Object.values(runningTimers).filter((t) => t && t.date === state.currentDate);
    const _hasPausedClock = _todayTimers.some((t) => !!t.pausedAt);
    const _hasRunningClock = _todayTimers.some((t) => !t.pausedAt);
    const _showNewClock = !_rt && isNowCell && state.realm === "record" && _hasPausedClock && !_hasRunningClock;
    if (_showNewClock) {
      const nowBtn = document.createElement("button");
      nowBtn.type = "button";
      nowBtn.className = "cell-timer-btn cell-timer-now cell-timer-now-label";
      nowBtn.dataset.timerNow = "1";
      nowBtn.textContent = "新开钟";
      nowBtn.title = "新开钟 · 上一口保持暂停，本格开新事项";
      nowBtn.setAttribute("aria-label", "新开钟");
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
    }`;

must(app.includes(OLD_ATTACH_NEW), "attachCellTimerControls new-clock block not found");
app = app.replace(OLD_ATTACH_NEW, NEW_ATTACH_NEW);

// ---------- 4. renderRecordClockStrip — labeled buttons + 新开钟 ----------
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
          ? ('<button type="button" data-rcs="bring" data-date="' + escapeHtml(t.date || "") + '" data-p="' + t.period + '" data-c="' + t.cell + '" title="带到今日续计">→今</button>')
          : ('<button type="button" data-rcs="toggle" data-p="' + t.period + '" data-c="' + t.cell + '" title="' + (paused ? "恢复" : "暂停") + '">' + (paused ? "▶" : "⏸") + "</button>"
            + '<button type="button" data-rcs="next" data-p="' + t.period + '" data-c="' + t.cell + '" title="暂停并开始下一钟">⏭</button>'
            + '<button type="button" data-rcs="stop" data-p="' + t.period + '" data-c="' + t.cell + '" title="结束·命名">■</button>'))
        + "</div>";
    };
    strip.innerHTML =
      '<div class="rcs-sum">⏱ 多钟协作 · <b class="run">' + runN + " 在跑</b>"
      + (pauseN ? ' · <b class="pause">' + pauseN + " 暂停</b>" : "")
      + (staleTimers.length ? ' · <b class="stale">' + staleTimers.length + " 跨日</b>" : "")
      + "</div>"
      + '<div class="rcs-chips">'
      + todayTimers.map((t) => chip(t, false)).join("")
      + staleTimers.map((t) => chip(t, true)).join("")
      + "</div>"
      + '<div class="rcs-ops">'
      + (runN ? '<button type="button" data-rcs="pause-all">⏸ 全暂停</button>' : "")
      + (todayTimers.length ? '<button type="button" data-rcs="stop-all">■ 全结束</button>' : "")
      + (staleTimers.length ? '<button type="button" data-rcs="bring-today" class="accent">📅 带到今日</button>' : "")
      + (staleTimers.length ? '<button type="button" data-rcs="discard-stale" class="danger">🗑 清跨日</button>' : "")
      + "</div>";`;

const NEW_CHIP = `    const showNewClock = pauseN > 0 && runN === 0;
    const chip = (t, stale) => {
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
    };
    strip.innerHTML =
      '<div class="rcs-sum">⏱ 多钟协作 · <b class="run">' + runN + " 在跑</b>"
      + (pauseN ? ' · <b class="pause">' + pauseN + " 暂停</b>" : "")
      + (staleTimers.length ? ' · <b class="stale">' + staleTimers.length + " 跨日</b>" : "")
      + (showNewClock ? ' · <b class="newc">可新开钟</b>' : "")
      + "</div>"
      + '<div class="rcs-chips">'
      + todayTimers.map((t) => chip(t, false)).join("")
      + staleTimers.map((t) => chip(t, true)).join("")
      + "</div>"
      + '<div class="rcs-ops">'
      + (showNewClock ? '<button type="button" class="rcs-newclock" data-rcs="new-clock">▶ 新开钟</button>' : "")
      + (runN ? '<button type="button" data-rcs="pause-all">⏸ 全暂停</button>' : "")
      + (todayTimers.length ? '<button type="button" data-rcs="stop-all">■ 全结束</button>' : "")
      + (staleTimers.length ? '<button type="button" data-rcs="bring-today" class="accent">📅 带到今日</button>' : "")
      + (staleTimers.length ? '<button type="button" data-rcs="discard-stale" class="danger">🗑 清跨日</button>' : "")
      + "</div>";`;

must(app.includes(OLD_CHIP), "record clock strip chip block not found");
app = app.replace(OLD_CHIP, NEW_CHIP);

// wire new-clock action
must(app.includes(`} else if (act === "discard-stale") {
          discardStaleTimers();
        }`), "discard-stale handler not found");
app = app.replace(
  `} else if (act === "discard-stale") {
          discardStaleTimers();
        }`,
  `} else if (act === "discard-stale") {
          discardStaleTimers();
        } else if (act === "new-clock") {
          startFreshNewClock();
          if (state.realm === "record") renderRecord();
          else renderMandala();
        }`
);

// ---------- 5. Mind map: + on nodes and branch midpoints ----------
const OLD_FOLD_END = `      // 根节点省略折叠
      this.els.g.appendChild(group);
      // 递归渲染子节点
      if (!n.collapsed) n.children.forEach((c) => this._renderNode(c, depth + 1, anim));
    }`;

const NEW_FOLD_END = `      // Round24：节点右侧「+」加子节点（含根→主线；安卓大触控）
      {
        const addG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        addG.setAttribute("data-mm-add", n.id);
        addG.setAttribute("class", "mm-add-btn");
        addG.style.cursor = "pointer";
        const ac = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        ac.setAttribute("cx", pos.w + 16);
        ac.setAttribute("cy", pos.h / 2);
        ac.setAttribute("r", 14);
        ac.setAttribute("fill", "#f59e0b");
        ac.setAttribute("stroke", "#fff");
        ac.setAttribute("stroke-width", "2");
        addG.appendChild(ac);
        const at = document.createElementNS("http://www.w3.org/2000/svg", "text");
        at.setAttribute("x", pos.w + 16);
        at.setAttribute("y", pos.h / 2 + 5);
        at.setAttribute("text-anchor", "middle");
        at.setAttribute("font-size", "18");
        at.setAttribute("font-weight", "800");
        at.setAttribute("fill", "#1a1200");
        at.setAttribute("pointer-events", "none");
        at.textContent = "+";
        addG.appendChild(at);
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = n._isRoot ? "添加主线" : "添加子节点";
        addG.appendChild(title);
        group.appendChild(addG);
      }
      // 根节点省略折叠
      this.els.g.appendChild(group);
      // 递归渲染子节点
      if (!n.collapsed) n.children.forEach((c) => this._renderNode(c, depth + 1, anim));
    }`;

must(app.includes(OLD_FOLD_END), "mm fold end block not found");
app = app.replace(OLD_FOLD_END, NEW_FOLD_END);

// branch midpoint + in _renderEdges
const OLD_EDGE_DOT = `        this.els.g.appendChild(path);
        // 端点圆点（父端小圆，视觉锚点）
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", sx); dot.setAttribute("cy", sy);
        dot.setAttribute("r", isSide ? 2.5 : (isChild ? 2 : 3));
        dot.setAttribute("fill", isSide ? "#ffa94d" : (isChild ? "#4dc3ff" : "#7c5cff"));
        dot.setAttribute("opacity", "0.85");
        this.els.g.appendChild(dot);
        this._renderEdges(c, anim, (dep || 0) + 1);`;

const NEW_EDGE_DOT = `        this.els.g.appendChild(path);
        // 端点圆点（父端小圆，视觉锚点）
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", sx); dot.setAttribute("cy", sy);
        dot.setAttribute("r", isSide ? 2.5 : (isChild ? 2 : 3));
        dot.setAttribute("fill", isSide ? "#ffa94d" : (isChild ? "#4dc3ff" : "#7c5cff"));
        dot.setAttribute("opacity", "0.85");
        this.els.g.appendChild(dot);
        // Round24：分支中点「+」→ 给父节点加同级子分支
        {
          const mx = (sx + tx) / 2, my = (sy + ty) / 2;
          const bag = document.createElementNS("http://www.w3.org/2000/svg", "g");
          bag.setAttribute("data-mm-add", n.id);
          bag.setAttribute("class", "mm-add-btn mm-add-branch");
          bag.style.cursor = "pointer";
          const bc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          bc.setAttribute("cx", mx); bc.setAttribute("cy", my); bc.setAttribute("r", 12);
          bc.setAttribute("fill", "rgba(245,158,11,.95)");
          bc.setAttribute("stroke", "#fff"); bc.setAttribute("stroke-width", "1.5");
          bag.appendChild(bc);
          const bt = document.createElementNS("http://www.w3.org/2000/svg", "text");
          bt.setAttribute("x", mx); bt.setAttribute("y", my + 4.5);
          bt.setAttribute("text-anchor", "middle");
          bt.setAttribute("font-size", "15"); bt.setAttribute("font-weight", "800");
          bt.setAttribute("fill", "#1a1200"); bt.setAttribute("pointer-events", "none");
          bt.textContent = "+";
          bag.appendChild(bt);
          this.els.g.appendChild(bag);
        }
        this._renderEdges(c, anim, (dep || 0) + 1);`;

must(app.includes(OLD_EDGE_DOT), "edge dot block not found");
app = app.replace(OLD_EDGE_DOT, NEW_EDGE_DOT);

// touch/mouse handlers for data-mm-add
const OLD_FOLD_MOUSE = `        const foldEl = e.target.closest ? e.target.closest("[data-fold]") : null;
        if (foldEl) {
          const id = foldEl.getAttribute("data-fold");
          const n = this.findNode(id);
          if (n) { n.collapsed = !n.collapsed; this.pushHistory(); this.render(); }
          return;
        }
        // 空白：开始平移`;

const NEW_FOLD_MOUSE = `        const addEl = e.target.closest ? e.target.closest("[data-mm-add]") : null;
        if (addEl) {
          e.stopPropagation();
          const id = addEl.getAttribute("data-mm-add");
          if (id) { this.addChild(id); haptic(14); }
          return;
        }
        const foldEl = e.target.closest ? e.target.closest("[data-fold]") : null;
        if (foldEl) {
          const id = foldEl.getAttribute("data-fold");
          const n = this.findNode(id);
          if (n) { n.collapsed = !n.collapsed; this.pushHistory(); this.render(); }
          return;
        }
        // 空白：开始平移`;

must(app.includes(OLD_FOLD_MOUSE), "mouse fold handler not found");
app = app.replace(OLD_FOLD_MOUSE, NEW_FOLD_MOUSE);

const OLD_FOLD_TOUCH = `          const jumpEl = hit && hit.closest ? hit.closest("[data-mm-jump]") : null;
          const foldEl = hit && hit.closest ? hit.closest("[data-fold]") : null;
          if (foldEl && !jumpEl) {
            const id = foldEl.getAttribute("data-fold");
            const n = this.findNode(id);
            if (n) { n.collapsed = !n.collapsed; this.pushHistory(); this.render(); }
            return;
          }`;

const NEW_FOLD_TOUCH = `          const jumpEl = hit && hit.closest ? hit.closest("[data-mm-jump]") : null;
          const addEl = hit && hit.closest ? hit.closest("[data-mm-add]") : null;
          if (addEl && !jumpEl) {
            const id = addEl.getAttribute("data-mm-add");
            if (id) { this.addChild(id); haptic(14); }
            return;
          }
          const foldEl = hit && hit.closest ? hit.closest("[data-fold]") : null;
          if (foldEl && !jumpEl) {
            const id = foldEl.getAttribute("data-fold");
            const n = this.findNode(id);
            if (n) { n.collapsed = !n.collapsed; this.pushHistory(); this.render(); }
            return;
          }`;

must(app.includes(OLD_FOLD_TOUCH), "touch fold handler not found");
app = app.replace(OLD_FOLD_TOUCH, NEW_FOLD_TOUCH);

// ---------- 6. Fix tabs — event delegation + null-safe settings ----------
const OLD_SETTINGS_TAB = `  document.querySelectorAll(".settings-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      document.querySelectorAll(".settings-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".settings-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(\`.settings-panel[data-panel="\${target}"]\`).classList.add("active");
    });
  });`;

const NEW_SETTINGS_TAB = `  // Round24：设置标签委托 + null 防护（避免点不到/点崩）
  const settingsTabsHost = document.querySelector(".settings-tabs") || el.settingsDialog;
  if (settingsTabsHost) {
    settingsTabsHost.addEventListener("click", (e) => {
      const tab = e.target.closest && e.target.closest(".settings-tab");
      if (!tab) return;
      const target = tab.dataset.tab;
      if (!target) return;
      e.preventDefault();
      document.querySelectorAll(".settings-tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".settings-panel").forEach((p) => {
        p.classList.toggle("active", p.dataset.panel === target);
      });
    });
  }`;

if (app.includes(OLD_SETTINGS_TAB)) {
  app = app.replace(OLD_SETTINGS_TAB, NEW_SETTINGS_TAB);
} else {
  console.warn("settings-tab block variant not exact; trying softer replace");
  must(app.includes('document.querySelectorAll(".settings-tab").forEach((tab) => {'), "settings tabs not found");
  app = app.replace(
    /document\.querySelectorAll\("\.settings-tab"\)\.forEach\(\(tab\) => \{[\s\S]*?document\.querySelector\(`\.settings-panel\[data-panel="\$\{target\}"\]`\)\.classList\.add\("active"\);\s*\}\);\s*\}\);/,
    NEW_SETTINGS_TAB.trim()
  );
}

// realm tabs: also bind pointerup for Android WebView quirks
const OLD_REALM_TAB = `    el.realmSwitcher.querySelectorAll(".realm-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.realm;
        const order = ["plan", "record", "review"];
        const reverse = order.indexOf(target) < order.indexOf(state.realm);
        setRealm(target, reverse);
      });
    });`;

const NEW_REALM_TAB = `    el.realmSwitcher.querySelectorAll(".realm-tab").forEach((tab) => {
      const go = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const target = tab.dataset.realm;
        if (!target) return;
        const order = ["plan", "record", "review"];
        const reverse = order.indexOf(target) < order.indexOf(state.realm);
        setRealm(target, reverse);
      };
      tab.addEventListener("click", go);
      tab.addEventListener("pointerup", (e) => {
        if (e.pointerType === "touch") go(e);
      });
      tab.style.touchAction = "manipulation";
      tab.style.pointerEvents = "auto";
    });`;

must(app.includes(OLD_REALM_TAB), "realm tab bind not found");
app = app.replace(OLD_REALM_TAB, NEW_REALM_TAB);

// period tabs: pointerup + touch-action
const OLD_PERIOD_TAB = `      tab.addEventListener("click", () => { state.activePeriod = i; haptic(15); renderAll(); });`;
const NEW_PERIOD_TAB = `      const goPeriod = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        state.activePeriod = i; haptic(15); renderAll();
      };
      tab.addEventListener("click", goPeriod);
      tab.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") goPeriod(e); });
      tab.style.touchAction = "manipulation";
      tab.style.pointerEvents = "auto";`;
must(app.includes(OLD_PERIOD_TAB), "period tab click not found");
app = app.replace(OLD_PERIOD_TAB, NEW_PERIOD_TAB);

// ---------- 7. Attach badge away from timer controls ----------
const OLD_ATTACH_BADGE = `        badge.style.cssText = "position:absolute;top:4px;right:4px;background:rgba(248,113,113,0.18);color:#f87171;font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px;border:1px solid rgba(248,113,113,0.4);";`;
const NEW_ATTACH_BADGE = `        badge.style.cssText = "position:absolute;top:4px;left:4px;background:rgba(248,113,113,0.18);color:#f87171;font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px;border:1px solid rgba(248,113,113,0.4);z-index:2;";`;
if (app.includes(OLD_ATTACH_BADGE)) app = app.replace(OLD_ATTACH_BADGE, NEW_ATTACH_BADGE);

// ---------- CSS Round24 ----------
const CSS_R24 = `

/* ============================================================
 * Round24：记录页新开钟 · 多钟条文案钮 · 导图+ · 工具栏横竖 · 画板安全区
 * ============================================================ */
.cell.timing, .cell.timing-paused, .realm-record .cell {
  overflow: visible;
}
.cell-timer-controls {
  z-index: 12 !important;
  pointer-events: auto !important;
}
.cell-timer-controls .cell-timer-btn,
.cell-timer-controls .cell-timer-end {
  opacity: 1 !important;
  pointer-events: auto !important;
}
.cell-timer-btn.cell-timer-now-label {
  width: auto !important;
  min-width: 52px;
  height: 28px !important;
  padding: 0 8px !important;
  border-radius: 999px !important;
  font-size: 11px !important;
  font-weight: 800 !important;
  letter-spacing: .2px;
  white-space: nowrap;
  background: linear-gradient(135deg, #f59e0b, #fbbf24) !important;
  color: #1a1200 !important;
  box-shadow: 0 2px 10px rgba(251,191,36,.55);
}
.rcs-sum b.newc { color: #fbbf24; }
.rcs-chip {
  border-radius: 14px !important;
  flex-wrap: wrap;
  max-width: 100%;
  gap: 6px !important;
}
.rcs-chip .rcs-btn {
  width: auto !important;
  min-width: 44px;
  height: 32px !important;
  padding: 0 10px !important;
  border-radius: 999px !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  background: rgba(255,255,255,.28) !important;
  color: #fff !important;
  border: none;
  touch-action: manipulation;
}
.rcs-chip .rcs-btn.rcs-end { background: rgba(239,68,68,.85) !important; }
.rcs-ops .rcs-newclock {
  min-height: 40px;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 800;
  border: none;
  cursor: pointer;
  touch-action: manipulation;
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  color: #1a1200;
  box-shadow: 0 3px 12px rgba(251,191,36,.45);
}
.period-tab, .realm-tab, .settings-tab, .iv-tab, .qa-vs-tab, .pc-tab {
  pointer-events: auto !important;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  position: relative;
  z-index: 3;
}
.mm-add-btn circle { filter: drop-shadow(0 2px 6px rgba(0,0,0,.35)); }
.mm-add-btn:active circle { fill: #fbbf24; }

/* 主工具栏：竖屏换行堆叠，横屏可横滑 */
@media (orientation: portrait), (max-width: 720px) {
  .toolbar {
    display: flex !important;
    flex-wrap: wrap !important;
    overflow-x: visible !important;
    gap: 6px !important;
    align-items: stretch;
  }
  .toolbar-group {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    border-right: none !important;
    padding-right: 0 !important;
    margin-right: 0 !important;
    width: 100%;
  }
  .toolbar .tool-btn {
    flex: 1 1 calc(50% - 6px);
    min-height: 40px;
    justify-content: center;
  }
  .mm-toolbar {
    display: flex !important;
    flex-wrap: wrap !important;
    overflow-x: visible !important;
    max-height: none;
    gap: 6px !important;
    justify-content: flex-start !important;
  }
  .mm-toolbar .mm-tb, .mm-tb {
    flex: 1 1 calc(33.33% - 6px);
    min-height: 44px;
    min-width: 0 !important;
  }
  .mm-float-bar.mm-float-dock {
    flex-wrap: wrap !important;
    overflow-x: visible !important;
    max-height: 42vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .mm-body {
    flex: 1 1 auto;
    min-height: 0;
    height: auto;
  }
  .mm-canvas {
    inset: 0;
    top: 0; right: 0; bottom: 0; left: 0;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: max(8px, env(safe-area-inset-bottom, 0px));
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
    box-sizing: border-box;
  }
  .mm-dialog, .mm-wrap {
    height: 100%;
    max-height: 100dvh;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .mm-head { flex: 0 0 auto; }
  .mm-hint {
    bottom: max(72px, calc(env(safe-area-inset-bottom, 0px) + 64px)) !important;
  }
  .mm-stats {
    bottom: max(8px, env(safe-area-inset-bottom, 0px)) !important;
  }
}
@media (orientation: landscape) and (max-height: 520px) {
  .toolbar {
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch;
  }
  .toolbar-group { width: auto; flex-wrap: nowrap; }
  .toolbar .tool-btn { flex: 0 0 auto; }
  .mm-toolbar {
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
  }
  .mm-toolbar .mm-tb { flex: 0 0 auto; }
  .mm-float-bar.mm-float-dock {
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
  }
}
@media (pointer: coarse), (max-width: 720px) {
  .cell-timer-btn.cell-timer-now-label {
    min-width: 58px; height: 34px !important; font-size: 12px !important;
  }
  .record-clock-strip .rcs-chip .rcs-btn {
    min-width: 48px; height: 36px !important; font-size: 12.5px !important;
  }
  .rcs-ops .rcs-newclock { min-height: 44px; font-size: 14px; }
}
`;

if (!css.includes("Round24：记录页新开钟")) {
  css += CSS_R24;
}

// ---------- HTML / SW / gradle version stamps ----------
html = html.replace(/\?v=20260904r23/g, "?v=20260904r24");
sw = sw.replace(/mandala-v121/g, "mandala-v122");
sw = sw.replace(/v121 Round23[^\n]*/, "v122 Round24：记录页新开钟 UI · 导图+ · 标签/工具栏/画板");
gradle = gradle.replace(/versionCode 121/, "versionCode 122");
gradle = gradle.replace(/versionName "2\.7\.24\.121"/, 'versionName "2.7.24.122"');

fs.writeFileSync(appPath, app);
fs.writeFileSync(cssPath, css);
fs.writeFileSync(htmlPath, html);
fs.writeFileSync(swPath, sw);
fs.writeFileSync(gradlePath, gradle);

// ROUND24.md
const md = `# Round 24（v2.7.24·122）· 记录页新开钟 UI + 导图「+」+ 标签/工具栏/画板

日期：2026-09-04  
范围：\`d:\\\\Downloads\\\\mandala-shichen\`  
承接：Round23（v121）→ **用户纠偏：记录页按钮缺失、导图加节点、标签失效、工具栏横竖不搭、画板不适配**

---

## 用户反馈

1. **记录页没有按钮**（「你没有按钮添加上去啊在记录页面以及他的机制你知道吗」）  
2. 思维导图需要 **+** 新建节点与分支  
3. **标签按钮点不动**  
4. **功能栏全横排**，横竖屏不搭边  
5. 导图画板未自动适配安卓安全区 / 视口

---

## 记录页 · 多钟机制（本轮写清）

| 状态 | UI | 行为 |
|------|----|------|
| **在跑** | 格子 ⏸暂停 + ■结束；多钟条「暂停 / 下一钟 / 结束」 | **不**刷常驻「启动/新开钟」 |
| **已暂停且无一在跑** | 当前时刻格琥珀文案钮 **「新开钟」** + 多钟条顶部 **「▶ 新开钟」** | 上一口**保持暂停**；在当前时刻格（或下一空格）开新事项 |
| **多钟条 chip** | 每口钟显式 **恢复/暂停 · 下一钟 · 结束** | 与通知栏同源逻辑；\`data-rcs\` 事件委托 |

机制要点：任意时刻最多一口在跑；开新钟会自动暂停其他在跑钟；■ 结束 → 命名写入记录。

---

## 本轮完成

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 新开钟 UI | ✅ | 格子文案钮 + 条内琥珀钮；\`startFreshNewClock\` |
| 多钟条文案键 | ✅ | 暂停/恢复/下一钟/结束可见可点 |
| 导图节点/分支 + | ✅ | \`data-mm-add\` 节点右侧 + 边中点；触屏/鼠标 |
| 标签切换 | ✅ | 天地人 pointerup；时辰同；设置标签委托+null 防护 |
| 工具栏横竖 | ✅ | 竖屏换行堆叠；横屏横滑 |
| 画板安全区 | ✅ | mm-dialog/body/canvas flex + safe-area |
| 版本信号 | ✅ | APP_BUILD / SW / versionCode → **122** |

---

## 版本信号

| 信号 | 值 |
|------|-----|
| \`APP_BUILD\` | **122** |
| SW | \`mandala-v122\` |
| 缓存戳 | \`?v=20260904r24\` |
| Android | \`versionCode 122\` / \`versionName 2.7.24.122\` |
| APK | \`apk/mandala-v2.7.24-v122.apk\`（若本机构建成功） |

## 改动文件

- \`www/app.js\` — 新开钟、多钟条、导图+、标签加固、版本 122
- \`www/styles.css\` — 新开钟/条钮/工具栏横竖/画板安全区
- \`www/sw.js\` / \`www/index.html\` / \`android/app/build.gradle\`
- \`ROUND24.md\`
`;

fs.writeFileSync(path.join(ROOT, "ROUND24.md"), md);

console.log("Round24 patch OK → APP_BUILD 122");
console.log("Checks:", {
  build: app.includes("APP_BUILD = 122"),
  fresh: app.includes("function startFreshNewClock"),
  label: app.includes("新开钟"),
  mmAdd: app.includes("data-mm-add"),
  rcsNew: app.includes('data-rcs="new-clock"'),
  css: css.includes("Round24：记录页新开钟"),
  sw: sw.includes("mandala-v122"),
  gradle: gradle.includes("versionCode 122"),
});

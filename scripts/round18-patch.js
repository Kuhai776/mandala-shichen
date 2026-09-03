/**
 * Round18 kickoff patch — next-clock label in notif + edge-rail layout helper + bump 116
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const write = (p, s) => {
  fs.writeFileSync(path.join(root, p), s.replace(/\r\n/g, "\n"), "utf8");
  console.log("wrote", p);
};

let app = read("www/app.js");

if (!app.includes("APP_BUILD = 116")) {
  app = app.replace("const APP_BUILD = 115;", "const APP_BUILD = 116;");
  if (!app.includes("2.7.24·116")) {
    app = app.replace(
      `{ v: "2.7.24·115", date: "2026-09-03", items: [
      "Round17：边轨/多钟/溢出徽章/导图改名同步格子 · 通知栏节流+切钟+记任务",
      "Round17：安卓开钟钮触控加固 · 主题一致性 · 通知/边轨/导图轻量边界助手",
    ]},`,
      `{ v: "2.7.24·116", date: "2026-09-03", items: [
      "Round18：通知栏展示下一口钟名 · 边轨定位纯函数外置 · 切钟文案收紧",
    ]},
    { v: "2.7.24·115", date: "2026-09-03", items: [
      "Round17：边轨/多钟/溢出徽章/导图改名同步格子 · 通知栏节流+切钟+记任务",
      "Round17：安卓开钟钮触控加固 · 主题一致性 · 通知/边轨/导图轻量边界助手",
    ]},`
    );
  }
}

const oldBody = `const body = status + " · " + cellLabel + (list.length > 1 ? " · 共" + list.length + "口钟 · 可切钟" : "");`;
const newBody = `let body = status + " · " + cellLabel;
      if (list.length > 1) {
        const idx = list.findIndex((t) => t === run || (t.period === run.period && t.cell === run.cell));
        const nxt = list[((idx < 0 ? 0 : idx) + 1) % list.length];
        const nxtLab = trunc(String((nxt && nxt.taskText) || "任务"), 10);
        body += " · 共" + list.length + "口 · 下一口「" + nxtLab + "」";
      }`;
if (app.includes("下一口「")) console.log("skip notif next label");
else if (app.includes(oldBody)) app = app.replace(oldBody, newBody);
else console.log("WARN: notif body pattern missing");

const oldPos = `    const gr = grid.getBoundingClientRect();
    if (!gr.width || gr.bottom < 40) return;
    const top = Math.max(8, Math.round(gr.top));
    const bottomSafe = 72 + (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom")) || 0);
    const maxH = Math.max(180, Math.min(Math.round(gr.height + 28), window.innerHeight - top - bottomSafe));
    drawer.style.top = top + "px";
    drawer.style.maxHeight = maxH + "px";
    // 贴在九宫格左缘内侧，窄屏仍保最小边距
    const left = Math.max(4, Math.min(14, Math.round(gr.left) - 2));
    drawer.style.left = left + "px";`;

const newPos = `    const gr = grid.getBoundingClientRect();
    // Round18：定位算法外置 MandalaR17.computeEdgeRailLayout（失败则本地兜底）
    const R = _r17();
    const layout = (R && R.computeEdgeRailLayout)
      ? R.computeEdgeRailLayout(gr, window.innerHeight, parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom")) || 0)
      : null;
    if (layout) {
      drawer.style.top = layout.top + "px";
      drawer.style.maxHeight = layout.maxHeight + "px";
      drawer.style.left = layout.left + "px";
      return;
    }
    if (!gr.width || gr.bottom < 40) return;
    const top = Math.max(8, Math.round(gr.top));
    const bottomSafe = 72 + (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom")) || 0);
    const maxH = Math.max(180, Math.min(Math.round(gr.height + 28), window.innerHeight - top - bottomSafe));
    drawer.style.top = top + "px";
    drawer.style.maxHeight = maxH + "px";
    const left = Math.max(4, Math.min(14, Math.round(gr.left) - 2));
    drawer.style.left = left + "px";`;

if (app.includes("computeEdgeRailLayout")) console.log("skip edge rail layout wire");
else if (app.includes(oldPos)) app = app.replace(oldPos, newPos);
else console.log("WARN: positionEdgeRail pattern missing");

write("www/app.js", app);

let helpers = read("www/lib/r17-helpers.js");
if (!helpers.includes("computeEdgeRailLayout")) {
  helpers = helpers.replace(
    "  global.MandalaR17 = {",
    `  function computeEdgeRailLayout(gr, viewportH, safeBottom) {
    if (!gr || !gr.width || gr.bottom < 40) return null;
    var top = Math.max(8, Math.round(gr.top));
    var bottomSafe = 72 + (safeBottom || 0);
    var maxHeight = Math.max(180, Math.min(Math.round(gr.height + 28), (viewportH || 800) - top - bottomSafe));
    var left = Math.max(4, Math.min(14, Math.round(gr.left) - 2));
    return { top: top, maxHeight: maxHeight, left: left };
  }

  global.MandalaR17 = {`
  );
  helpers = helpers.replace(
    "    buildTaskLocMap: buildTaskLocMap,",
    "    buildTaskLocMap: buildTaskLocMap,\n    computeEdgeRailLayout: computeEdgeRailLayout,"
  );
  write("www/lib/r17-helpers.js", helpers);
} else {
  console.log("skip helpers edge layout");
}

let html = read("www/index.html");
html = html.replace(/20260903r17/g, "20260903r18").replace(/20260903r16/g, "20260903r18");
write("www/index.html", html);

let sw = read("www/sw.js");
sw = sw.replace(/mandala-v11[56]/g, "mandala-v116");
if (!sw.includes("Round18")) {
  sw = sw.replace(/\/\/ v11[56][^\n]*/, "// v116 Round18：通知下一口钟名 + 边轨定位外置");
}
write("www/sw.js", sw);

let gradle = read("android/app/build.gradle");
gradle = gradle.replace(/versionCode 11[56]/, "versionCode 116");
gradle = gradle.replace(/versionName "2\.7\.24\.11[56]"/, 'versionName "2.7.24.116"');
write("android/app/build.gradle", gradle);

console.log("Round18 patch done");

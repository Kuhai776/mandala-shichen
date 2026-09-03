const fs = require("fs");
const app = fs.readFileSync("www/app.js", "utf8");
const css = fs.readFileSync("www/styles.css", "utf8");
const html = fs.readFileSync("www/index.html", "utf8");
const checks = [
  ["APP_BUILD = 115", app.includes("APP_BUILD = 115")],
  ["2.7.24·115", app.includes("2.7.24·115")],
  ["TIMER_NOTIF_ID 16115", app.includes("TIMER_NOTIF_ID = 16115")],
  ["cycleNextRunningTimer", app.includes("cycleNextRunningTimer")],
  ["notifQuickAddTask", app.includes("notifQuickAddTask")],
  ["syncMindmapRenameToCells", app.includes("function syncMindmapRenameToCells")],
  ["editNode sync", app.includes("syncMindmapRenameToCells(oldT, v)")],
  ["panel sync", app.includes("syncMindmapRenameToCells(oldT, n.text)")],
  ["fireNow touch", app.includes("fireNow")],
  ["notif tick 5s", app.includes("_notifTickN % 5")],
  ["overflow chip", app.includes("record-overflow-chip") && css.includes("record-overflow-badge")],
  ["MandalaR17 helpers file", fs.existsSync("www/lib/r17-helpers.js")],
  ["html loads r17-helpers", html.includes("r17-helpers.js")],
  ["cache 20260903r17", html.includes("20260903r17")],
  ["mandala-v115", fs.readFileSync("www/sw.js", "utf8").includes("mandala-v115")],
  ["versionCode 115", fs.readFileSync("android/app/build.gradle", "utf8").includes("versionCode 115")],
  ["ROUND17.md", fs.existsSync("ROUND17.md")],
  ["no quick-timer-bubble", !app.includes("renderQuickTimerBubble") && !css.includes("quick-timer-bubble")],
];
let fail = 0;
checks.forEach(([name, ok]) => {
  console.log(ok ? "OK" : "FAIL", name);
  if (!ok) fail++;
});
console.log("failCount", fail);
process.exitCode = fail ? 1 : 0;

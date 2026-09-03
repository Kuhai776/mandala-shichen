const fs = require("fs");
const app = fs.readFileSync("www/app.js", "utf8");
const css = fs.readFileSync("www/styles.css", "utf8");
const checks = [
  ["APP_BUILD = 114", app.includes("APP_BUILD = 114")],
  ["2.7.24·114", app.includes("2.7.24·114")],
  ["syncTimerNotification", app.includes("syncTimerNotification")],
  ["getLocalNotifications", app.includes("getLocalNotifications")],
  ["mandala_timer_actions", app.includes("mandala_timer_actions")],
  ["LocalNotifications plugin ref", app.includes("LocalNotifications")],
  ["no renderQuickTimerBubble", !app.includes("renderQuickTimerBubble")],
  ["no quick-timer-bubble css", !css.includes("quick-timer-bubble")],
  ["cell-timer-now", app.includes("cell-timer-now") && css.includes("cell-timer-now")],
  ["mandala-v114", fs.readFileSync("www/sw.js", "utf8").includes("mandala-v114")],
  ["versionCode 114", fs.readFileSync("android/app/build.gradle", "utf8").includes("versionCode 114")],
  ["POST_NOTIFICATIONS", fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8").includes("POST_NOTIFICATIONS")],
  ["package local-notifications", fs.readFileSync("package.json", "utf8").includes("@capacitor/local-notifications")],
  ["cache 20260903r16", fs.readFileSync("www/index.html", "utf8").includes("20260903r16")],
  ["ROUND16.md", fs.existsSync("ROUND16.md")],
];
let fail = 0;
checks.forEach(([name, ok]) => {
  console.log(ok ? "OK" : "FAIL", name);
  if (!ok) fail++;
});
console.log("failCount", fail);
process.exitCode = fail ? 1 : 0;

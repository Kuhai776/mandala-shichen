const fs = require("fs");
const app = fs.readFileSync("www/app.js", "utf8");
const css = fs.readFileSync("www/styles.css", "utf8");
const keys = [
  ["APP_BUILD = 113", app],
  ["2.7.24·113", app],
  ["commitTimerWithOverflow", app],
  ["commitTimerWithOverflow(period, cell", app],
  ["cell-timer-now", app],
  ["depends_on / link", app],
  ["resolveLinkTarget", app],
  ["优先拖节点", app],
  ["runFloatAction", app],
  ['data-mode="swap"', app],
  ["mode === \"swap\"", app],
  ["renderQuickTimerBubble", app],
  ["Round14/15", css],
  ["quick-timer-bubble", css],
  ["cell-timer-now", css],
  ["mandala-v113", fs.readFileSync("www/sw.js", "utf8")],
  ["versionCode 113", fs.readFileSync("android/app/build.gradle", "utf8")],
  ["20260903r14", fs.readFileSync("www/index.html", "utf8")],
];
let fail = 0;
keys.forEach(([k, src]) => {
  const ok = src.includes(k);
  console.log(ok ? "OK" : "FAIL", k);
  if (!ok) fail++;
});
console.log("ROUND14", fs.existsSync("ROUND14.md"));
console.log("failCount", fail);

// syntax check app.js lightly
try {
  require("vm").runInNewContext(app.replace(/^/, "var window={},document={getElementById:()=>null},navigator={};"), Object.create(null), { timeout: 1000 });
} catch (e) {
  // IIFE apps usually fail without DOM — just check for obvious SyntaxError location
  const msg = String(e && e.message || e);
  if (/Unexpected|SyntaxError|Identifier/.test(msg) && !/is not defined|Cannot read/.test(msg)) {
    console.log("SYNTAX?", msg.slice(0, 200));
  } else {
    console.log("load-note", msg.slice(0, 120));
  }
}

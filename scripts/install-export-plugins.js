/**
 * Round10：无系统 npm 时，用 Node 拉取 Cap6 兼容的 Share / Filesystem。
 * 打 APK 前仍需：npx cap sync android
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
// 与 @capacitor/core@6 对齐（勿装 7+/8+）
const pkgs = [
  { name: "@capacitor/share", version: "6.0.3" },
  { name: "@capacitor/filesystem", version: "6.0.3" },
];

async function getJson(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(u + " " + r.status);
  return r.json();
}
async function getBuf(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(u + " " + r.status);
  return Buffer.from(await r.arrayBuffer());
}

async function install(name, version) {
  const meta = await getJson("https://registry.npmjs.org/" + name.replace("/", "%2F") + "/" + version);
  const tgz = meta.dist.tarball;
  console.log("install", name, meta.version);
  const buf = await getBuf(tgz);
  const safe = name.replace(/[@/]/g, "_");
  const tmp = path.join(root, ".tmp-" + safe + ".tgz");
  fs.writeFileSync(tmp, buf);
  const dest = path.join(root, "node_modules", ...name.split("/"));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const extractDir = path.join(root, ".tmp-extract-" + safe);
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  try {
    execSync('tar -xzf "' + tmp + '" -C "' + extractDir + '"', { stdio: "inherit" });
    const pkgDir = path.join(extractDir, "package");
    if (!fs.existsSync(pkgDir)) throw new Error("tarball missing package/");
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(pkgDir, dest);
    console.log("ok", dest);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
}

(async () => {
  for (const p of pkgs) await install(p.name, p.version);
  console.log("done. Next: npx cap sync android");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

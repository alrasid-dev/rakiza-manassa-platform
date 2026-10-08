// scripts/archive-women-templates.mjs — أرشفة قوالب القسم النسائي (unitId=5) بدون حذف
// dry-run (افتراضي): snapshot + عرض القائمة فقط. --execute: يُنفّذ isActive=0.
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const EXECUTE = process.argv.includes("--execute");
function env(key) {
  for (const line of fs.readFileSync(path.resolve(".env.production.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("="); if (e === -1) continue;
    if (t.slice(0, e).trim() !== key) continue;
    let v = t.slice(e + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}
const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true,
});

const [all] = await db.query("SELECT * FROM task_templates WHERE unitId = 5 ORDER BY isActive DESC, id");
const active = all.filter(t => t.isActive === 1 || t.isActive === true);

// snapshot كامل
const stamp = new Date().toISOString().slice(0, 10);
const snapPath = path.resolve("backups", `women-templates-archive-${stamp}.json`);
fs.writeFileSync(snapPath, JSON.stringify(all, null, 2), "utf8");

console.log(`إجمالي قوالب unit=5: ${all.length} | نشط: ${active.length} | معطَّل: ${all.length - active.length}`);
console.log(`snapshot → ${snapPath}`);
console.log("\n=== القوالب النشطة التي ستُعطَّل ===");
console.log("id | title | frequency | assigneeProfileId");
for (const t of active) console.log(`${t.id} | ${t.title} | ${t.frequency} | ${t.defaultAssigneeProfileId}`);

if (EXECUTE) {
  const [res] = await db.query("UPDATE task_templates SET isActive = 0, updatedAt = NOW() WHERE unitId = 5 AND isActive = 1");
  console.log(`\nتم التعطيل: ${res.affectedRows} قالب (isActive=0). لا حذف.`);
} else {
  console.log("\n(وضع dry-run — لم يُنفَّذ أي تعديل. شغّل مع --execute للتنفيذ)");
}
await db.end();

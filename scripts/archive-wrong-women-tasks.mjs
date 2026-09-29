// scripts/archive-wrong-women-tasks.mjs — المرحلة 3: أرشفة المهام الخاطئة + إيقاف القوالب (unitId=5)
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
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
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 4000), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza", ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true });

const [tasks] = await db.query("SELECT id, title FROM tasks WHERE unitId = 5 AND archivedAt IS NULL ORDER BY id");
console.log(`المهام التي ستُؤرشف: ${tasks.length}`);
for (const t of tasks) console.log(`  #${t.id} ${t.title.slice(0, 60)}`);
const [ar] = await db.query("UPDATE tasks SET archivedAt = NOW(), archivedByUserId = 0, cancellationReason = 'إعادة استيراد - ملف مصحح' WHERE unitId = 5 AND archivedAt IS NULL");
console.log(`\nأُرشفت: ${ar.affectedRows} مهمة`);

const [tpls] = await db.query("SELECT id, title FROM task_templates WHERE unitId = 5 AND isActive = 1 ORDER BY id");
console.log(`\nالقوالب التي ستُوقف: ${tpls.length}`);
for (const t of tpls) console.log(`  #${t.id} ${t.title.slice(0, 60)}`);
const [dt] = await db.query("UPDATE task_templates SET isActive = 0 WHERE unitId = 5");
console.log(`\nأُوقفت: ${dt.affectedRows} قالبًا`);

await db.end();

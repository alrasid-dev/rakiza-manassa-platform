// scripts/archive-erroneous-generated-tasks.mjs — المهمة 4: تنظيف المهام المولّدة بالخطأ (أرشفة فقط)
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function env(key) {
  for (const line of fs.readFileSync(path.resolve(".env.production.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("=");
    if (e === -1) continue;
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
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true, bigNumberStrings: true,
});

const SELECT = `SELECT id, title, unitId, assigneeProfileId, templateId, createdAt
  FROM tasks
  WHERE templateId IS NOT NULL
    AND createdAt >= CURDATE()
    AND archivedAt IS NULL
  ORDER BY createdAt`;

const [rows] = await db.query(SELECT);
console.log(`=== المهام المولّدة اليوم غير المؤرشفة: ${rows.length} ===`);
for (const r of rows) console.log(`#${r.id}\tunit=${r.unitId}\ttpl=${r.templateId}\tassignee=${r.assigneeProfileId}\t${r.createdAt?.toISOString?.() ?? r.createdAt}\t${r.title}`);

if (rows.length === 0) {
  console.log("لا توجد مهام لأرشفتها.");
  await db.end();
  process.exit(0);
}

const [result] = await db.query(
  `UPDATE tasks SET archivedAt = NOW(), archivedByUserId = 0, cancellationReason = 'تنظيف: مولّدة قبل إصلاح القوالب'
   WHERE templateId IS NOT NULL AND createdAt >= CURDATE() AND archivedAt IS NULL`
);
console.log(`\nتمت أرشفة ${result.affectedRows} مهمة.`);
await db.end();

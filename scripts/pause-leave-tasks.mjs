// scripts/pause-leave-tasks.mjs
// إيقاف مؤقت للمهام المفتوحة لكل موظف في إجازة (شامل) — معاينة أولاً ثم تنفيذ.
// الاستخدام:
//   node scripts/pause-leave-tasks.mjs            → معاينة فقط (dry-run)
//   node scripts/pause-leave-tasks.mjs --execute  → تنفيذ الإيقاف المؤقت

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    if (t.slice(0, eq).trim() !== key) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

const execute = process.argv.includes("--execute");
const rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
if (!rawUrl) { console.error("DATABASE_URL not found in .env.production.local"); process.exit(1); }
const url = new URL(rawUrl);
const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";

const connection = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 4000),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database,
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true,
  bigNumberStrings: true,
});

// المرحلة أ: معاينة مهام المجازين المفتوحة.
const [profiles] = await connection.query(
  `SELECT id, fullName, status FROM person_profiles WHERE status = 'on_leave'`
);
console.log(`\n👥 الموظفون في إجازة: ${profiles.length}`);

const [tasks] = await connection.query(
  `SELECT t.id, t.title, t.status, t.assigneeProfileId, p.fullName
   FROM tasks t
   JOIN person_profiles p ON p.id = t.assigneeProfileId
   WHERE p.status = 'on_leave'
     AND t.archivedAt IS NULL
     AND t.status IN ('new', 'in_progress', 'under_review', 'overdue')`
);
console.log(`📋 مهامهم المفتوحة (قابلة للإيقاف المؤقت): ${tasks.length}`);
for (const t of tasks) {
  console.log(`  - [${t.id}] ${t.status} → ${t.fullName}: ${t.title}`);
}

if (!execute) {
  console.log("\n⚠️  وضع المعاينة فقط. للتنفيذ أعد التشغيل مع --execute");
  await connection.end();
  process.exit(0);
}

// المرحلة ب: الإيقاف المؤقت.
if (tasks.length > 0) {
  const [result] = await connection.query(
    `UPDATE tasks t
     JOIN person_profiles p ON p.id = t.assigneeProfileId
     SET
       t.status = 'paused',
       t.pausedAt = NOW(),
       t.pausedReason = 'الموظف في إجازة',
       t.pauseType = 'temporary'
     WHERE p.status = 'on_leave'
       AND t.archivedAt IS NULL
       AND t.status IN ('new', 'in_progress', 'under_review', 'overdue')`
  );
  console.log(`\n✅ تم إيقاف ${result.affectedRows} مهمة مؤقتاً (موظف في إجازة).`);
} else {
  console.log("\nلا توجد مهام مفتوحة لموظفين في إجازة.");
}

await connection.end();

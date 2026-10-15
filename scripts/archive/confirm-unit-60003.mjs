// scripts/archive/confirm-unit-60003.mjs
// قراءة فقط: تأكيد قوائم قسم 60003 قبل التنظيف (بدون أي تعديل على البيانات).
// node scripts/archive/confirm-unit-60003.mjs
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function env(key) {
  for (const file of [".env", ".env.production.local"]) {
    const p = path.resolve(file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const e = t.indexOf("=");
      if (e === -1) continue;
      if (t.slice(0, e).trim() !== key) continue;
      let v = t.slice(e + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v;
    }
  }
  return null;
}

const rawUrl = env("DATABASE_URL");
if (!rawUrl) {
  console.error("DATABASE_URL غير موجود في .env أو .env.production.local");
  process.exit(1);
}

const u = new URL(rawUrl);
const db = await mysql.createConnection({
  host: u.hostname,
  port: Number(u.port || 4000),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true,
  bigNumberStrings: true,
  timezone: "Z",
});

console.log("متصل بـ " + (u.pathname.replace(/^\//, "") || "rakiza") + " @ " + u.hostname + "\n");

// 1) المهام الجديدة
const [tasks] = await db.query(
  "SELECT id, title, status, createdAt, archivedAt FROM tasks WHERE unitId = 60003 AND status = 'new' AND archivedAt IS NULL ORDER BY id"
);
console.log("=== 1) المهام الجديدة (unitId=60003, status='new', archivedAt IS NULL): " + tasks.length + " ===");
for (const r of tasks) {
  console.log(`  #${r.id} | ${String(r.title || "").slice(0, 60)} | ${r.status} | createdAt=${r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 16) : "NULL"}`);
}

// 2) القوالب
const [templates] = await db.query(
  "SELECT id, title, isActive, lastGeneratedAt FROM task_templates WHERE unitId = 60003 ORDER BY id"
);
console.log("\n=== 2) القوالب (unitId=60003): " + templates.length + " ===");
for (const r of templates) {
  console.log(`  #${r.id} | isActive=${r.isActive} | ${String(r.title || "").slice(0, 60)}`);
}

// 3) الموظفون النشطون
const [employees] = await db.query(
  "SELECT id, userId, fullName, unitId, attendanceMode, status FROM person_profiles WHERE unitId = 60003 AND status = 'active' ORDER BY id"
);
console.log("\n=== 3) الموظفون النشطون (unitId=60003, status='active'): " + employees.length + " ===");
for (const r of employees) {
  console.log(`  #${r.id} | userId=${r.userId ?? "NULL"} | ${String(r.fullName || "").slice(0, 40)} | attendanceMode=${r.attendanceMode ?? "NULL"} | status=${r.status}`);
}

// 4) كل المهام في القسم (أي حالة، لفهم الوضع الكامل)
const [allTasks] = await db.query(
  "SELECT id, title, status, archivedAt, createdAt FROM tasks WHERE unitId = 60003 ORDER BY status, id"
);
console.log("\n=== 4) كل المهام في القسم (أي حالة): " + allTasks.length + " ===");
for (const r of allTasks) {
  console.log(`  #${r.id} | ${r.status.padEnd(12)} | archived=${r.archivedAt ? "Y" : "N"} | ${String(r.title || "").slice(0, 55)}`);
}

await db.end();

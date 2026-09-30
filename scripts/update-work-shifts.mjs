#!/usr/bin/env node
/**
 * scripts/update-work-shifts.mjs
 * تحديث أوقات الوردية الأساسية (isDefault=1) إلى السياسة الجديدة 07:00 → 14:59.
 * لا يستخدم drizzle-kit؛ ينفّذ UPDATE مباشرة عبر TiDB.
 * الاستخدام: node scripts/update-work-shifts.mjs
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function readEnv(filePath, key) {
  if (!fs.existsSync(filePath)) return null;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

const raw = readEnv(path.resolve(".env.production.local"), "DATABASE_URL") || process.env.DATABASE_URL;
if (!raw) { console.error("DATABASE_URL غير موجود"); process.exit(1); }
const url = new URL(raw);
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 4000),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
});

// السياسة الجديدة (دقائق من منتصف الليل بتوقيت الرياض).
const TARGET = {
  fingerprintOpenMinutes: 420,               // 07:00 فتح البصمة
  startMinutes: 450,                         // 07:30 بداية الدوام
  lateStartMinutes: 480,                     // 08:00 فتح التأخير
  morningCompensationDeadlineMinutes: 495,   // 08:15 آخر تعويض
  endMinutes: 855,                           // 14:15 نهاية الدوام
  actualEndMinutes: 855,                     // 14:15 نهاية الدوام الفعلية
  eveningCompensationDeadlineMinutes: 885,   // 14:45 آخر خروج
  fingerprintCloseMinutes: 899,              // 14:59 غلق البصمة
};

const [result] = await db.query(
  `UPDATE work_shifts SET
     fingerprintOpenMinutes = ?,
     startMinutes = ?,
     lateStartMinutes = ?,
     morningCompensationDeadlineMinutes = ?,
     endMinutes = ?,
     actualEndMinutes = ?,
     eveningCompensationDeadlineMinutes = ?,
     fingerprintCloseMinutes = ?,
     updatedAt = NOW()
   WHERE isDefault = 1`,
  [
    TARGET.fingerprintOpenMinutes,
    TARGET.startMinutes,
    TARGET.lateStartMinutes,
    TARGET.morningCompensationDeadlineMinutes,
    TARGET.endMinutes,
    TARGET.actualEndMinutes,
    TARGET.eveningCompensationDeadlineMinutes,
    TARGET.fingerprintCloseMinutes,
  ]
);
console.log("Affected rows: " + result.affectedRows);

const [rows] = await db.query(
  `SELECT id, code, name, isDefault, isActive,
     fingerprintOpenMinutes, startMinutes, lateStartMinutes,
     morningCompensationDeadlineMinutes, endMinutes, actualEndMinutes,
     eveningCompensationDeadlineMinutes, fingerprintCloseMinutes, workingDays
   FROM work_shifts WHERE isDefault = 1`
);
console.table(rows);
await db.end();

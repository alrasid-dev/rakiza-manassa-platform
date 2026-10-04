#!/usr/bin/env node
/**
 * scripts/clean-invalid-confirmations.mjs
 * إلغاء تكليفات تأكيد الحضور الشاذة (pending) وفق معايير الأهلية:
 *  - ملف غير نشط (on_leave / inactive / dormant / pending_*)
 *  - وضع حضور ليس remote/mixed (حضوري أو null)
 *  - لم يسجّل بصمة دخول في يوم التكليف
 *  - سجّل انصرافاً في يوم التكليف
 *  - وقت التكليف خارج نافذة 09:00–13:45
 * يُضيف قيمة 'cancelled' إلى enum ثم يعرض الفئات (المرحلة أ) ثم ينفّذ الإلغاء (المرحلة ب).
 * الاستخدام: node scripts/clean-invalid-confirmations.mjs
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

// 0) إضافة 'cancelled' إلى enum (idempotent)
await db.query(`ALTER TABLE confirmation_assignments MODIFY COLUMN status ENUM('pending','done','missed','cancelled') DEFAULT 'pending' NOT NULL`);
console.log("enum updated: 'cancelled' added");

// المرحلة أ: عرض فئات التكليفات المعلّقة
const [rows] = await db.query(`
  SELECT
    CASE
      WHEN p.status != 'active' THEN 'inactive_status'
      WHEN (p.attendanceMode IS NULL OR p.attendanceMode NOT IN ('remote', 'mixed')) THEN 'in_person'
      WHEN NOT EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.profileId = ca.profileId AND DATE(ar.recordDate) = DATE(ca.scheduledAt) AND ar.checkInAt IS NOT NULL) THEN 'no_checkin'
      WHEN EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.profileId = ca.profileId AND DATE(ar.recordDate) = DATE(ca.scheduledAt) AND ar.checkOutAt IS NOT NULL) THEN 'has_checkout'
      WHEN HOUR(ca.scheduledAt) < 9 OR HOUR(ca.scheduledAt) >= 14 THEN 'out_of_hours'
      ELSE 'valid'
    END as category,
    COUNT(*) as cnt
  FROM confirmation_assignments ca
  JOIN person_profiles p ON p.id = ca.profileId
  WHERE ca.status = 'pending'
  GROUP BY category
  ORDER BY cnt DESC
`);
console.log("=== المرحلة أ: فئات التكليفات المعلّقة ===");
if (rows.length === 0) console.log("(لا توجد تكليفات معلّقة)");
for (const r of rows) console.log(`${r.category}: ${r.cnt}`);

// المرحلة ب: التنفيذ
const [result] = await db.query(`
  UPDATE confirmation_assignments ca
  JOIN person_profiles p ON p.id = ca.profileId
  SET ca.status = 'cancelled'
  WHERE ca.status = 'pending'
    AND (
      p.status != 'active'
      OR p.attendanceMode IS NULL
      OR p.attendanceMode NOT IN ('remote', 'mixed')
      OR HOUR(ca.scheduledAt) < 9
      OR HOUR(ca.scheduledAt) >= 14
      OR NOT EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.profileId = ca.profileId AND DATE(ar.recordDate) = DATE(ca.scheduledAt) AND ar.checkInAt IS NOT NULL)
      OR EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.profileId = ca.profileId AND DATE(ar.recordDate) = DATE(ca.scheduledAt) AND ar.checkOutAt IS NOT NULL)
    )
`);
console.log("=== المرحلة ب: التنفيذ ===");
console.log("Affected rows: " + result.affectedRows);

await db.end();

#!/usr/bin/env node
/**
 * scripts/clean-leave-negative-points.mjs
 * تنظيف مساءلات ونقاط الموظفين في إجازة (status='on_leave'):
 * 1) صفر negativeMinutes و penaltyMinutes في attendance_records.
 * 2) حذف approval_requests (disciplinary_action) المرتبطة.
 * 3) حذف score_events السلبية (points < 0) المرتبطة.
 * يعرض ملخصاً قبل التنفيذ ثم ينفّذ.
 * الاستخدام: node scripts/clean-leave-negative-points.mjs
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

const [profiles] = await db.query("SELECT id, fullName FROM person_profiles WHERE status='on_leave'");
const ids = profiles.map(r => r.id);
if (!ids.length) {
  console.log("لا يوجد موظفون في إجازة. لا شيء للتنظيف.");
  await db.end();
  process.exit(0);
}

const [records] = await db.query("SELECT id, negativeMinutes, penaltyMinutes FROM attendance_records WHERE profileId IN (?) AND (negativeMinutes > 0 OR penaltyMinutes > 0)", [ids]);
const [approvals] = await db.query("SELECT id FROM approval_requests WHERE entityType='disciplinary_action' AND entityId IN (?)", [ids]);
const [scoreEvents] = await db.query("SELECT id, points FROM score_events WHERE profileId IN (?) AND points < 0", [ids]);

console.log("=== ملخص قبل التنفيذ (dry-run) ===");
console.log(`موظفون في إجازة: ${profiles.length}`);
console.log(`سجلات حضور ستُصفَّر (negativeMinutes/penaltyMinutes): ${records.length}`);
console.log(`مساءلات تأديبية ستُحذف: ${approvals.length}`);
console.log(`أحداث نقاط سلبية ستُحذف: ${scoreEvents.length}`);
console.log("=== التنفيذ ===");

const [r1] = await db.query("UPDATE attendance_records SET negativeMinutes = 0, penaltyMinutes = 0, updatedAt = NOW() WHERE profileId IN (?) AND (negativeMinutes > 0 OR penaltyMinutes > 0)", [ids]);
const [r2] = await db.query("DELETE FROM approval_requests WHERE entityType='disciplinary_action' AND entityId IN (?)", [ids]);
const [r3] = await db.query("DELETE FROM score_events WHERE profileId IN (?) AND points < 0", [ids]);

console.log(`تم التصفير: ${r1.affectedRows} سجل`);
console.log(`تم حذف المساءلات: ${r2.affectedRows}`);
console.log(`تم حذف الأحداث السلبية: ${r3.affectedRows}`);
console.log("اكتمل التنظيف.");
await db.end();

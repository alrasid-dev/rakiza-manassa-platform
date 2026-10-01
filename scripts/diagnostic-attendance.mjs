#!/usr/bin/env node
/**
 * scripts/diagnostic-attendance.mjs
 * تقرير تشخيصي يومي: من لم يبصم اليوم + من بصم دون انصراف + مساءلات اليوم.
 * الاستخدام: node scripts/diagnostic-attendance.mjs
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

// 1) من لم يبصم اليوم (عن بُعد/مختلط).
const [noClock] = await db.query(
  `SELECT p.id, p.fullName, p.unitId FROM person_profiles p
   WHERE p.status = 'active' AND p.attendanceMode IN ('remote','mixed')
     AND NOT EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.profileId = p.id AND DATE(ar.recordDate) = CURDATE())`
);
console.log(`\n[1] عن بُعد/مختلط لم يبصموا اليوم: ${noClock.length}`);

// 2) من بصم دخولاً دون انصراف.
const [noCheckout] = await db.query(
  `SELECT p.fullName, p.unitId FROM attendance_records ar
   JOIN person_profiles p ON p.id = ar.profileId
   WHERE DATE(ar.recordDate) = CURDATE() AND ar.checkInAt IS NOT NULL AND ar.checkOutAt IS NULL`
);
console.log(`[2] بصم دخولاً دون انصراف اليوم: ${noCheckout.length}`);
for (const r of noCheckout) console.log(`   - ${r.fullName}`);

// 3) المساءلات المسجلة اليوم.
const [disciplinary] = await db.query(
  `SELECT status, COUNT(*) AS n FROM approval_requests WHERE entityType = 'disciplinary_action' AND DATE(createdAt) = CURDATE() GROUP BY status`
);
console.log(`[3] مساءلات اليوم: ${disciplinary.reduce((s, r) => s + Number(r.n), 0)}`, disciplinary);

await db.end();

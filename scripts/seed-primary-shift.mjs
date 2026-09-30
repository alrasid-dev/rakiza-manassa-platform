// scripts/seed-primary-shift.mjs — إدخال الوردية الأساسية (افتراضية) في work_shifts
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
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true, bigNumberStrings: true,
});

const [existing] = await db.query("SELECT id FROM work_shifts WHERE code = 'primary' LIMIT 1");
if (existing.length) {
  console.log("الوردية الأساسية موجودة مسبقاً (id = " + existing[0].id + ") — تم التخطي.");
} else {
  // لضمان وردية افتراضية واحدة فقط
  await db.query("UPDATE work_shifts SET isDefault = 0 WHERE isDefault = 1");
  const [ins] = await db.query(
    `INSERT INTO work_shifts
       (code, name, fingerprintOpenMinutes, startMinutes, lateStartMinutes,
        morningCompensationDeadlineMinutes, endMinutes, actualEndMinutes,
        eveningCompensationDeadlineMinutes, fingerprintCloseMinutes,
        workingDays, isDefault, isActive, createdByUserId, createdAt, updatedAt)
     VALUES
       ('primary', 'الوردية الأساسية', 420, 450, 480, 495, 930, 930, 945, 960,
        '0,1,2,3,4', 1, 1, 0, NOW(), NOW())`
  );
  console.log("أُدخلت الوردية الأساسية (id = " + ins.insertId + ")");
}

const [rows] = await db.query(
  "SELECT id, name, isDefault, isActive, fingerprintOpenMinutes, startMinutes, lateStartMinutes, morningCompensationDeadlineMinutes, endMinutes, actualEndMinutes, eveningCompensationDeadlineMinutes, fingerprintCloseMinutes, workingDays FROM work_shifts ORDER BY isDefault DESC, id ASC"
);
console.table(rows);
await db.end();

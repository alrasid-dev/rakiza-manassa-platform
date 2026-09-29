#!/usr/bin/env node
/**
 * scripts/upgrade-secretary-permission.mjs
 * يرفع صلاحية الأمين العام (court_secretary) في access_grants
 * من general_view إلى full_control، ضمن معاملة واحدة.
 * الاستخدام:
 *   node scripts/upgrade-secretary-permission.mjs
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function readEnvValue(filePath, key) {
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

const raw = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || process.env.DATABASE_URL;
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

// تحديد الأمين العام: دور court_secretary نشط.
const [secretaries] = await db.query(
  "SELECT userId FROM court_role_assignments WHERE role='court_secretary' AND isActive=1",
);
const userIds = [...new Set(secretaries.map((row) => row.userId).filter(Boolean))];

const report = { mode: "commit", targets: [], skipped: [] };

await db.beginTransaction();
try {
  for (const userId of userIds) {
    const [grants] = await db.query(
      "SELECT id, userId, fullName, officialEmail, permission FROM access_grants WHERE userId=? AND isActive=1",
      [userId],
    );
    const grant = grants[0];
    if (!grant) {
      report.skipped.push({ userId, reason: "لا يوجد منح وصول نشط" });
      continue;
    }
    if (grant.permission === "full_control") {
      report.skipped.push({ userId, fullName: grant.fullName, officialEmail: grant.officialEmail, reason: "الصلاحية full_control بالفعل" });
      continue;
    }
    if (grant.permission !== "general_view") {
      report.skipped.push({ userId, fullName: grant.fullName, officialEmail: grant.officialEmail, permission: grant.permission, reason: "صلاحية غير متوقعة؛ تُركت كما هي" });
      continue;
    }
    const [result] = await db.query(
      "UPDATE access_grants SET permission='full_control' WHERE userId=? AND isActive=1",
      [userId],
    );
    report.targets.push({
      userId,
      fullName: grant.fullName,
      officialEmail: grant.officialEmail,
      previous: grant.permission,
      next: "full_control",
      affectedRows: result.affectedRows,
    });
  }
  await db.commit();
} catch (err) {
  await db.rollback();
  throw err;
}

console.log(JSON.stringify(report, null, 2));
await db.end();

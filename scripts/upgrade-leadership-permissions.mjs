#!/usr/bin/env node
/**
 * scripts/upgrade-leadership-permissions.mjs
 * يرفع صلاحية رئيس المحكمة (سعد الصويغ) والمساعد (حاتم الفالح)
 * في access_grants من general_view إلى full_control، ضمن معاملة واحدة.
 * الأهداف تُحدد من person_profiles (قاضٍ) بجوار دورهم في court_role_assignments.
 * الاستخدام:
 *   node scripts/upgrade-leadership-permissions.mjs
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

// 1) تحديد الرئيس: قاضٍ بمسمى "رئيس المحكمة".
const [presidentProfiles] = await db.query(
  "SELECT id, userId, fullName, jobTitle FROM person_profiles WHERE personType='judge' AND jobTitle LIKE ? AND userId IS NOT NULL",
  ["%رئيس المحكمة%"],
);

// 2) تحديد المساعد: قاضٍ بمسمى مساعد أو باسم حاتم الفالح.
const [assistantProfiles] = await db.query(
  "SELECT id, userId, fullName, jobTitle FROM person_profiles WHERE personType='judge' AND (jobTitle LIKE ? OR fullName LIKE ?) AND userId IS NOT NULL",
  ["%مساعد%", "%حاتم%فالح%"],
);

const candidates = [...presidentProfiles, ...assistantProfiles];
const byUserId = new Map();
for (const profile of candidates) {
  if (profile.userId) byUserId.set(profile.userId, profile);
}

await db.beginTransaction();
const report = { mode: "commit", targets: [], skipped: [] };
try {
  for (const [userId, profile] of byUserId) {
    // تأكيد أن للحساب دوراً قيادياً فعلياً قبل الرفع.
    const [roles] = await db.query(
      "SELECT role FROM court_role_assignments WHERE userId=? AND role IN ('court_president','assistant_president') AND isActive=1",
      [userId],
    );
    if (!roles.length) {
      report.skipped.push({ userId, fullName: profile.fullName, reason: "لا يوجد دور قيادي نشط (court_president/assistant_president)" });
      continue;
    }
    const [result] = await db.query(
      "UPDATE access_grants SET permission='full_control' WHERE userId=? AND isActive=1",
      [userId],
    );
    report.targets.push({
      userId,
      fullName: profile.fullName,
      jobTitle: profile.jobTitle,
      roles: roles.map((row) => row.role),
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

#!/usr/bin/env node
/** تشخيص حالة الحسابات الإدارية وجداول الدخول في TiDB. */
import mysql from "mysql2/promise";

const raw = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
if (!raw) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const url = new URL(raw);
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 4000),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, "") || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
});

const emails = ["amhumaidi@moj.gov.sa", "rakizaplatform@gmail.com", "snaswig@moj.gov.sa", "hfaleh@moj.gov.sa", "abssotaibi@moj.gov.sa", "bhabdaziz@moj.gov.sa", "shsamaih@moj.gov.sa"];

async function q(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

const out = {};

out.users = await q("SELECT id, openId, name, email, role, loginMethod, mustChangePassword, passcodeHash IS NOT NULL AS hasPasscode, firebaseUid IS NOT NULL AS hasFirebase FROM users WHERE LOWER(email) IN (?)", [emails]);
out.grants = await q("SELECT id, userId, fullName, officialEmail, notificationEmail, permission, isActive, grantedByUserId FROM access_grants WHERE LOWER(officialEmail) IN (?)", [emails]);
out.profiles = await q("SELECT id, userId, unitId, personType, fullName, email, status FROM person_profiles WHERE LOWER(email) IN (?)", [emails]);
out.roles = await q("SELECT id, userId, role, unitId, isActive, delegatedByUserId FROM court_role_assignments WHERE userId IN (SELECT id FROM users WHERE LOWER(email) IN (?))", [emails]);
out.units = await q("SELECT id, name, code, isActive FROM organization_units ORDER BY id");

// البحث عن الأسماء الجديدة داخل ملفات الموظفين
out.searchProfiles = await q(
  "SELECT id, userId, unitId, personType, fullName, email, jobTitle, status FROM person_profiles WHERE fullName LIKE ? OR fullName LIKE ? OR fullName LIKE ? OR fullName LIKE ? ORDER BY fullName",
  ["%الراجح%", "%الجابر%", "%العثمان%", "%أماني%"]
);

out.searchUsers = await q(
  "SELECT id, name, email, role FROM users WHERE LOWER(name) LIKE ? OR LOWER(name) LIKE ? OR LOWER(name) LIKE ? ORDER BY name",
  ["%الراجح%", "%الجابر%", "%العثمان%"]
);

out.unitManagers = await q(
  "SELECT cra.id, cra.userId, cra.role, cra.unitId, cra.isActive, u.name AS userName, ou.name AS unitName FROM court_role_assignments cra LEFT JOIN users u ON u.id = cra.userId LEFT JOIN organization_units ou ON ou.id = cra.unitId WHERE cra.role IN ('department_manager','trainee_affairs_manager','performance_monitor') ORDER BY cra.unitId, cra.isActive DESC"
);

console.log(JSON.stringify(out, null, 2));
await db.end();

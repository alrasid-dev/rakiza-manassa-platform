#!/usr/bin/env node
/**
 * scripts/create-confirmation-tables.mjs
 * إنشاء جدولي نظام تأكيد الحضور الآلي — Idempotent (CREATE TABLE IF NOT EXISTS).
 * 1) confirmation_assignments: تكليفات التأكيد العشوائية لكل موظف.
 * 2) system_configs: مفاتيح إيقاف/تفعيل نظام التأكيد (عام + لكل قسم).
 * الاستخدام: node scripts/create-confirmation-tables.mjs
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

await db.query(`
  CREATE TABLE IF NOT EXISTS confirmation_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    profileId INT NOT NULL,
    scheduledAt TIMESTAMP NOT NULL,
    confirmedAt TIMESTAMP NULL,
    status ENUM('pending','done','missed','cancelled') DEFAULT 'pending' NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    INDEX confirmation_assignments_profile_scheduled_idx (profileId, scheduledAt)
  )
`);
console.log("confirmation_assignments: ready");

await db.query(`
  CREATE TABLE IF NOT EXISTS system_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    confirmationEnabledGlobal BOOLEAN DEFAULT TRUE NOT NULL,
    confirmationEnabledPerDept JSON NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
  )
`);
console.log("system_configs: ready");

await db.query("INSERT INTO system_configs (confirmationEnabledGlobal) SELECT TRUE WHERE NOT EXISTS (SELECT 1 FROM system_configs)");
console.log("system_configs default row ensured.");

console.log("migration completed (idempotent).");
await db.end();

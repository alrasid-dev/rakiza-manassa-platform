#!/usr/bin/env node
/**
 * scripts/add-monthly-balances.mjs
 * إضافة عمود positiveMinutes إلى attendance_records + إنشاء جدول monthly_balances — Idempotent.
 * لا يستخدم drizzle-kit؛ ينفّذ ALTER/CREATE مباشرة عبر TiDB.
 * الاستخدام: node scripts/add-monthly-balances.mjs
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

const [cols] = await db.query("SHOW COLUMNS FROM attendance_records");
const names = cols.map(c => c.Field);
if (!names.includes("positiveMinutes")) {
  await db.query("ALTER TABLE attendance_records ADD COLUMN positiveMinutes INT DEFAULT 0 NOT NULL");
  console.log("+ positiveMinutes");
} else {
  console.log("= positiveMinutes (موجود مسبقاً)");
}

const [tables] = await db.query("SHOW TABLES LIKE 'monthly_balances'");
if (tables.length) {
  console.log("= monthly_balances (موجود مسبقاً)");
} else {
  await db.query(`
    CREATE TABLE monthly_balances (
      id INT AUTO_INCREMENT PRIMARY KEY,
      profileId INT NOT NULL,
      hijriMonthKey VARCHAR(10) NOT NULL,
      positiveMinutes INT DEFAULT 0 NOT NULL,
      negativeMinutes INT DEFAULT 0 NOT NULL,
      excuseMinutes INT DEFAULT 0 NOT NULL,
      netMinutes INT DEFAULT 0 NOT NULL,
      isSettled BOOLEAN DEFAULT FALSE NOT NULL,
      settledAt TIMESTAMP NULL,
      lastComputedAt TIMESTAMP NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      UNIQUE KEY monthly_balances_profile_month_unq (profileId, hijriMonthKey),
      INDEX monthly_balances_month_idx (hijriMonthKey)
    )
  `);
  console.log("+ monthly_balances");
}
console.log("migration completed (idempotent).");
await db.end();

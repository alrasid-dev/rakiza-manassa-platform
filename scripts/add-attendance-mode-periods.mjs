#!/usr/bin/env node
/**
 * scripts/add-attendance-mode-periods.mjs
 * إنشاء جدول attendance_mode_periods لفترات الحضور المتغيرة لكل موظف — Idempotent.
 * الاستخدام: node scripts/add-attendance-mode-periods.mjs
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
  CREATE TABLE IF NOT EXISTS attendance_mode_periods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    profileId INT NOT NULL,
    mode ENUM('in_person','remote','mixed') NOT NULL,
    startDate DATE NOT NULL,
    endDate DATE NULL,
    reason VARCHAR(200) NULL,
    setByUserId INT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
    INDEX idx_profile_dates (profileId, startDate, endDate),
    INDEX idx_active (profileId, endDate)
  )
`);
console.log("~ attendance_mode_periods (created or already exists)");

console.log("migration completed (idempotent).");
await db.end();

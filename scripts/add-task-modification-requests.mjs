#!/usr/bin/env node
/**
 * scripts/add-task-modification-requests.mjs
 * إنشاء جدول task_modification_requests لطلبات تعديل المهام — Idempotent.
 * لا يستخدم drizzle-kit؛ ينفّذ CREATE TABLE IF NOT EXISTS مباشرة عبر TiDB.
 * الاستخدام: node scripts/add-task-modification-requests.mjs
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
  CREATE TABLE IF NOT EXISTS task_modification_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    taskId INT NOT NULL,
    requestedByProfileId INT NOT NULL,
    currentData JSON NULL,
    proposedData JSON NULL,
    reason TEXT NOT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    reviewedByProfileId INT NULL,
    reviewedAt TIMESTAMP NULL,
    reviewNote TEXT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX task_modification_requests_task_status_idx (taskId, status),
    INDEX task_modification_requests_requester_idx (requestedByProfileId, status)
  )
`);
console.log("~ task_modification_requests (created or already exists)");

console.log("migration completed (idempotent).");
await db.end();

#!/usr/bin/env node
/**
 * scripts/migrate-tasks-meeting-id.mjs
 * يضيف عمود meetingId (INT NULL) + فهرس إلى جدول tasks لربط المهام بالاجتماعات.
 * آمن لإعادة التشغيل (يتحقق من وجود العمود قبل الإضافة).
 * الاستخدام:
 *   node scripts/migrate-tasks-meeting-id.mjs
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
const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 4000),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database,
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
});

const [cols] = await db.query(
  "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'meetingId'",
  [database],
);

let applied = false;
if (cols.length) {
  console.log("Column tasks.meetingId already exists — skipping column.");
} else {
  await db.query("ALTER TABLE tasks ADD COLUMN meetingId INT NULL");
  applied = true;
  console.log("Added tasks.meetingId (INT NULL).");
}

const [idx] = await db.query(
  "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'idx_tasks_meetingId'",
  [database],
);
if (idx.length) {
  console.log("Index idx_tasks_meetingId already exists — skipping.");
} else {
  await db.query("ALTER TABLE tasks ADD INDEX idx_tasks_meetingId (meetingId)");
  applied = true;
  console.log("Added index idx_tasks_meetingId.");
}

console.log(JSON.stringify({ applied, column: "meetingId", table: "tasks" }));
await db.end();

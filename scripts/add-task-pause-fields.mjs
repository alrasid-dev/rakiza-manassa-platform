#!/usr/bin/env node
/**
 * scripts/add-task-pause-fields.mjs
 * إضافة حالة "paused" وحقول الإيقاف إلى جدول tasks — Idempotent.
 * لا يستخدم drizzle-kit؛ ينفّذ ALTER TABLE مباشرة عبر TiDB.
 * الاستخدام: node scripts/add-task-pause-fields.mjs
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

// 1) تعديل enum الحالة لإضافة "paused" (Idempotent — نفس التعريف).
await db.query("ALTER TABLE tasks MODIFY COLUMN status ENUM('new','in_progress','under_review','completed','overdue','cancelled','paused') NOT NULL DEFAULT 'new'");
console.log("~ tasks.status -> added 'paused' to enum");

// 2) إضافة حقول الإيقاف (Idempotent — فحص SHOW COLUMNS).
const [cols] = await db.query("SHOW COLUMNS FROM tasks");
const names = cols.map(c => c.Field);
const adds = [
  ["pausedAt", "TIMESTAMP NULL"],
  ["pausedReason", "VARCHAR(200) NULL"],
  ["pausedByUserId", "INT NULL"],
  ["pauseExpiresAt", "TIMESTAMP NULL"],
  ["pauseType", "VARCHAR(20) NULL"],
];
for (const [col, ddl] of adds) {
  if (names.includes(col)) {
    console.log(`= tasks.${col} (موجود مسبقاً)`);
  } else {
    await db.query(`ALTER TABLE tasks ADD COLUMN \`${col}\` ${ddl}`);
    console.log(`+ tasks.${col} ${ddl}`);
  }
}

console.log("migration completed (idempotent).");
await db.end();

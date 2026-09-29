#!/usr/bin/env node
/**
 * scripts/migrate-person-profiles-archive.mjs
 * يضيف دعم الأرشفة النظامية لجدول person_profiles:
 *  - قيمة 'archived' إلى enum status (مع الحفاظ على الـ default الحالي).
 *  - أعمدة archivedAt / archivedReason / archivedByUserId.
 *  - فهرس idx_person_profiles_archived.
 * آمن لإعادة التشغيل (يتحقق من الوجود قبل كل تعديل).
 * الاستخدام:
 *   node scripts/migrate-person-profiles-archive.mjs
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

const report = { statusEnum: "unchanged", archivedAt: "unchanged", archivedReason: "unchanged", archivedByUserId: "unchanged", index: "unchanged" };

// 1) إضافة 'archived' إلى enum status مع الحفاظ على الـ default الحالي.
const [statusCols] = await db.query(
  "SELECT COLUMN_TYPE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'person_profiles' AND COLUMN_NAME = 'status'",
  [database],
);
const colType = statusCols[0]?.COLUMN_TYPE ?? "";
if (colType.includes("'archived'")) {
  console.log("status enum already includes 'archived' — skip.");
} else {
  const defaultVal = statusCols[0]?.COLUMN_DEFAULT ?? "pending_review";
  await db.query(`ALTER TABLE person_profiles MODIFY COLUMN status ENUM('active','on_leave','inactive','pending_review','archived') NOT NULL DEFAULT '${defaultVal}'`);
  report.statusEnum = "modified";
  console.log(`status enum: added 'archived' (default preserved: ${defaultVal}).`);
}

// 2) إضافة أعمدة الأرشفة.
const columnDefs = [
  ["archivedAt", "TIMESTAMP NULL DEFAULT NULL"],
  ["archivedReason", "VARCHAR(500) NULL DEFAULT NULL"],
  ["archivedByUserId", "INT NULL DEFAULT NULL"],
];
for (const [name, def] of columnDefs) {
  const [existing] = await db.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'person_profiles' AND COLUMN_NAME = ?",
    [database, name],
  );
  if (existing.length) { console.log(`Column ${name} already exists — skip.`); continue; }
  await db.query(`ALTER TABLE person_profiles ADD COLUMN ${name} ${def}`);
  report[name] = "added";
  console.log(`Added column ${name}.`);
}

// 3) فهرس الأرشفة.
const [idx] = await db.query(
  "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'person_profiles' AND INDEX_NAME = 'idx_person_profiles_archived'",
  [database],
);
if (idx.length) {
  console.log("index idx_person_profiles_archived already exists — skip.");
} else {
  await db.query("ALTER TABLE person_profiles ADD INDEX idx_person_profiles_archived (status, archivedAt)");
  report.index = "added";
  console.log("Added index idx_person_profiles_archived.");
}

console.log(JSON.stringify(report));
await db.end();

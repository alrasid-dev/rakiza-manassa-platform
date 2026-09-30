#!/usr/bin/env node
/** scripts/migrate-disciplinary-status.mjs — إضافة حالتي under_review و escalated لمسار المساءلة. */
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
  host: url.hostname, port: Number(url.port || 4000),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
});

async function enumHasValue(table, column, value) {
  const [rows] = await db.query(
    "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
    [table, column],
  );
  const type = rows[0]?.COLUMN_TYPE ?? "";
  return type.includes(`'${value}'`);
}

const hasUnderReview = await enumHasValue("approval_requests", "status", "under_review");
const hasEscalated = await enumHasValue("approval_requests", "status", "escalated");

if (hasUnderReview && hasEscalated) {
  console.log("الحالات موجودة مسبقاً — تم التخطي.");
} else {
  await db.query("ALTER TABLE approval_requests MODIFY COLUMN status ENUM('pending','returned','approved','rejected','cancelled','under_review','escalated') NOT NULL DEFAULT 'pending'");
  console.log("أُضيفت under_review و escalated إلى approval_requests.status.");
}

const [cols] = await db.query("SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='approval_requests' AND COLUMN_NAME='status'");
console.log("status enum الآن:", cols[0]?.COLUMN_TYPE);
await db.end();

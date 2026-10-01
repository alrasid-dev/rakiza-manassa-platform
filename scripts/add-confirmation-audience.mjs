#!/usr/bin/env node
/**
 * scripts/add-confirmation-audience.mjs
 * إضافة عمود confirmationAudienceUnitIds (JSON) إلى system_configs
 * لدعم تقييد تأكيد الحضور بأقسام محددة (allowlist) — Idempotent.
 * الاستخدام: node scripts/add-confirmation-audience.mjs
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

// إضافة العمود إن لم يكن موجوداً (TiDB يدعم IF NOT EXISTS في ADD COLUMN).
await db.query("ALTER TABLE system_configs ADD COLUMN IF NOT EXISTS confirmationAudienceUnitIds JSON NULL");
console.log("~ system_configs.confirmationAudienceUnitIds (added or already exists)");

console.log("migration completed (idempotent).");
await db.end();

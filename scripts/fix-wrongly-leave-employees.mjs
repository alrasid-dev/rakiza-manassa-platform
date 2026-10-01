#!/usr/bin/env node
/**
 * scripts/fix-wrongly-leave-employees.mjs
 * تحويل الموظفين ذوي الحالة on_leave بلا إجازة معتمدة إلى active (أو pending_start للحديثين).
 * يعرض النتيجة قبل التنفيذ.
 * الاستخدام: node scripts/fix-wrongly-leave-employees.mjs
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

const [rows] = await db.query(`
  SELECT p.id, p.fullName, p.createdAt
  FROM person_profiles p
  LEFT JOIN leave_requests lr ON lr.profileId = p.id AND lr.status IN ('approved','active')
  WHERE p.status = 'on_leave' AND lr.id IS NULL
`);
console.log(`~ on_leave بدون إجازة معتمدة: ${rows.length}`);

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
let toPendingStart = 0;
let toActive = 0;
for (const r of rows) {
  const isRecent = Date.now() - new Date(r.createdAt).getTime() < SEVEN_DAYS;
  const newStatus = isRecent ? "pending_start" : "active";
  if (newStatus === "pending_start") toPendingStart++; else toActive++;
  console.log(`  -> ${r.fullName} (id=${r.id}) → ${newStatus}`);
  await db.query("UPDATE person_profiles SET status = ? WHERE id = ?", [newStatus, r.id]);
}

console.log(`~ تم التحويل: pending_start=${toPendingStart}, active=${toActive}`);
await db.end();

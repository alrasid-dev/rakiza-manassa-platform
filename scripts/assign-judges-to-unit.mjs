#!/usr/bin/env node
/**
 * scripts/assign-judges-to-unit.mjs
 * إسناد جميع القضاة (personType='judge') إلى قسم "شؤون القضاة" (id=60016).
 * الاستخدام: node scripts/assign-judges-to-unit.mjs
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
if (!raw) {
  console.error("DATABASE_URL غير موجود في .env.production.local");
  process.exit(1);
}
const url = new URL(raw);
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 4000),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
});

const TARGET_UNIT_ID = 60016;

// 1) تحقق من وجود قسم شؤون القضاة.
const [units] = await db.query(
  "SELECT id, name FROM organization_units WHERE id = ? OR name = 'شؤون القضاة' LIMIT 1",
  [TARGET_UNIT_ID]
);
if (!units.length) {
  console.error("لم يُعثر على قسم شؤون القضاة (id=60016).");
  await db.end();
  process.exit(1);
}
const unitId = units[0].id;
console.log("القسم المستهدف:", unitId, "-", units[0].name);

// 2) التوزيع قبل التحديث.
const [dist] = await db.query(
  "SELECT IFNULL(unitId, 'NULL') AS unitId, COUNT(*) AS n FROM person_profiles WHERE personType = 'judge' GROUP BY unitId ORDER BY unitId"
);
console.log("توزيع القضاة قبل الإسناد:", dist.map((r) => `${r.unitId}=${r.n}`).join(" | "));

// 3) التحديث داخل Transaction.
await db.beginTransaction();
let affected = 0;
try {
  const [result] = await db.query(
    "UPDATE person_profiles SET unitId = ? WHERE personType = 'judge'",
    [unitId]
  );
  affected = result.affectedRows ?? 0;
  await db.commit();
} catch (err) {
  await db.rollback();
  throw err;
}
console.log("صفوف متأثرة بالتحديث:", affected);

// 4) تحقق نهائي.
const [after] = await db.query(
  "SELECT COUNT(*) AS n FROM person_profiles WHERE personType = 'judge' AND unitId = ?",
  [unitId]
);
console.log("القضاة المسندون لشؤون القضاة:", after[0].n);
const [remaining] = await db.query(
  "SELECT COUNT(*) AS n FROM person_profiles WHERE personType = 'judge' AND (unitId IS NULL OR unitId <> ?)",
  [unitId]
);
console.log("القضاة غير المسندين المتبقون:", remaining[0].n);

await db.end();
console.log("completed.");

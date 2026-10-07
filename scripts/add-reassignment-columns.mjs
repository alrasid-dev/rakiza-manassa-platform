// scripts/add-reassignment-columns.mjs
// إضافة عمودي "محالة من" إلى جدول tasks (reassignedFromProfileId + reassignmentReason).
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
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

const raw = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
if (!raw) { console.error("DATABASE_URL not found"); process.exit(1); }
const url = new URL(raw);
const db = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";
const conn = await mysql.createConnection({
  host: url.hostname, port: Number(url.port || 4000),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: db,
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true,
});

async function hasColumn(table, col) {
  const [rows] = await conn.query("SHOW COLUMNS FROM `" + table + "` LIKE ?", [col]);
  return rows.length > 0;
}

if (!(await hasColumn("tasks", "reassignedFromProfileId"))) {
  await conn.query("ALTER TABLE tasks ADD COLUMN reassignedFromProfileId INT NULL");
  console.log("+ tasks.reassignedFromProfileId");
} else {
  console.log("= tasks.reassignedFromProfileId (موجود)");
}
if (!(await hasColumn("tasks", "reassignmentReason"))) {
  await conn.query("ALTER TABLE tasks ADD COLUMN reassignmentReason VARCHAR(40) NULL");
  console.log("+ tasks.reassignmentReason");
} else {
  console.log("= tasks.reassignmentReason (موجود)");
}
await conn.end();

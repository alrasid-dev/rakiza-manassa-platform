// scripts/fix-future-overdue-tasks.mjs
// إصلاح المهام التي scheduledFor مستقبلي لكنها معلَّمة overdue خطأً (شذوذ بيانات من السياسة القديمة).
// يعرض "قبل"، ثم يعيد status إلى 'new'، ثم يعرض "بعد".
import fs from "node:fs";
import mysql from "mysql2/promise";

function env(key) {
  for (const line of fs.readFileSync(".env.production.local", "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("="); if (e === -1) continue;
    if (t.slice(0, e).trim() !== key) continue;
    let v = t.slice(e + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

const TARGET_IDS = [300025, 450021, 330007, 330039, 300028, 330042, 300026, 330010, 330031];

const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true, bigNumberStrings: true,
});

const riyadh = (d) => (d ? d.toLocaleString("en-GB", { timeZone: "Asia/Riyadh", hour12: false }) : "-");

function show(label) {
  console.log(`\n=== ${label} ===`);
  for (const r of rows) {
    console.log(`id=${r.id} | scheduledFor=${riyadh(r.scheduledFor)} | status=${r.status} | isOpen=${r.isOpen}`);
  }
}

const [rows] = await db.query(
  `SELECT id, scheduledFor, status, isOpen FROM tasks WHERE id IN (?) ORDER BY scheduledFor ASC`,
  [TARGET_IDS],
);
show("قبل");

const [result] = await db.query(
  `UPDATE tasks SET status = 'new', updatedAt = NOW() WHERE id IN (?) AND status = 'overdue'`,
  [TARGET_IDS],
);
console.log(`\n>>> تم تحديث ${result.affectedRows} صف (overdue → new).`);

const [after] = await db.query(
  `SELECT id, scheduledFor, status, isOpen FROM tasks WHERE id IN (?) ORDER BY scheduledFor ASC`,
  [TARGET_IDS],
);
rows.length = 0;
rows.push(...after);
show("بعد");

await db.end();

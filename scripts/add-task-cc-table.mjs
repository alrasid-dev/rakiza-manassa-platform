// scripts/add-task-cc-table.mjs
// إنشاء جدول task_cc (نسخة للاطلاع).
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

const [tables] = await conn.query("SHOW TABLES LIKE 'task_cc'");
if (tables.length) {
  console.log("= task_cc (موجود)");
} else {
  await conn.query(`
    CREATE TABLE task_cc (
      id INT AUTO_INCREMENT PRIMARY KEY,
      taskId INT NOT NULL,
      viewerProfileId INT NOT NULL,
      addedByProfileId INT NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      readAt TIMESTAMP NULL,
      UNIQUE KEY task_cc_task_viewer_unique (taskId, viewerProfileId),
      INDEX task_cc_viewer_idx (viewerProfileId),
      INDEX task_cc_task_idx (taskId)
    )
  `);
  console.log("+ task_cc");
}
await conn.end();

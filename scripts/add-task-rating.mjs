// scripts/add-task-rating.mjs
// إضافة حقلي managerRating + ratingNote إلى جدول task_approvals (Idempotent).
// يفحص SHOW COLUMNS أولاً ولا يضيف إلا الناقص.

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

async function main() {
  const rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
  if (!rawUrl) { console.error("DATABASE_URL not found"); process.exit(1); }
  const url = new URL(rawUrl);
  const db = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";
  const c = await mysql.createConnection({
    host: url.hostname, port: Number(url.port || 4000), user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password), database: db,
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  });

  const [cols] = await c.query("SHOW COLUMNS FROM task_approvals");
  const existing = new Set(cols.map(x => x.Field));
  const added = [];
  if (!existing.has("managerRating")) {
    await c.query("ALTER TABLE task_approvals ADD COLUMN managerRating VARCHAR(20) NULL");
    added.push("managerRating");
  }
  if (!existing.has("ratingNote")) {
    await c.query("ALTER TABLE task_approvals ADD COLUMN ratingNote VARCHAR(500) NULL");
    added.push("ratingNote");
  }
  console.log(JSON.stringify({ added, alreadyExisting: [...existing].filter(f => ["managerRating", "ratingNote"].includes(f)) }));
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

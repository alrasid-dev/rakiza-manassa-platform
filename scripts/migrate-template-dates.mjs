// scripts/migrate-template-dates.mjs
// يضيف عمودَي startDate/endDate إلى task_templates إن لم يكونا موجودين (آمن/قابل للتكرار).
// يقرأ DATABASE_URL من .env.production.local دون طباعة أي أسرار.

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

let rawUrl = "";

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

function redact(message) {
  let out = String(message);
  try {
    if (rawUrl) {
      const url = new URL(rawUrl);
      if (url.password) out = out.split(url.password).join("***");
      out = out.split(rawUrl).join("[REDACTED]");
    }
  } catch { /* ignore */ }
  return out;
}

async function main() {
  rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
  if (!rawUrl) { console.error("DATABASE_URL not found in .env.production.local"); process.exit(1); }
  const url = new URL(rawUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";

  const conn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 4000),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  });

  const [rows] = await conn.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'task_templates' AND COLUMN_NAME IN ('startDate', 'endDate')",
    [database],
  );
  const existing = new Set(rows.map((r) => r.COLUMN_NAME));
  console.log("موجود حالياً:", [...existing].join(", ") || "(لا شيء)");

  const toAdd = [];
  if (!existing.has("startDate")) toAdd.push("startDate DATE NULL");
  if (!existing.has("endDate")) toAdd.push("endDate DATE NULL");

  if (toAdd.length === 0) {
    console.log("العمودان موجودان مسبقاً — لا تغيير.");
    await conn.end();
    return;
  }

  const sql = `ALTER TABLE task_templates ADD COLUMN ${toAdd.join(", ADD COLUMN ")}`;
  console.log("سيُنفَّذ:", sql);
  await conn.query(sql);
  console.log("تمت الإضافة بنجاح: " + toAdd.join(" + "));
  await conn.end();
}

main().catch((err) => {
  console.error("Failed: " + redact(err && err.message ? err.message : String(err)));
  process.exit(1);
});

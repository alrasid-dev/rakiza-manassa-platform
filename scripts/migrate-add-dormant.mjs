// scripts/migrate-add-dormant.mjs
// إضافة حالة "dormant" إلى عمود status في person_profiles (بدون drizzle-kit).
// تُبقي القيم الموجودة، وتُضيف 'dormant' فقط، وتجعل الافتراضي 'dormant'.

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
  if (!rawUrl) { console.error("DATABASE_URL not found in .env.production.local"); process.exit(1); }
  const url = new URL(rawUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 4000),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  await connection.query(
    "ALTER TABLE person_profiles MODIFY COLUMN status ENUM('active','on_leave','inactive','pending_review','archived','pending_start','dormant') NOT NULL DEFAULT 'dormant'"
  );

  const [cols] = await connection.query("SHOW COLUMNS FROM person_profiles LIKE 'status'");
  console.log(JSON.stringify(cols));

  await connection.end();
}

main().catch((err) => {
  console.error("FAILED: " + (err && err.message ? err.message : String(err)));
  process.exit(1);
});

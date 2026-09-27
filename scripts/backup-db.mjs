// scripts/backup-db.mjs
// نسخ احتياطي كامل لقاعدة بيانات TiDB Cloud إلى ملف JSON داخل مجلد backups/.
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return null;
}

// يزيل أي كلمة مرور أو رابط كامل من رسائل الأخطاء قبل طباعتها.
function redact(message) {
  let out = String(message);
  try {
    if (rawUrl) {
      const url = new URL(rawUrl);
      if (url.password) out = out.split(url.password).join("***");
      out = out.split(rawUrl).join("[REDACTED]");
    }
  } catch {
    /* ignore */
  }
  return out;
}

// يحوّل قيم Buffer (المرفقات الثنائية) إلى base64 حتى لا تُفقد البيانات.
function jsonReplacer(_key, value) {
  if (Buffer.isBuffer(value)) return { __bufferBase64: value.toString("base64") };
  return value;
}

async function main() {
  rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
  if (!rawUrl) {
    console.error("DATABASE_URL not found in .env.production.local");
    process.exit(1);
  }

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

  console.log("Connected to " + database + " @ " + url.hostname + ":" + (url.port || 4000));

  const [tablesResult] = await connection.query("SHOW TABLES");
  const tableNames = tablesResult.map((row) => Object.values(row)[0]);
  console.log("Found " + tableNames.length + " tables.");

  const backup = { exportedAt: new Date().toISOString(), database, tables: {} };
  let exportedTables = 0;

  for (const tableName of tableNames) {
    let rows;
    try {
      [rows] = await connection.query("SELECT * FROM `" + tableName + "`");
    } catch (err) {
      console.warn("Skipped " + tableName + ": " + redact(err && err.message ? err.message : String(err)));
      continue;
    }
    backup.tables[tableName] = rows;
    exportedTables++;
    console.log("Exported " + tableName + " (" + rows.length + " rows)");
  }

  await connection.end();

  const dir = path.resolve("backups");
  fs.mkdirSync(dir, { recursive: true });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_` +
    `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const filename = `rakiza_backup_${stamp}.json`;
  const filePath = path.join(dir, filename);

  fs.writeFileSync(filePath, JSON.stringify(backup, jsonReplacer));

  console.log("Backup completed successfully.");
  console.log("File: " + filePath);
  console.log("Tables: " + exportedTables);
}

main().catch((err) => {
  console.error("Backup failed: " + redact(err && err.message ? err.message : String(err)));
  process.exit(1);
});

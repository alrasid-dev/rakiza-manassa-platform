#!/usr/bin/env node
/**
 * scripts/add-attachment-content-columns.mjs
 * إضافة أعمدة contentBase64 (MEDIUMTEXT) و fileSizeBytes إلى جداول المرفقات،
 * وجعل storageKey/storageUrl قابلة للـ NULL (للملفات الجديدة المخزنة في DB).
 * لا يستخدم drizzle-kit؛ ينفّذ ALTER TABLE مباشرة عبر TiDB — Idempotent.
 * الاستخدام: node scripts/add-attachment-content-columns.mjs
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

// جداول المرفقات: أعمدة تُضاف + أعمدة تُجعل nullable.
const tables = [
  { table: "document_records", add: [["contentBase64", "MEDIUMTEXT"], ["fileSizeBytes", "INT DEFAULT 0 NOT NULL"]] },
  { table: "correspondence_attachments", add: [["contentBase64", "MEDIUMTEXT"]], nullable: ["storageKey", "storageUrl"] },
  { table: "internal_mail_attachments", add: [["contentBase64", "MEDIUMTEXT"]], nullable: ["storageKey", "storageUrl"] },
  { table: "internal_mail_preferences", add: [["signatureImageContentBase64", "MEDIUMTEXT"], ["signatureImageFileSizeBytes", "INT DEFAULT 0 NOT NULL"]] },
  { table: "task_update_attachments", add: [["contentBase64", "MEDIUMTEXT"]], nullable: ["storageKey", "storageUrl"] },
  { table: "task_attachments", add: [["contentBase64", "MEDIUMTEXT"]], nullable: ["storageKey", "storageUrl"] },
  { table: "import_batches", add: [["contentBase64", "MEDIUMTEXT"], ["fileSizeBytes", "INT DEFAULT 0 NOT NULL"]], nullable: ["storageKey", "storageUrl"] },
  { table: "support_ticket_attachments", add: [["contentBase64", "MEDIUMTEXT"], ["fileSizeBytes", "INT DEFAULT 0 NOT NULL"]], nullable: ["storageKey", "storageUrl"] },
  { table: "conversation_attachments", add: [["contentBase64", "MEDIUMTEXT"]], nullable: ["storageKey", "storageUrl"] },
  { table: "data_export_jobs", add: [["contentBase64", "MEDIUMTEXT"]] },
];

for (const { table, add = [], nullable = [] } of tables) {
  const [cols] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
  const byName = new Map(cols.map(c => [c.Field, c]));

  for (const [col, ddl] of add) {
    if (byName.has(col)) {
      console.log(`= ${table}.${col} (موجود مسبقاً)`);
    } else {
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${ddl}`);
      console.log(`+ ${table}.${col} ${ddl}`);
    }
  }

  for (const col of nullable) {
    const info = byName.get(col);
    if (!info) { console.log(`! ${table}.${col} غير موجود — تخطي`); continue; }
    if (info.Null === "YES") {
      console.log(`= ${table}.${col} (nullable مسبقاً)`);
    } else {
      await db.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${col}\` ${info.Type} NULL`);
      console.log(`~ ${table}.${col} -> NULL (was NOT NULL)`);
    }
  }
}

console.log("migration completed (idempotent).");
await db.end();

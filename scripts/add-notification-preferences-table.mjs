// scripts/add-notification-preferences-table.mjs
// ينشئ جدول تفضيلات التنبيهات user_notification_preferences (نغمة + درجة صوت) لكل مستخدم.
// يستخدم SQL مباشر عبر mysql2 (لا drizzle-kit migrate). يقرأ DATABASE_URL من .env.production.local.
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("="); if (eq === -1) continue;
    if (t.slice(0, eq).trim() !== key) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

async function main() {
  const rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || process.env.DATABASE_URL;
  if (!rawUrl) { console.error("DATABASE_URL غير موجود"); process.exit(1); }
  const url = new URL(rawUrl);
  const conn = await mysql.createConnection({
    host: url.hostname, port: Number(url.port || 4000),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza",
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true,
  });
  await conn.query(`
    CREATE TABLE IF NOT EXISTS user_notification_preferences (
      user_id INT PRIMARY KEY,
      tone_id VARCHAR(50) DEFAULT 'double_beep',
      volume FLOAT DEFAULT 0.7,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log("تم إنشاء/تأكيد جدول user_notification_preferences");
  await conn.end();
}
main().catch(e => { console.error(e); process.exit(1); });

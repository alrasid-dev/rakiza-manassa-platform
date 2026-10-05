// scripts/migrate-escalation-chain.mjs
// يوسّع enum currentRole ليدعم تسلسل التصعيد: مدير → أمين → رئيس → مالك.
// إضافة قيم enum عملية آمنة غير مُدمِّرة. يقرأ DATABASE_URL من .env.production.local.
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

const TARGET_ENUM = "enum('trainee_affairs_manager','human_resources_manager','court_secretary','assistant_president','court_president','department_manager','owner')";

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

  const [before] = await conn.query(`SHOW COLUMNS FROM approval_requests LIKE 'currentRole'`);
  const currentType = before[0]?.Type;
  console.log("النوع الحالي:", currentType);
  if (currentType === TARGET_ENUM) {
    console.log("القيم مضافة مسبقاً — لا حاجة للتعديل.");
    await conn.end();
    return;
  }

  await conn.query(
    `ALTER TABLE approval_requests MODIFY COLUMN currentRole ${TARGET_ENUM} NOT NULL`,
  );
  const [after] = await conn.query(`SHOW COLUMNS FROM approval_requests LIKE 'currentRole'`);
  console.log("النوع الجديد:", after[0]?.Type);
  console.log("تم توسيع enum currentRole بنجاح.");
  await conn.end();
}
main().catch(e => { console.error(e); process.exit(1); });

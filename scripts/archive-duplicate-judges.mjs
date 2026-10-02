// scripts/archive-duplicate-judges.mjs
// تحويل القضاة المكررين (نفس الاسم) بدون حساب إلى dormant — بدون حذف.
// يقرأ DATABASE_URL من .env.production.local دون طباعة أي أسرار.

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

  // القائمة الكاملة للقضاة المكررين بدون حساب (قبل التنفيذ).
  const [list] = await connection.query(
    `SELECT fullName, GROUP_CONCAT(id ORDER BY id) AS ids
     FROM person_profiles
     WHERE personType = 'judge' AND userId IS NULL
       AND fullName IN (
         SELECT d.fullName FROM (
           SELECT fullName FROM person_profiles WHERE personType = 'judge' GROUP BY fullName HAVING COUNT(*) > 1
         ) AS d
       )
     GROUP BY fullName`
  );

  const [result] = await connection.query(
    `UPDATE person_profiles SET status = 'dormant', updatedAt = NOW()
     WHERE personType = 'judge' AND userId IS NULL
       AND fullName IN (
         SELECT d.fullName FROM (
           SELECT fullName FROM person_profiles WHERE personType = 'judge' GROUP BY fullName HAVING COUNT(*) > 1
         ) AS d
       )`
  );

  console.log(JSON.stringify({
    duplicateJudgesWithoutAccount: list,
    affectedRows: Number(result.affectedRows),
  }));

  await connection.end();
}

main().catch((err) => {
  console.error("FAILED: " + (err && err.message ? err.message : String(err)));
  process.exit(1);
});

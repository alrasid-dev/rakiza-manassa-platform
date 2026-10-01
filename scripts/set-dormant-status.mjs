// scripts/set-dormant-status.mjs
// تعيين حالة dormant للقضاة والملازمين النشطين الذين لم يسجلوا أي بصمة دخول فعلية (checkInAt).
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

  const [before] = await connection.query(
    "SELECT personType, COUNT(*) AS cnt FROM person_profiles WHERE personType IN ('judge','trainee') AND status='active' AND NOT EXISTS (SELECT 1 FROM attendance_records a WHERE a.profileId = person_profiles.id AND a.checkInAt IS NOT NULL) GROUP BY personType"
  );

  const [result] = await connection.query(
    "UPDATE person_profiles SET status='dormant', updatedAt=NOW() WHERE personType IN ('judge','trainee') AND status='active' AND NOT EXISTS (SELECT 1 FROM attendance_records a WHERE a.profileId = person_profiles.id AND a.checkInAt IS NOT NULL)"
  );

  const [after] = await connection.query(
    "SELECT status, personType, COUNT(*) AS cnt FROM person_profiles WHERE personType IN ('judge','trainee') GROUP BY status, personType ORDER BY personType, status"
  );

  console.log(JSON.stringify({
    beforeGroups: before,
    affectedRows: Number(result.affectedRows),
    afterGroups: after,
  }));

  await connection.end();
}

main().catch((err) => {
  console.error("FAILED: " + (err && err.message ? err.message : String(err)));
  process.exit(1);
});

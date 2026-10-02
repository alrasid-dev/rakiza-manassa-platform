// scripts/restore-admin-role-status.mjs
// يعيد الحالة active للملفات التي تحمل دوراً إدارياً نشطاً (court_role_assignments.isActive = 1)
// لكنها أصبحت dormant بفعل تنظيف سابق — لأن dormant يجب ألا يُسقط الصلاحيات الإدارية.
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

  // القائمة قبل التنفيذ.
  const [before] = await connection.query(
    `SELECT cra.role, p.id AS profileId, p.fullName
     FROM court_role_assignments cra
     JOIN person_profiles p ON p.userId = cra.userId
     WHERE cra.isActive = 1 AND p.status = 'dormant'
     ORDER BY cra.role, p.id`
  );

  const [result] = await connection.query(
    `UPDATE person_profiles SET status = 'active', updatedAt = NOW()
     WHERE status = 'dormant'
       AND userId IN (SELECT userId FROM court_role_assignments WHERE isActive = 1)`
  );

  const [after] = await connection.query(
    `SELECT cra.role, COUNT(*) AS total, SUM(CASE WHEN p.status = 'dormant' THEN 1 ELSE 0 END) AS dormant_count
     FROM court_role_assignments cra
     JOIN person_profiles p ON p.userId = cra.userId
     WHERE cra.isActive = 1
     GROUP BY cra.role`
  );

  console.log(JSON.stringify({
    restoredBefore: before,
    affectedRows: Number(result.affectedRows),
    rolesAfter: after,
  }));

  await connection.end();
}

main().catch((err) => {
  console.error("FAILED: " + (err && err.message ? err.message : String(err)));
  process.exit(1);
});

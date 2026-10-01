// scripts/sync-direct-managers.mjs
// مزامنة المدير المباشر ديناميكياً: يملأ directManagerProfileId لكل موظف من مدير قسمه النشط
// (department_manager / trainee_affairs_manager) عبر ربط court_role_assignments → users → person_profiles.

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

  const [before] = await connection.query("SELECT COUNT(*) AS cnt FROM person_profiles WHERE status='active' AND directManagerProfileId IS NULL");

  const [result] = await connection.query(
    `UPDATE person_profiles pp
     JOIN court_role_assignments cra
       ON cra.unitId = pp.unitId
      AND cra.isActive = 1
      AND cra.role IN ('department_manager','trainee_affairs_manager')
     JOIN users u ON u.id = cra.userId
     JOIN person_profiles mgr ON mgr.userId = u.id
     SET pp.directManagerProfileId = mgr.id, pp.updatedAt = NOW()
     WHERE pp.id != mgr.id`
  );

  const [after] = await connection.query("SELECT COUNT(*) AS cnt FROM person_profiles WHERE status='active' AND directManagerProfileId IS NULL");
  const [byUnit] = await connection.query(
    "SELECT unitId, COUNT(*) AS with_manager FROM person_profiles WHERE status='active' AND directManagerProfileId IS NOT NULL GROUP BY unitId ORDER BY unitId"
  );

  console.log(JSON.stringify({
    beforeMissing: Number(before[0].cnt),
    affectedRows: Number(result.affectedRows),
    afterMissing: Number(after[0].cnt),
    byUnit,
  }));

  await connection.end();
}

main().catch((err) => {
  console.error("FAILED: " + (err && err.message ? err.message : String(err)));
  process.exit(1);
});

// scripts/delete-invalid-disciplinaries.mjs
// حذف المساءلات الخاطئة (entityType='disciplinary_action') التي:
//  1) تشير لمهمة بلا مكلّف (assigneeProfileId IS NULL)
//  2) تشير لموظف في قسم غير مُفعّل للتأكيد (unitId NOT IN (2,5))
//  3) تشير لموظف حضوري (attendanceMode='in_person')
// يعرض التشخيص ثم ينفّذ الحذف ويطبع المحذوف/الباقي.

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

  // المرحلة أ — التشخيص
  const [diagnosis] = await connection.query(
    `SELECT
      CASE
        WHEN t.id IS NOT NULL AND t.assigneeProfileId IS NULL THEN 'task_no_assignee'
        WHEN p.unitId NOT IN (2, 5) THEN 'unit_not_enabled'
        WHEN p.attendanceMode = 'in_person' THEN 'in_person'
        ELSE 'valid'
      END AS category,
      COUNT(*) AS cnt
     FROM approval_requests ar
     LEFT JOIN person_profiles p ON p.id = ar.entityId
     LEFT JOIN tasks t ON t.id = ar.entityId
     WHERE ar.entityType='disciplinary_action'
     GROUP BY category`
  );
  console.log("DIAGNOSIS " + JSON.stringify(diagnosis));

  // المرحلة ج — التنفيذ
  const [deleted] = await connection.query(
    `DELETE FROM approval_requests
     WHERE entityType='disciplinary_action'
       AND id IN (
         SELECT ar.id FROM (
           SELECT ar.id FROM approval_requests ar
           LEFT JOIN person_profiles p ON p.id = ar.entityId
           LEFT JOIN tasks t ON t.id = ar.entityId
           WHERE ar.entityType='disciplinary_action'
             AND (
               (t.id IS NOT NULL AND t.assigneeProfileId IS NULL)
               OR p.unitId NOT IN (2, 5)
               OR p.attendanceMode = 'in_person'
             )
         ) AS ar
       )`
  );

  const [remaining] = await connection.query(
    "SELECT COUNT(*) AS cnt FROM approval_requests WHERE entityType='disciplinary_action'"
  );

  console.log(JSON.stringify({
    deletedRows: Number(deleted.affectedRows),
    remaining: Number(remaining[0].cnt),
  }));

  await connection.end();
}

main().catch((err) => {
  console.error("FAILED: " + (err && err.message ? err.message : String(err)));
  process.exit(1);
});

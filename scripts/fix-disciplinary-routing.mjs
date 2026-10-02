// scripts/fix-disciplinary-routing.mjs
// إصلاح توجيه المساءلات المعلقة من "human_resources_manager" إلى "court_secretary"
// عندما يكون للموظف (entityId) مدير مباشر (directManagerProfileId).
// الاستخدام:
//   node scripts/fix-disciplinary-routing.mjs --dry-run   (عرض فقط دون تعديل)
//   node scripts/fix-disciplinary-routing.mjs             (تطبيق التحديث)

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const DRY_RUN = process.argv.includes("--dry-run");

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

function redact(message, rawUrl) {
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

async function main() {
  const rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
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

  const [rows] = await connection.query(
    `SELECT ar.id, ar.entityId, ar.status, ar.currentRole,
            p.fullName, p.directManagerProfileId, p.unitId
       FROM approval_requests ar
       JOIN person_profiles p ON p.id = ar.entityId
      WHERE ar.entityType = 'disciplinary_action'
        AND ar.status = 'pending'
        AND ar.currentRole = 'human_resources_manager'`
  );

  console.log("Found " + rows.length + " pending disciplinary routed to human_resources_manager:\n");
  console.log(JSON.stringify(rows.map(r => ({ id: r.id, entityId: r.entityId, fullName: r.fullName, unitId: r.unitId, manager: r.directManagerProfileId, currentRole: r.currentRole })), null, 2));

  const eligible = rows.filter(r => r.directManagerProfileId != null);
  if (!eligible.length) {
    console.log("\nNo eligible rows (all missing directManagerProfileId). Nothing to do.");
    await connection.end();
    return;
  }

  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Would update ${eligible.length} rows to currentRole='court_secretary'.`);
    await connection.end();
    return;
  }

  let updated = 0;
  for (const row of eligible) {
    const [result] = await connection.query(
      `UPDATE approval_requests SET currentRole = 'court_secretary', updatedAt = NOW() WHERE id = ?`,
      [row.id]
    );
    updated += Number(result.affectedRows || 0);
  }

  const [after] = await connection.query(
    `SELECT id, currentRole, status FROM approval_requests
      WHERE entityType = 'disciplinary_action' AND status = 'pending'`
  );
  console.log(`\nUpdated ${updated} rows.`);
  console.log("Pending disciplinary after fix:");
  console.log(JSON.stringify(after, null, 2));

  await connection.end();
}

main().catch((err) => {
  console.error("fix-disciplinary-routing failed: " + redact(err && err.message ? err.message : String(err), ""));
  process.exit(1);
});

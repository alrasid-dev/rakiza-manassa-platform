// scripts/list-self-awarded-points.mjs
// قائمة كل نقاط "إنجاز مهمة" التي منحها الموظف لنفسه (createdByUserId = userId الخاص به).
// للتنظيف: node scripts/list-self-awarded-points.mjs --apply (حذف السجلات).

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

const APPLY = process.argv.includes("--apply");

const SQL = `
  SELECT se.id, p.fullName AS employee, se.points, se.taskId,
         (SELECT title FROM tasks WHERE id = se.taskId) AS task_title,
         se.createdByUserId, se.createdAt,
         (SELECT fullName FROM person_profiles WHERE userId = se.createdByUserId) AS awarder
  FROM score_events se
  JOIN person_profiles p ON p.id = se.profileId
  WHERE se.reason LIKE '%إنجاز مهمة%'
    AND se.points > 0
    AND se.createdByUserId = (SELECT userId FROM person_profiles WHERE id = se.profileId)
  ORDER BY se.createdAt DESC
`;

async function main() {
  const rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
  if (!rawUrl) { console.error("DATABASE_URL not found"); process.exit(1); }
  const url = new URL(rawUrl);
  const db = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";
  const c = await mysql.createConnection({
    host: url.hostname, port: Number(url.port || 4000), user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password), database: db,
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true,
  });

  const [rows] = await c.query(SQL);

  if (!APPLY) {
    console.log(JSON.stringify({
      mode: "dry-run",
      count: rows.length,
      totalPoints: rows.reduce((s, r) => s + Number(r.points), 0),
      employees: [...new Set(rows.map(r => r.employee))].length,
      rows,
    }, null, 2));
    await c.end();
    return;
  }

  const ids = rows.map(r => r.id);
  let deleted = 0;
  if (ids.length) {
    const [res] = await c.query("DELETE FROM score_events WHERE id IN (?)", [ids]);
    deleted = res.affectedRows;
  }
  console.log(JSON.stringify({ applied: true, deleted, removedPoints: rows.reduce((s, r) => s + Number(r.points), 0) }));
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

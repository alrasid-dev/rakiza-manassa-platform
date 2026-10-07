// scripts/audit-leave-reassignments.mjs
// يكشف كل موظف في إجازة نشطة/معتمدة + مهامه: كم نُقلت للبديل؟ كم تُركت (تراكمت)؟
// قراءة فقط.

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

const raw = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
if (!raw) { console.error("DATABASE_URL not found"); process.exit(1); }
const url = new URL(raw);
const db = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";
const conn = await mysql.createConnection({
  host: url.hostname, port: Number(url.port || 4000),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: db,
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true,
});

const [leaves] = await conn.query(`
  SELECT l.id, l.profileId, l.startAt, l.endAt, l.status, l.substituteProfileId,
         p.fullName AS profileName, s.fullName AS substituteName
  FROM leave_requests l
  JOIN person_profiles p ON p.id = l.profileId
  LEFT JOIN person_profiles s ON s.id = l.substituteProfileId
  WHERE l.status IN ('approved','active') AND l.endAt >= NOW()
  ORDER BY l.profileId
`);

console.log("=== الموظفون في إجازة + نقل مهامهم ===\n");
for (const lv of leaves) {
  const [own] = await conn.query(
    "SELECT COUNT(*) c FROM tasks WHERE assigneeProfileId = ? AND status IN ('new','in_progress','under_review','overdue','paused') AND archivedAt IS NULL",
    [lv.profileId],
  );
  const [transferred] = await conn.query(
    "SELECT COUNT(*) c FROM tasks WHERE reassignedFromProfileId = ? AND archivedAt IS NULL",
    [lv.profileId],
  );
  const [completedBySub] = await conn.query(
    "SELECT COUNT(*) c FROM tasks WHERE reassignedFromProfileId = ? AND status = 'completed'",
    [lv.profileId],
  );
  console.log(`- ${lv.profileName} (${lv.profileId}) → بديلة: ${lv.substituteName ?? "لا بديل"} (${lv.substituteProfileId ?? "-"})`);
  console.log(`    نُقلت للبديل: ${transferred[0].c} | تُركت مع الأصلية (تراكم): ${own[0].c} | أُنجزت لدى البديل: ${completedBySub[0].c}`);
}

await conn.end();

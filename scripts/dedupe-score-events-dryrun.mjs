// scripts/dedupe-score-events-dryrun.mjs
// DRY-RUN فقط: يعرض بالضبط أحداث score_events المكررة التي ستُحذف (وما سيُبقى) دون أي تعديل.
// كما يكشف أي خصم شُحن على ملف مختلف عن المكلف الفعلي بالمهمة (cross-charge).
// يقرأ DATABASE_URL من .env.production.local دون طباعة أسرار.

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

function redact(message) {
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

let rawUrl = "";

async function main() {
  rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
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

  console.log("=== DRY-RUN — لا تُنفَّذ أي حذف، عرض فقط ===\n");

  // 1) المجموعات المكررة
  const [groups] = await connection.query(`
    SELECT profileId, taskId, delayRecordId, reason, COUNT(*) AS cnt, SUM(points) AS sumPoints
    FROM score_events
    WHERE taskId IS NOT NULL OR delayRecordId IS NOT NULL
    GROUP BY profileId, taskId, delayRecordId, reason
    HAVING cnt > 1
    ORDER BY cnt DESC
  `);

  const toDelete = [];
  let deletePoints = 0;
  const deleteIds = [];

  for (const g of groups) {
    const [events] = await connection.query(
      "SELECT id, profileId, taskId, delayRecordId, points, reason, createdAt FROM score_events WHERE profileId = ? AND taskId <=> ? AND delayRecordId <=> ? AND reason = ? ORDER BY id ASC",
      [g.profileId, g.taskId, g.delayRecordId, g.reason],
    );
    const [profile] = await connection.query("SELECT fullName FROM person_profiles WHERE id = ?", [g.profileId]);
    const name = profile[0]?.fullName ?? "(غير معروف)";
    const kept = events[0];
    const dupes = events.slice(1);
    console.log(`[${name}] المهمة ${g.taskId} / المتعثرة ${g.delayRecordId} / "${g.reason}"`);
    console.log(`  يُبقى: id=${kept.id} points=${kept.points} (${new Date(kept.createdAt).toISOString()})`);
    for (const e of dupes) {
      console.log(`  سيُحذف: id=${e.id} points=${e.points} (${new Date(e.createdAt).toISOString()})`);
      toDelete.push(e);
      deleteIds.push(e.id);
      deletePoints += Number(e.points);
    }
  }

  console.log("\n=== ملخص الحذف (dry-run) ===");
  console.log(`أحداث ستُحذف: ${toDelete.length}`);
  console.log(`معرّفات الحذف: ${deleteIds.join(", ")}`);
  console.log(`النقاط التي ستُستعاد (موجب = رفع خصم): +${Math.abs(deletePoints)}`);

  // 2) كشف الشحن الخاطئ عبر الملفات
  const [cross] = await connection.query(`
    SELECT se.id, se.profileId, se.taskId, se.points, se.reason, se.createdAt,
           t.assigneeProfileId,
           pp.fullName AS chargedName,
           pa.fullName AS assigneeName
    FROM score_events se
    JOIN tasks t ON t.id = se.taskId
    JOIN person_profiles pp ON pp.id = se.profileId
    LEFT JOIN person_profiles pa ON pa.id = t.assigneeProfileId
    WHERE se.taskId IS NOT NULL AND se.profileId <> t.assigneeProfileId
    ORDER BY se.id
  `);

  console.log("\n=== كشف الشحن الخاطئ (خصم على غير المكلف) ===");
  if (!cross.length) {
    console.log("لا توجد حالات شحن خاطئ.");
  } else {
    for (const c of cross) {
      console.log(`- id=${c.id} خُصم على "${c.chargedName}" (${c.profileId}) رغم أن المكلف "${c.assigneeName}" (${c.assigneeProfileId}) — points=${c.points} task=${c.taskId} reason="${c.reason}"`);
    }
  }

  await connection.end();
}

main().catch((err) => {
  console.error("Dry-run failed: " + redact(err && err.message ? err.message : String(err)));
  process.exit(1);
});

// scripts/audit-duplicate-score-events.mjs
// يفحص score_events ويكشف الخصومات المكررة لنفس (ملف + مهمة + متعثرة + سبب).
// قراءة فقط — لا يعدّل أي بيانات. يقرأ DATABASE_URL من .env.production.local دون طباعة أسرار.

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

  // مجموعات مكررة (تستبعد أحداث الحضور/الانصراف اليومية التي taskId/delayRecordId = null).
  const [groups] = await connection.query(`
    SELECT profileId, taskId, delayRecordId, reason, COUNT(*) AS cnt, SUM(points) AS sumPoints
    FROM score_events
    WHERE taskId IS NOT NULL OR delayRecordId IS NOT NULL
    GROUP BY profileId, taskId, delayRecordId, reason
    HAVING cnt > 1
    ORDER BY cnt DESC
  `);

  console.log("=== التكرارات المكتشفة ===");
  console.log(`عدد المجموعات المكررة: ${groups.length}`);
  const totalExcess = groups.reduce((sum, g) => sum + (Number(g.cnt) - 1), 0);
  console.log(`إجمالي الأحداث الزائدة (المكررة): ${totalExcess}`);
  console.log(`إجمالي النقاط الزائدة المخصومة: ${groups.reduce((sum, g) => sum + (Number(g.cnt) - 1) * (Number(g.sumPoints) / Number(g.cnt)), 0).toFixed(1)}`);

  const affected = new Map();
  const details = [];
  for (const g of groups) {
    const [events] = await connection.query(
      "SELECT id, profileId, taskId, delayRecordId, points, reason, createdByUserId, createdAt FROM score_events WHERE profileId = ? AND taskId <=> ? AND delayRecordId <=> ? AND reason = ? ORDER BY createdAt",
      [g.profileId, g.taskId, g.delayRecordId, g.reason],
    );
    const [profile] = await connection.query("SELECT id, fullName FROM person_profiles WHERE id = ?", [g.profileId]);
    const name = profile[0]?.fullName ?? "(غير معروف)";
    affected.set(String(g.profileId), name);
    details.push({
      profileId: g.profileId,
      fullName: name,
      taskId: g.taskId,
      delayRecordId: g.delayRecordId,
      reason: g.reason,
      occurrences: Number(g.cnt),
      excess: Number(g.cnt) - 1,
      events: events.map((e) => ({ id: e.id, points: e.points, createdAt: e.createdAt })),
    });
  }

  console.log("\n=== الموظفون المتأثرون ===");
  for (const [id, name] of affected) {
    console.log(`- ${name} (profileId=${id})`);
  }

  console.log("\n=== تفاصيل المجموعات ===");
  for (const d of details) {
    console.log(`\n[${d.fullName}] المهمة ${d.taskId} / المتعثرة ${d.delayRecordId} / السبب: "${d.reason}"`);
    console.log(`  مرات التكرار: ${d.occurrences} (زائدة: ${d.excess})`);
    for (const e of d.events) {
      console.log(`  - id=${e.id} points=${e.points} createdAt=${new Date(e.createdAt).toISOString()}`);
    }
  }

  await connection.end();
}

main().catch((err) => {
  console.error("Audit failed: " + redact(err && err.message ? err.message : String(err)));
  process.exit(1);
});

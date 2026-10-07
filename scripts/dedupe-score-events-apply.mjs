// scripts/dedupe-score-events-apply.mjs
// يحذف أحداث score_events المكررة (يبقي الأقدم لكل مجموعة: نفس ملف + مهمة + متعثرة + سبب).
//
// وضع آمن: بدون --confirm يعمل كـ dry-run فقط ولا يعدّل شيئاً.
// التنفيذ الفعلي:  node scripts/dedupe-score-events-apply.mjs --confirm
//
// ملاحظة: لا يعالج «الشحن الخاطئ عبر الملفات» (خصم على غير المكلف) — ذلك قرار منفصل قيد المراجعة.

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
  const APPLY = process.argv.includes("--confirm");
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

  console.log(APPLY ? "=== تطبيق الحذف (--confirm) ===" : "=== DRY-RUN (بدون --confirm) ===");

  const [groups] = await connection.query(`
    SELECT profileId, taskId, delayRecordId, reason, COUNT(*) AS cnt
    FROM score_events
    WHERE taskId IS NOT NULL OR delayRecordId IS NOT NULL
    GROUP BY profileId, taskId, delayRecordId, reason
    HAVING cnt > 1
    ORDER BY cnt DESC
  `);

  const deleteIds = [];
  let deletePoints = 0;
  const report = [];

  for (const g of groups) {
    const [events] = await connection.query(
      "SELECT id, profileId, taskId, delayRecordId, points, reason, createdAt FROM score_events WHERE profileId = ? AND taskId <=> ? AND delayRecordId <=> ? AND reason = ? ORDER BY id ASC",
      [g.profileId, g.taskId, g.delayRecordId, g.reason],
    );
    const [profile] = await connection.query("SELECT fullName FROM person_profiles WHERE id = ?", [g.profileId]);
    const name = profile[0]?.fullName ?? "(غير معروف)";
    const kept = events[0];
    const dupes = events.slice(1);
    for (const e of dupes) {
      deleteIds.push(e.id);
      deletePoints += Number(e.points);
      report.push({ id: e.id, fullName: name, taskId: g.taskId, delayRecordId: g.delayRecordId, points: e.points, keptId: kept.id });
    }
  }

  console.log(`أحداث ستُحذف: ${deleteIds.length} · نقاط ستُستعاد: +${Math.abs(deletePoints)}`);
  for (const r of report) {
    console.log(`  id=${r.id} (${r.fullName}) task=${r.taskId} points=${r.points} → يُبقى id=${r.keptId}`);
  }

  if (!APPLY) {
    console.log("\nلم يُنفَّذ أي حذف (dry-run). مرّر --confirm للتنفيذ.");
    await connection.end();
    return;
  }

  if (!deleteIds.length) {
    console.log("لا توجد مكررات للحذف.");
    await connection.end();
    return;
  }

  await connection.beginTransaction();
  try {
    const [res] = await connection.query("DELETE FROM score_events WHERE id IN (?)", [deleteIds]);
    await connection.commit();
    console.log(`\nتم الحذف: ${res.affectedRows} حدث مكرر. النقاط المستعادة: +${Math.abs(deletePoints)}`);
  } catch (err) {
    await connection.rollback();
    throw err;
  }
  await connection.end();
}

main().catch((err) => {
  console.error("Apply failed (no changes committed): " + redact(err && err.message ? err.message : String(err)));
  process.exit(1);
});

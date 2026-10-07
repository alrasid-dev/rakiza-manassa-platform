// scripts/verify-and-fix-score-events.mjs
// تحقق + تصحيح أحداث النقاط المكررة/المشحونة خطأً، مع تدقيق audit_logs.
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

let rawUrl = "";
function redact(m) {
  let out = String(m);
  try { const u = new URL(rawUrl); if (u.password) out = out.split(u.password).join("***"); out = out.split(rawUrl).join("[REDACTED]"); } catch { /* ignore */ }
  return out;
}

async function main() {
  rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
  if (!rawUrl) { console.error("DATABASE_URL not found"); process.exit(1); }
  const url = new URL(rawUrl);
  const db = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";
  const conn = await mysql.createConnection({
    host: url.hostname, port: Number(url.port || 4000),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: db,
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true,
  });
  const q = async (sql, params = []) => (await conn.query(sql, params))[0];

  const groups = await q(`SELECT taskId, delayRecordId, reason, COUNT(*) cnt FROM score_events WHERE taskId IS NOT NULL OR delayRecordId IS NOT NULL GROUP BY taskId, delayRecordId, reason HAVING cnt > 1 ORDER BY cnt DESC`);
  const deleteIds = [];
  const moves = [];
  const logs = [];
  for (const g of groups) {
    const events = await q("SELECT se.id, se.profileId, se.createdAt, t.assigneeProfileId FROM score_events se LEFT JOIN tasks t ON t.id = se.taskId WHERE se.taskId <=> ? AND se.delayRecordId <=> ? AND se.reason = ? ORDER BY se.id ASC", [g.taskId, g.delayRecordId, g.reason]);
    const correct = events[0]?.assigneeProfileId ?? null;
    if (events[0] && correct != null && events[0].profileId !== correct) {
      moves.push({ id: events[0].id, from: events[0].profileId, to: correct, taskId: g.taskId, reason: g.reason });
    }
    for (const e of events.slice(1)) {
      if (correct != null && e.profileId !== correct) moves.push({ id: e.id, from: e.profileId, to: correct, taskId: g.taskId, reason: g.reason });
      deleteIds.push(e.id);
    }
  }

  const misattributed = await q(`SELECT se.id, se.profileId, se.taskId, se.reason, t.assigneeProfileId FROM score_events se JOIN tasks t ON t.id = se.taskId WHERE se.taskId IS NOT NULL AND se.profileId <> t.assigneeProfileId AND se.id NOT IN (${deleteIds.length ? deleteIds.join(",") : "0"}) ORDER BY se.id`);
  for (const m of misattributed) moves.push({ id: m.id, from: m.profileId, to: m.assigneeProfileId, taskId: m.taskId, reason: m.reason });

  const wrongDelays = await q(`SELECT d.id, d.relatedProfileId, d.taskId, t.assigneeProfileId FROM delay_records d JOIN tasks t ON t.id = d.taskId WHERE d.relatedProfileId <> t.assigneeProfileId`);

  console.log("=== جدول التصحيح ===\n");
  console.log(`سيُحذف ${deleteIds.length} حدث مكرر: ${deleteIds.join(", ")}`);
  console.log(`سيُنقل ${moves.length} حدث مشحون خطأً:`);
  for (const m of moves) console.log(`  - id=${m.id} (${m.from} → ${m.to}) task=${m.taskId} reason="${m.reason}"`);
  console.log(`سيُصحَّح ${wrongDelays.length} متعثرة:`);
  for (const d of wrongDelays) console.log(`  - delay id=${d.id} (${d.relatedProfileId} → ${d.assigneeProfileId})`);

  const affectedIds = [...new Set([...moves.map(m => m.from), ...moves.map(m => m.to)])];
  const before = {};
  for (const pid of affectedIds) {
    const r = await q("SELECT COALESCE(SUM(points),0) s FROM score_events WHERE profileId = ?", [pid]);
    const p = await q("SELECT fullName FROM person_profiles WHERE id = ?", [pid]);
    before[pid] = { name: p[0]?.fullName ?? "?", total: Number(r[0].s) };
  }

  await conn.beginTransaction();
  try {
    if (deleteIds.length) await conn.query("DELETE FROM score_events WHERE id IN (?)", [deleteIds]);
    for (const m of moves) {
      await conn.query("UPDATE score_events SET profileId = ? WHERE id = ?", [m.to, m.id]);
      logs.push(["score_event.reattributed", "score_event", m.id, { from: m.from, to: m.to, taskId: m.taskId, reason: m.reason }]);
    }
    for (const d of wrongDelays) {
      await conn.query("UPDATE delay_records SET relatedProfileId = ?, ownerProfileId = ? WHERE id = ?", [d.assigneeProfileId, d.assigneeProfileId, d.id]);
      logs.push(["delay_record.reattributed", "delay_record", d.id, { from: d.relatedProfileId, to: d.assigneeProfileId, taskId: d.taskId }]);
    }
    for (const id of deleteIds) logs.push(["score_event.deduped", "score_event", id, { reason: "duplicate" }]);
    for (const [action, entityType, entityId, metadata] of logs) {
      await conn.query("INSERT INTO audit_logs (actorUserId, actorProfileId, action, entityType, entityId, metadata, createdAt) VALUES (0, 0, ?, ?, ?, ?, NOW())", [action, entityType, entityId, JSON.stringify(metadata)]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }

  console.log("\n=== النقاط (قبل/بعد) ===\n");
  for (const pid of affectedIds) {
    const r = await q("SELECT COALESCE(SUM(points),0) s FROM score_events WHERE profileId = ?", [pid]);
    const p = await q("SELECT fullName FROM person_profiles WHERE id = ?", [pid]);
    const after = Number(r[0].s);
    console.log(`- ${p[0]?.fullName ?? "?"} (${pid}): ${before[pid].total} → ${after} (${after - before[pid].total >= 0 ? "+" : ""}${after - before[pid].total})`);
  }
  console.log(`\nتم: حذف ${deleteIds.length}، نقل ${moves.length}، تصحيح ${wrongDelays.length} متعثرة.`);
  await conn.end();
}

main().catch((err) => { console.error("Fix failed (rolled back): " + redact(err && err.message ? err.message : String(err))); process.exit(1); });

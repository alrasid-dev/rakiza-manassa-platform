// scripts/archive-wrongly-assigned.mjs
// أرشفة المهام الخاطئة الإسناد من دفعة 10-06 00:59 (720031 لسمية، 720032 لأماني).
// dry-run افتراضي؛ مرّر --confirm للتنفيذ. لا حذف — أرشفة فقط (archivedAt = NOW).

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

const BATCH_IDS = [720028, 720029, 720030, 720031, 720032, 720033];
const TARGET_IDS = [720031, 720032];

async function main() {
  const APPLY = process.argv.includes("--confirm");
  rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
  if (!rawUrl) { console.error("DATABASE_URL not found"); process.exit(1); }
  const url = new URL(rawUrl);
  const db = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";
  const conn = await mysql.createConnection({
    host: url.hostname, port: Number(url.port || 4000),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: db,
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true,
  });

  const [batch] = await conn.query("SELECT id,title,status,assigneeProfileId,cancellationReason,archivedAt FROM tasks WHERE id IN (?)", [BATCH_IDS]);
  console.log("=== فحص الدفعة 720028-720033 ===\n");
  for (const t of batch) {
    console.log(`id=${t.id} | status=${t.status} | assignee=${t.assigneeProfileId} | archived=${t.archivedAt ? "yes" : "NO"} | reason="${t.cancellationReason || "-"}"`);
  }

  const targets = batch.filter(t => TARGET_IDS.includes(t.id) && t.status === "cancelled" && !t.archivedAt);
  console.log("\n=== سيُؤرشف (archivedAt = NOW) ===\n");
  for (const t of targets) console.log(`id=${t.id} (assignee=${t.assigneeProfileId}) reason="${t.cancellationReason}"`);

  if (!APPLY) {
    console.log("\nDRY-RUN — لم يُنفَّذ. مرّر --confirm للأرشفة.");
    await conn.end();
    return;
  }

  await conn.beginTransaction();
  try {
    for (const t of targets) {
      await conn.query("UPDATE tasks SET archivedAt = NOW(), updatedAt = NOW() WHERE id = ?", [t.id]);
      await conn.query(
        "INSERT INTO audit_logs (actorUserId, actorProfileId, action, entityType, entityId, metadata, createdAt) VALUES (0, 0, 'task.archived', 'task', ?, ?, NOW())",
        [t.id, JSON.stringify({ reason: "wrongly-assigned - batch 10-06", fromStatus: t.status, cancellationReason: t.cancellationReason })],
      );
    }
    await conn.commit();
    console.log(`\nتمت أرشفة ${targets.length} مهمة بنجاح.`);
  } catch (err) {
    await conn.rollback();
    throw err;
  }
  await conn.end();
}

main().catch((err) => { console.error("Archive failed (rolled back): " + redact(err && err.message ? err.message : String(err))); process.exit(1); });

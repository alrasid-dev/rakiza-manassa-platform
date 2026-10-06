// scripts/archive-oct-1-women-overdue.mjs — أرشفة 7 مهام overdue محددة للقسم النسائي 1 أكتوبر (soft delete).
// الآلية: archivedAt (حذف ناعم) + سجل audit_logs — لا حذف نهائي.
// الاستخدام:
//   node scripts/archive-oct-1-women-overdue.mjs           → معاينة فقط
//   node scripts/archive-oct-1-women-overdue.mjs --apply   → أرشفة فعلية
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const REASON = "1 أكتوبر - القسم النسائي - استثناء";
const TASK_IDS = [300001, 300027, 300034, 330011, 330023, 330030, 330041];

function env(key) {
  for (const line of fs.readFileSync(path.resolve(".env.production.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("="); if (e === -1) continue;
    if (t.slice(0, e).trim() !== key) continue;
    let v = t.slice(e + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true, bigNumberStrings: true,
  timezone: "Z",
});

const [tasks] = await db.query(
  "SELECT t.id, t.title, t.status, t.assigneeProfileId, p.fullName AS assigneeName, t.scheduledFor, t.archivedAt FROM tasks t LEFT JOIN person_profiles p ON p.id = t.assigneeProfileId WHERE t.id IN (?) AND t.unitId = 5 AND t.archivedAt IS NULL ORDER BY t.id",
  [TASK_IDS]
);

console.log(`\n=== أرشفة ${tasks.length} مهمة overdue (قسم نسائي 1 أكتوبر) — ${APPLY ? "تنفيذ" : "معاينة"} ===\n`);
console.log("| taskId | العنوان | المُسند | status | scheduledFor | قبل (archivedAt) | بعد |");
console.log("|---|---|---|---|---|---|---|");
for (const t of tasks) {
  const after = APPLY ? "مؤرشف ✅" : "سيُؤرشف";
  console.log(`| ${t.id} | ${String(t.title || "").slice(0, 34)} | ${t.assigneeName || t.assigneeProfileId || "—"} | ${t.status} | ${t.scheduledFor.toISOString().slice(0, 10)} | NULL | ${after} |`);
}

const dateStr = new Date().toISOString().slice(0, 10);
const rows = ["taskId,title,assigneeProfileId,assigneeName,status,scheduledFor,oldStatus,newStatus,reason"];
for (const t of tasks) rows.push(`${t.id},"${String(t.title || "").replace(/"/g, '""')}",${t.assigneeProfileId ?? ""},"${(t.assigneeName || "").replace(/"/g, '""')}",${t.status},${t.scheduledFor.toISOString().slice(0, 10)},overdue,archived,${REASON}`);
fs.writeFileSync(path.resolve("reports", `archive-oct-1-women-overdue-${dateStr}.csv`), "\ufeff" + rows.join("\n"), "utf8");

if (APPLY) {
  for (const t of tasks) {
    await db.query("UPDATE tasks SET archivedAt = NOW(), archivedByUserId = 0, cancellationReason = ? WHERE id = ?", [`أرشفة - ${REASON}`, t.id]);
    await db.query(
      "INSERT INTO audit_logs (actorUserId, action, entityType, entityId, metadata) VALUES (0, 'task.archived', 'task', ?, ?)",
      [t.id, JSON.stringify({ reason: REASON, old_status: "overdue", new_status: "archived" })]
    );
  }
  console.log(`\n✅ أُرشفت ${tasks.length} مهمة (soft delete) + سُجّلت في audit_logs.`);
} else {
  console.log(`\n⛔ وضع المعاينة — لم يُنفَّذ أي تعديل. للتنفيذ: node scripts/archive-oct-1-women-overdue.mjs --apply`);
}
console.log(`حُفظ: reports/archive-oct-1-women-overdue-${dateStr}.csv`);

await db.end();

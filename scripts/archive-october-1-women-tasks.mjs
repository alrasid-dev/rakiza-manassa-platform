// scripts/archive-october-1-women-tasks.mjs — أرشفة كل مهام القسم النسائي (unitId=5) ليوم 2026-10-01.
// آلية الأرشفة: archivedAt (حذف ناعم) + سجل في audit_logs — لا حذف.
// الاستخدام:
//   node scripts/archive-october-1-women-tasks.mjs           → معاينة فقط (لا تعديل)
//   node scripts/archive-october-1-women-tasks.mjs --apply   → أرشفة فعلية
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const REASON = "1 أكتوبر - القسم النسائي";

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

// كل مهام القسم النسائي ليوم 1 أكتوبر غير المؤرشفة وغير الملغاة
const [tasks] = await db.query(`
  SELECT t.id, t.title, t.status, t.assigneeProfileId, p.fullName AS assigneeName,
         t.scheduledFor, t.createdAt, t.completedAt
  FROM tasks t
  LEFT JOIN person_profiles p ON p.id = t.assigneeProfileId
  WHERE t.unitId = 5
    AND t.archivedAt IS NULL
    AND t.status <> 'cancelled'
    AND DATE(t.scheduledFor) = '2026-10-01'
  ORDER BY t.status, t.id
`);

// تقسيم حسب الحالة — الحالات الحساسة (سجل عمل) تُعرض منفصلة
const SENSITIVE = new Set(["completed", "under_review", "in_progress", "paused"]);
const byStatus = {};
for (const t of tasks) byStatus[t.status] = (byStatus[t.status] || 0) + 1;

console.log(`\n=== مهام القسم النسائي 1 أكتوبر (غير مؤرشفة/غير ملغاة): ${tasks.length} — ${APPLY ? "تنفيذ" : "معاينة"} ===\n`);
console.log("توزيع الحالات:", JSON.stringify(byStatus));

const sensitiveTasks = tasks.filter(t => SENSITIVE.has(t.status));
const plainTasks = tasks.filter(t => !SENSITIVE.has(t.status));

if (sensitiveTasks.length > 0) {
  console.log(`\n⚠️ مهام بحالة sensitive (سجل عمل) — ${sensitiveTasks.length} مهمة (تتطلب موافقة قبل الأرشفة):`);
  console.log("| taskId | الحالة | العنوان | المُسند |");
  console.log("|---|---|---|---|");
  for (const t of sensitiveTasks) {
    console.log(`| ${t.id} | ${t.status} | ${String(t.title || "").slice(0, 40)} | ${t.assigneeName || t.assigneeProfileId || "—"} |`);
  }
}
if (plainTasks.length > 0) {
  console.log(`\nمهام قابلة للأرشفة المباشرة (new/overdue): ${plainTasks.length} مهمة.`);
}

// حفظ CSV
const dateStr = new Date().toISOString().slice(0, 10);
const rows = ["taskId,title,status,assigneeProfileId,assigneeName,scheduledFor,createdAt,sensitive"];
for (const t of tasks) {
  rows.push(`${t.id},"${String(t.title || "").replace(/"/g, '""')}",${t.status},${t.assigneeProfileId ?? ""},"${(t.assigneeName || "").replace(/"/g, '""')}",${t.scheduledFor.toISOString().slice(0, 16).replace("T", " ")},${t.createdAt.toISOString().slice(0, 16).replace("T", " ")},${SENSITIVE.has(t.status) ? "yes" : "no"}`);
}
fs.writeFileSync(path.resolve("reports", `archive-october-1-women-tasks-${dateStr}.csv`), "\ufeff" + rows.join("\n"), "utf8");

if (APPLY) {
  let archived = 0;
  for (const t of tasks) {
    await db.query("UPDATE tasks SET archivedAt = NOW(), archivedByUserId = 0, cancellationReason = ? WHERE id = ?", [`أرشفة - ${REASON}`, t.id]);
    await db.query("INSERT INTO audit_logs (actorUserId, action, entityType, entityId, metadata) VALUES (0, 'task.archived', 'task', ?, ?)", [t.id, JSON.stringify({ reason: REASON })]);
    archived += 1;
  }
  console.log(`\n✅ أُرشفت ${archived} مهمة (بدون حذف) + سُجّلت في audit_logs.`);
} else {
  console.log(`\n⛔ وضع المعاينة — لم يُنفَّذ أي تعديل. للتنفيذ: node scripts/archive-october-1-women-tasks.mjs --apply`);
}
console.log(`حُفظ: reports/archive-october-1-women-tasks-${dateStr}.csv`);

await db.end();

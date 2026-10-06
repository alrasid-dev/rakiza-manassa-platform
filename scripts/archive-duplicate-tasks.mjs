// scripts/archive-duplicate-tasks.mjs — أرشفة المهام المكررة (نفس القالب+اليوم+العنوان) — معاينة افتراضياً.
// الاستخدام:
//   node scripts/archive-duplicate-tasks.mjs           → معاينة فقط (لا تعديل)
//   node scripts/archive-duplicate-tasks.mjs --apply   → أرشفة فعلياً (لا حذف)
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");

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

const since = new Date(Date.now() - 180 * 24 * 3600 * 1000);
const [tasks] = await db.query(`
  SELECT id, title, templateId, scheduledFor, createdAt, assigneeProfileId, unitId, status
  FROM tasks
  WHERE templateId IS NOT NULL AND archivedAt IS NULL AND createdAt >= ?
  ORDER BY templateId, scheduledFor, createdAt, id
`, [since]);

// تجميع حسب (templateId + يوم الجدولة + العنوان) — المفتاح الصحيح لاكتشاف «النسخ الزائدة» من عطل cron
const groups = new Map();
for (const t of tasks) {
  const day = t.scheduledFor ? t.scheduledFor.toISOString().slice(0, 10) : "?";
  const key = `${t.templateId}|${day}|${t.title}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(t);
}

const dupGroups = [...groups.values()].filter(g => g.length > 1);

// أولوية الاحتفاظ عند التكرار: الأكثر تقدماً (completed > under_review > in_progress > new > overdue)
const STATUS_PRIORITY = { completed: 5, under_review: 4, in_progress: 3, new: 2, overdue: 1 };

// داخل كل مجموعة: احتفظ بالأكثر تقدماً، وأرشف الباقي
const toArchive = [];
const kept = [];
for (const group of dupGroups) {
  const sorted = [...group].sort((a, b) => {
    const p = (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0);
    if (p !== 0) return p;
    return (a.createdAt - b.createdAt) || (a.id - b.id);
  });
  kept.push(sorted[0]);
  for (const extra of sorted.slice(1)) toArchive.push(extra);
}

console.log(`\n=== المهام المكررة (${dupGroups.length} مجموعة، ${toArchive.length} مهمة زائدة) — ${APPLY ? "تنفيذ" : "معاينة"} ===\n`);
console.log(`| taskId | العنوان | المُسند | scheduledFor | createdAt | الحالة |`);
console.log(`|---|---|---|---|---|---|`);

const rows = ["taskId,title,assigneeProfileId,scheduledFor,createdAt,status,action"];
for (const t of [...kept, ...toArchive]) {
  const action = toArchive.includes(t) ? "ARCHIVE" : "KEEP";
  const day = t.scheduledFor ? t.scheduledFor.toISOString().slice(0, 16).replace("T", " ") : "?";
  const created = t.createdAt ? t.createdAt.toISOString().slice(0, 16).replace("T", " ") : "?";
  console.log(`| ${t.id} | ${String(t.title || "").slice(0, 28)} | ${t.assigneeProfileId ?? "null"} | ${day} | ${created} | ${t.status} | ${action} |`);
  rows.push(`${t.id},"${String(t.title || "").replace(/"/g, '""')}",${t.assigneeProfileId ?? ""},${day},${created},${t.status},${action}`);
}

const dateStr = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.resolve("reports", `archive-duplicate-tasks-preview-${dateStr}.csv`), "\ufeff" + rows.join("\n"), "utf8");

console.log(`\n=== الملخص ===`);
console.log(`مجموعات مكررة: ${dupGroups.length}`);
console.log(`سيُحتفظ بها (الأقدم): ${kept.length}`);
console.log(`ستُؤرشف: ${toArchive.length}`);
if (APPLY) {
  let archived = 0;
  for (const t of toArchive) {
    await db.query("UPDATE tasks SET archivedAt = NOW(), archivedByUserId = 0, cancellationReason = 'تكرار - أرشفة تلقائية' WHERE id = ?", [t.id]);
    archived += 1;
  }
  console.log(`\n✅ أُرشفت ${archived} مهمة (بدون حذف).`);
} else {
  console.log(`\n⛔ وضع المعاينة — لم يُنفَّذ أي تعديل. للتنفيذ: node scripts/archive-duplicate-tasks.mjs --apply`);
}
console.log(`حُفظ: reports/archive-duplicate-tasks-preview-${dateStr}.csv`);

await db.end();

// scripts/archive/escalated-tasks-unit3-2026-10-15.mjs
// أرشفة 10 مهام مُصعّدة (overdue) في قسم 3 (تسليم الأحكام) — soft-archive فقط (بدون حذف).
// يعادل استدعاء resolveTaskEscalation({ action: "archive", reason, actorUserId: 1 }):
//   - UPDATE tasks.archivedAt (يبقي status = "overdue")
//   - INSERT task_updates (progress) بعنوان "معالجة التصعيد (أرشفة)"
//   - INSERT audit_logs (task.escalation_resolved)
// الاستخدام:
//   node scripts/archive/escalated-tasks-unit3-2026-10-15.mjs            → معاينة فقط
//   node scripts/archive/escalated-tasks-unit3-2026-10-15.mjs --confirm  → أرشفة فعلية
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const CONFIRM = process.argv.includes("--confirm");
const REASON = "أرشفة المتأخرات - 2026-10-15";
const ACTOR_USER_ID = 1; // مالك المنصة
const TASK_IDS = [840001, 990027, 990028, 1020028, 1020029, 1020061, 1020062, 1020063, 1020064, 1020065];

function env(key) {
  for (const file of [".env", ".env.production.local"]) {
    const p = path.resolve(file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const e = t.indexOf("=");
      if (e === -1) continue;
      if (t.slice(0, e).trim() !== key) continue;
      let v = t.slice(e + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v;
    }
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

// 1) جلب + تحقق
const [rows] = await db.query(
  "SELECT id, title, unitId, status, archivedAt FROM tasks WHERE id IN (?) ORDER BY id",
  [TASK_IDS]
);

const foundIds = rows.map((r) => Number(r.id));
const missing = TASK_IDS.filter((id) => !foundIds.includes(id));
const invalid = rows.filter((r) => r.unitId !== 3 || r.status !== "overdue" || r.archivedAt !== null);

if (missing.length || invalid.length) {
  console.error("⛔ فشل التحقق — إيقاف:");
  if (missing.length) console.error("  مفقودة:", missing);
  if (invalid.length) console.error("  غير مطابقة:", invalid.map((r) => ({ id: r.id, unitId: r.unitId, status: r.status, archivedAt: r.archivedAt })));
  await db.end();
  process.exit(1);
}

console.log(`\n=== ${CONFIRM ? "تنفيذ" : "معاينة"} أرشفة ${rows.length} مهمة مُصعّدة (قسم 3) ===\n`);
for (const t of rows) {
  console.log(`- ${t.id} | ${String(t.title || "").slice(0, 42)} | ${t.status} | unitId=${t.unitId} | archivedAt=${t.archivedAt ?? "NULL"}`);
}

if (!CONFIRM) {
  console.log(`\n⛔ وضع المعاينة — لم يُنفَّذ أي تعديل. للتنفيذ: node scripts/archive/escalated-tasks-unit3-2026-10-15.mjs --confirm`);
  await db.end();
  process.exit(0);
}

// 2) أرشفة كل مهمة (soft + task_updates + audit)
let ok = 0, failed = 0;
for (const t of rows) {
  try {
    await db.beginTransaction();
    const [upd] = await db.query(
      "UPDATE tasks SET archivedAt = NOW(), updatedAt = NOW() WHERE id = ? AND unitId = 3 AND status = 'overdue' AND archivedAt IS NULL",
      [t.id]
    );
    if (upd.affectedRows === 0) throw new Error("لم تتأثر أي صف (ربما مؤرشفة مسبقاً)");
    await db.query(
      "INSERT INTO task_updates (taskId, actorUserId, updateType, note) VALUES (?, ?, 'progress', ?)",
      [t.id, ACTOR_USER_ID, `معالجة التصعيد (أرشفة): ${REASON}`]
    );
    await db.query(
      "INSERT INTO audit_logs (actorUserId, action, entityType, entityId, metadata) VALUES (?, 'task.escalation_resolved', 'task', ?, ?)",
      [ACTOR_USER_ID, t.id, JSON.stringify({ action: "archive", reason: REASON })]
    );
    await db.commit();
    console.log(`✅ أُرشفت ${t.id}`);
    ok += 1;
  } catch (e) {
    await db.rollback();
    console.error(`❌ فشل ${t.id}: ${e.message}`);
    failed += 1;
  }
}

console.log(`\n=== التقرير النهائي: نجح ${ok}، فشل ${failed} ===`);
await db.end();

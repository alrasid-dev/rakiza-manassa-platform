#!/usr/bin/env node
/**
 * بيانات تجريبية خفيفة (Sandbox) لاختبار التقارير — لمدة 72 ساعة فقط.
 *
 * تُنشئ في ثلاثة أقسام (القسم النسائي، شؤون الملازمين، قسم تسليم الأحكام):
 *   - موظفين اثنين لكل قسم.
 *   - مهمة واحدة (قيد التنفيذ) لموظف.
 *   - طلب إجازة واحد (معتمدة) لموظف آخر.
 *   - معاملة واحدة متأخرة (overdue) لتظهر في تقارير التأخير والتنبيهات.
 *
 * كل البيانات تُوسَم بعلامة "sandbox-72h" ليحذفها سكربت التنظيف تلقائياً.
 *
 * الاستخدام:
 *   node --env-file=.env.production.local scripts/seed-sandbox-data.mjs          # توليد البيانات
 *   node --env-file=.env.production.local scripts/seed-sandbox-data.mjs --cleanup # حذف البيانات المنتهية (>72 ساعة)
 *
 * جدولة التنظيف الآلي (Cron Job): شغّل وضع --cleanup كل ساعة:
 *   0 * * * * cd /app && node --env-file=.env.production.local scripts/seed-sandbox-data.mjs --cleanup
 */
import mysql from "mysql2/promise";

const MARKER = "sandbox-72h";
const SYSTEM_USER_ID = Number(process.env.SYSTEM_ACTOR_ID || 1);
const CLEANUP = process.argv.includes("--cleanup");

const db = await mysql.createConnection(process.env.DATABASE_URL);

const DEPARTMENTS = [
  { name: "القسم النسائي", code: "SANDBOX_WOMEN" },
  { name: "شؤون الملازمين", code: "SANDBOX_TRAINEES" },
  { name: "قسم تسليم الأحكام", code: "SANDBOX_JUDGMENTS" },
];

async function sandboxProfileIds() {
  const [rows] = await db.query(
    "SELECT id FROM person_profiles WHERE sourceReference = ?",
    [MARKER],
  );
  return rows.map((row) => row.id);
}

async function cleanup() {
  const profileIds = await sandboxProfileIds();
  const placeholders = profileIds.length ? profileIds.map(() => "?").join(",") : null;

  // حذف المعاملات المتأخرة والمهام والإجازات والملفات المرتبطة بعلامة الساندبوكس.
  await db.query("DELETE FROM delay_records WHERE sourceReference = ?", [MARKER]);
  await db.query("DELETE FROM tasks WHERE taskNotes = ?", [MARKER]);
  if (placeholders) {
    await db.query(`DELETE FROM leave_requests WHERE profileId IN (${placeholders}) OR note = ?`, [...profileIds, MARKER]);
  } else {
    await db.query("DELETE FROM leave_requests WHERE note = ?", [MARKER]);
  }
  if (placeholders) {
    await db.query(`DELETE FROM person_profiles WHERE sourceReference = ? AND id IN (${placeholders})`, [MARKER, ...profileIds]);
  }
  console.log("[sandbox] تم حذف البيانات التجريبية المنتهية.");
  return;
}

async function seed() {
  const now = new Date();
  const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const leaveEnd = new Date(now.getTime() + 8 * 60 * 60 * 1000);

  for (const dept of DEPARTMENTS) {
    // إيجاد أو إنشاء الوحدة التنظيمية.
    let [units] = await db.query("SELECT id FROM organization_units WHERE name LIKE ? LIMIT 1", [`%${dept.name}%`]);
    let unitId = units[0]?.id;
    if (!unitId) {
      const [inserted] = await db.query(
        "INSERT INTO organization_units (name, code, isActive) VALUES (?, ?, 1)",
        [dept.name, dept.code],
      );
      unitId = inserted.insertId;
    }

    // إنشاء موظفين اثنين (إن لم يكونا موجودين).
    const [profiles] = await db.query(
      "SELECT id FROM person_profiles WHERE sourceReference = ? AND unitId = ? LIMIT 2",
      [MARKER, unitId],
    );
    let [p1, p2] = profiles;
    if (!p1) {
      const [r1] = await db.query(
        "INSERT INTO person_profiles (unitId, personType, fullName, email, status, activityState, sourceReference) VALUES (?, 'administrative', ?, ?, 'active', 'inactive', ?)",
        [unitId, `${dept.name} — موظف تجريبي ١`, `sandbox1.${dept.code.toLowerCase()}@moj.gov.sa`, MARKER],
      );
      p1 = { id: r1.insertId };
    }
    if (!p2) {
      const [r2] = await db.query(
        "INSERT INTO person_profiles (unitId, personType, fullName, email, status, activityState, sourceReference) VALUES (?, 'administrative', ?, ?, 'active', 'inactive', ?)",
        [unitId, `${dept.name} — موظف تجريبي ٢`, `sandbox2.${dept.code.toLowerCase()}@moj.gov.sa`, MARKER],
      );
      p2 = { id: r2.insertId };
    }

    // مهمة واحدة (قيد التنفيذ).
    await db.query(
      "INSERT INTO tasks (unitId, title, status, priority, assigneeProfileId, assignedByUserId, scheduledFor, dueAt, taskNotes) VALUES (?, ?, 'in_progress', 'normal', ?, ?, ?, ?, ?)",
      [unitId, `[تجريبي] مراجعة معاملة — ${dept.name}`, p1.id, SYSTEM_USER_ID, now, dueAt, MARKER],
    );

    // طلب إجازة واحد (معتمدة).
    await db.query(
      "INSERT INTO leave_requests (profileId, requestType, startAt, endAt, durationMinutes, status, requestedByUserId, note) VALUES (?, 'leave', ?, ?, 480, 'approved', ?, ?)",
      [p2.id, now, leaveEnd, SYSTEM_USER_ID, MARKER],
    );

    // معاملة واحدة متأخرة.
    await db.query(
      "INSERT INTO delay_records (unitId, relatedProfileId, title, category, status, ownerProfileId, sourceReference, createdByUserId) VALUES (?, ?, ?, 'تجريبي', 'overdue', ?, ?, ?)",
      [unitId, p1.id, `[تجريبي] معاملة متأخرة — ${dept.name}`, p1.id, MARKER, SYSTEM_USER_ID],
    );

    console.log(`[sandbox] أُنشئت بيانات ${dept.name} (مهمة + إجازة + معاملة متأخرة).`);
  }
  console.log("[sandbox] اكتمل توليد البيانات التجريبية. ستُحذف تلقائياً بعد 72 ساعة عبر وضع --cleanup.");
  return;
}

try {
  if (CLEANUP) await cleanup();
  else await seed();
} finally {
  await db.end();
}

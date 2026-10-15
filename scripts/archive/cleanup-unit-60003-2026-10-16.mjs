// scripts/archive/cleanup-unit-60003-2026-10-16.mjs
// تحويل موظفي قسم 60003 (إدارة الجلسات) المتبقين من in_person إلى remote.
// (المهام الجديدة والقوالب وُجدت مؤرشفة/غير نشطة مسبقًا — لا حاجة لإعادة أرشفتها.)
// node scripts/archive/cleanup-unit-60003-2026-10-16.mjs            → معاينة فقط
// node scripts/archive/cleanup-unit-60003-2026-10-16.mjs --confirm  → تنفيذ فعلي
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const CONFIRM = process.argv.includes("--confirm");
const ACTOR_USER_ID = 1; // مالك المنصة

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

const rawUrl = env("DATABASE_URL");
if (!rawUrl) {
  console.error("DATABASE_URL غير موجود في .env أو .env.production.local");
  process.exit(1);
}

const u = new URL(rawUrl);
const db = await mysql.createConnection({
  host: u.hostname,
  port: Number(u.port || 4000),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true,
  bigNumberStrings: true,
  timezone: "Z",
});

// 1) جلب الموظفين النشطين بـ in_person في القسم
const [rows] = await db.query(
  "SELECT id, fullName, attendanceMode, status FROM person_profiles WHERE unitId = 60003 AND status = 'active' AND attendanceMode = 'in_person' ORDER BY id"
);

console.log(`\n=== ${CONFIRM ? "تنفيذ" : "معاينة"} تحويل ${rows.length} موظف إلى remote (قسم 60003) ===\n`);
for (const r of rows) {
  console.log(`  #${r.id} | ${String(r.fullName || "").slice(0, 40)} | attendanceMode=${r.attendanceMode} | status=${r.status}`);
}

if (!rows.length) {
  console.log("\nلا يوجد موظفون نشطون بحاجة للتحويل (in_person).");
  await db.end();
  process.exit(0);
}

if (!CONFIRM) {
  console.log(`\n⛔ وضع المعاينة — لم يُنفَّذ أي تعديل. للتنفيذ: node scripts/archive/cleanup-unit-60003-2026-10-16.mjs --confirm`);
  await db.end();
  process.exit(0);
}

// 2) تنفيذ التحويل
let ok = 0, failed = 0;
for (const r of rows) {
  try {
    await db.beginTransaction();
    const [upd] = await db.query(
      "UPDATE person_profiles SET attendanceMode = 'remote', updatedAt = NOW() WHERE id = ? AND unitId = 60003 AND status = 'active' AND attendanceMode = 'in_person'",
      [r.id]
    );
    if (upd.affectedRows === 0) throw new Error("لم تتأثر أي صف (ربما حُوّل مسبقًا)");
    await db.query(
      "INSERT INTO audit_logs (actorUserId, action, entityType, entityId, metadata) VALUES (?, 'unit60003.cleanup', 'person_profile', ?, ?)",
      [ACTOR_USER_ID, r.id, JSON.stringify({ attendanceMode: { from: "in_person", to: "remote" }, reason: "قسم 60003 (إدارة الجلسات) — تحويل إلى عن بُعد" })]
    );
    await db.commit();
    console.log(`✅ حُوّل ${r.id} إلى remote`);
    ok += 1;
  } catch (e) {
    await db.rollback();
    console.error(`❌ فشل ${r.id}: ${e.message}`);
    failed += 1;
  }
}

console.log(`\n=== التقرير النهائي: نجح ${ok}، فشل ${failed} ===`);
await db.end();

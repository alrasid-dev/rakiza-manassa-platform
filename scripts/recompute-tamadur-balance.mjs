// scripts/recompute-tamadur-balance.mjs — معاينة (dry-run) لإعادة حساب رصيد تماضر 1448-04.
// لا ينفّذ أي UPDATE. يعرض "قبل" و"بعد المقترح" فقط.
import fs from "node:fs";
import mysql from "mysql2/promise";

function env(key) {
  for (const line of fs.readFileSync(".env.production.local", "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("="); if (e === -1) continue;
    if (t.slice(0, e).trim() !== key) continue;
    let v = t.slice(e + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

const PROFILE_ID = 60132;
const MONTH = "1448-04";

const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true, bigNumberStrings: true,
  timezone: "Z", // قراءة UTC موحّدة (نفس إصلاح المهمة 1)
});

const [profile] = await db.query("SELECT id, fullName, attendanceMode FROM person_profiles WHERE id = ?", [PROFILE_ID]);
console.log("الموظفة:", profile[0]?.fullName, "| attendanceMode:", profile[0]?.attendanceMode);

console.log("\n=== قبل: attendance_records ===");
const [att] = await db.query("SELECT id, recordDate, checkInAt, checkOutAt, status, negativeMinutes, penaltyMinutes FROM attendance_records WHERE profileId = ? ORDER BY id", [PROFILE_ID]);
for (const r of att) {
  console.log(`id=${r.id} checkIn=${r.checkInAt?.toISOString?.() ?? r.checkInAt} checkOut=${r.checkOutAt?.toISOString?.() ?? "NULL"} negative=${r.negativeMinutes} penalty=${r.penaltyMinutes} status=${r.status}`);
}

console.log("\n=== قبل: leave_requests (استئذان/إجازة) ===");
const [lv] = await db.query("SELECT id, requestType, startAt, endAt, durationMinutes, status, hijriMonthKey FROM leave_requests WHERE profileId = ? ORDER BY id", [PROFILE_ID]);
for (const r of lv) {
  console.log(`id=${r.id} type=${r.requestType} start=${r.startAt?.toISOString?.() ?? r.startAt} end=${r.endAt?.toISOString?.() ?? r.endAt} dur=${r.durationMinutes} status=${r.status} month=${r.hijriMonthKey}`);
}

console.log("\n=== قبل: monthly_balances ===");
const [mb] = await db.query("SELECT * FROM monthly_balances WHERE profileId = ? AND hijriMonthKey = ?", [PROFILE_ID, MONTH]);
console.log(mb[0] ?? "(لا يوجد سجل)");

// === حساب "بعد المقترح" (معاينة فقط) ===
// 1) تماضر remote → معفاة من عقوبة عدم الانصراف (المهمة 5) → تصفير negative+penalty لسجل عدم الانصراف.
// 2) الاستئذان المتأخر → المسار الصحيح approveLateExcuse → تصفير penaltyMinutes (المهمة 2).
// 3) الخروج المبكر: checkOut الفعلي 14:15 (بعد إصلاح التوقيت) → سلبي 0، وليس 180 (المهمة 4).
const missingCheckoutPenalty = att.filter(r => r.penaltyMinutes > 0 || (r.negativeMinutes > 0 && !r.checkOutAt));
const correctedNegative = att.reduce((sum, r) => {
  // بعد الإصلاح: سجل عدم الانصراف (remote معفاة) لا يُحسب سلبي.
  if (!r.checkOutAt && r.negativeMinutes > 0) return sum; // معفاة
  return sum + (r.negativeMinutes || 0);
}, 0);
const correctedPenalty = 0; // العقوبة تُلغى (remote معفاة + استئذان متأخر معتمد)
const excuseMinutes = lv.filter(r => r.requestType === "permission" && r.status === "approved").length * 240;
const positiveMinutes = 0;
const netMinutes = positiveMinutes - correctedNegative - correctedPenalty + excuseMinutes;

console.log("\n=== بعد المقترح (معاينة — لا UPDATE) ===");
console.log(`سجلات عدم الانصراف (remote معفاة) ستُصفَّر: ${missingCheckoutPenalty.length} سجل`);
console.log(`negativeMinutes المقترح: ${correctedNegative}`);
console.log(`penaltyMinutes المقترح: ${correctedPenalty}`);
console.log(`excuseMinutes: ${excuseMinutes}`);
console.log(`netMinutes المقترح: ${netMinutes}`);

console.log("\n⚠️ هذه معاينة فقط — لم يُنفَّذ أي UPDATE. انتظار الموافقة.");

await db.end();

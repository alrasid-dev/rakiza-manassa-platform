// scripts/recompute-all-balances-dryrun.mjs
// فحص شامل (dry-run) لإعادة حساب رصيد كل الموظفين/الأشهر — يعرض قبل/بعد فقط، لا UPDATE.
// المعادلة الصحيحة: net = positive − negative − penalty + excuse
// remote: negative=0, penalty=0, excuse يبقى. in_person/mixed: negative/penalty يُحسبان.
import fs from "node:fs";
import path from "node:path";
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

function hijriMonthKey(date) {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric", month: "numeric" }).formatToParts(date);
  const year = parts.find(p => p.type === "year")?.value ?? "0";
  const month = (parts.find(p => p.type === "month")?.value ?? "0").padStart(2, "0");
  return `${year}-${month}`;
}

const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true, bigNumberStrings: true,
  timezone: "Z", // قراءة UTC موحّدة (نفس إصلاح التوقيت)
});

const [balances] = await db.query(
  `SELECT mb.id, mb.profileId, mb.hijriMonthKey, mb.positiveMinutes, mb.negativeMinutes,
          mb.excuseMinutes, COALESCE(mb.penaltyMinutes, 0) AS penaltyMinutes, mb.netMinutes,
          p.fullName, p.attendanceMode
   FROM monthly_balances mb
   LEFT JOIN person_profiles p ON p.id = mb.profileId
   ORDER BY mb.profileId, mb.hijriMonthKey`
);

const rows = [];
for (const b of balances) {
  const mode = b.attendanceMode ?? "in_person";
  const [att] = await db.query(
    "SELECT recordDate, checkInAt, positiveMinutes, negativeMinutes, COALESCE(penaltyMinutes, 0) AS penaltyMinutes FROM attendance_records WHERE profileId = ?",
    [b.profileId],
  );
  const monthAtt = att.filter(r => hijriMonthKey(new Date(r.recordDate)) === b.hijriMonthKey);
  let posNew = 0, negNew = 0, penNew = 0;
  for (const r of monthAtt) {
    posNew += Number(r.positiveMinutes || 0);
    // النمط التاريخي وقت البصمة: بصمة دخول + تصنيف in_person → كان remote (معفى).
    const histMode = (mode === "in_person" && r.checkInAt) ? "remote" : mode;
    if (histMode !== "remote") {
      negNew += Number(r.negativeMinutes || 0);
      penNew += Number(r.penaltyMinutes || 0);
    }
  }
  const [lv] = await db.query(
    "SELECT id FROM leave_requests WHERE profileId = ? AND hijriMonthKey = ? AND requestType = 'permission' AND status = 'approved'",
    [b.profileId, b.hijriMonthKey],
  );
  const excNew = lv.length * 240;
  const netNew = posNew - negNew - penNew + excNew;

  const posOld = Number(b.positiveMinutes || 0);
  const negOld = Number(b.negativeMinutes || 0);
  const penOld = Number(b.penaltyMinutes || 0);
  const excOld = Number(b.excuseMinutes || 0);
  const netOld = Number(b.netMinutes || 0);
  const delta = netNew - netOld;

  let reason = "—";
  if (delta === 0) reason = "لا تغيير";
  else if (mode === "remote") reason = "إلغاء عقوبة remote";
  else if (penOld > 0) reason = "إدراج penalty";
  else reason = "إعادة حساب";

  rows.push({
    profileId: b.profileId, name: b.fullName, month: b.hijriMonthKey, mode,
    posOld, posNew, negOld, negNew, penOld, penNew, excOld, excNew, netOld, netNew, delta, reason,
  });
}

await db.end();

// === إخراج ===
const affected = rows.filter(r => r.delta !== 0);
const improved = affected.filter(r => r.delta > 0);
const worsened = affected.filter(r => r.delta < 0);
const totalDelta = rows.reduce((s, r) => s + r.delta, 0);
const affectedEmployees = new Set(affected.map(r => r.profileId)).size;

console.log("=== ملخص تنفيذي ===");
console.log("إجمالي الصفوف المفحوصة:", rows.length);
console.log("الصفوف المتأثرة:", affected.length);
console.log("الموظفون المتأثرون:", affectedEmployees);
console.log("تحسّن (delta>0):", improved.length, "| ساء (delta<0):", worsened.length);
console.log("مجموع delta:", totalDelta);
console.log("");
console.log("=== تقسيم حسب السبب ===");
const byReason = {};
for (const r of affected) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
for (const [k, v] of Object.entries(byReason)) console.log(` - ${k}: ${v}`);

console.log("");
console.log("=== الجدول (أول 60) ===");
console.log(["profileId", "name", "month", "mode", "pos", "neg o→n", "pen o→n", "exc o→n", "net o→n", "delta", "السبب"].join("\t"));
for (const r of rows.slice(0, 60)) {
  console.log([r.profileId, (r.name || "").slice(0, 18), r.month, r.mode, r.posNew,
    `${r.negOld}→${r.negNew}`, `${r.penOld}→${r.penNew}`, `${r.excOld}→${r.excNew}`,
    `${r.netOld}→${r.netNew}`, r.delta, r.reason].join("\t"));
}

// === حفظ CSV + JSON ===
const dateStr = new Date().toISOString().slice(0, 10);
const dir = path.resolve("reports");
fs.mkdirSync(dir, { recursive: true });
const header = "profileId,name,month,mode,posOld,posNew,negOld,negNew,penOld,penNew,excOld,excNew,netOld,netNew,delta,reason";
const csvLines = [header];
for (const r of rows) {
  csvLines.push([r.profileId, `"${(r.name || "").replace(/"/g, '""')}"`, r.month, r.mode,
    r.posOld, r.posNew, r.negOld, r.negNew, r.penOld, r.penNew, r.excOld, r.excNew,
    r.netOld, r.netNew, r.delta, r.reason].join(","));
}
const csvPath = path.join(dir, `recompute-preview-final-${dateStr}.csv`);
const jsonPath = path.join(dir, `recompute-preview-final-${dateStr}.json`);
fs.writeFileSync(csvPath, csvLines.join("\n") + "\n", "utf8");
fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), summary: { total: rows.length, affected: affected.length, affectedEmployees, improved: improved.length, worsened: worsened.length, totalDelta, byReason }, rows }, null, 2), "utf8");
console.log(`\nحُفظ التقرير: ${csvPath}`);
console.log(`حُفظ التقرير: ${jsonPath}`);

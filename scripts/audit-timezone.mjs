// scripts/audit-timezone.mjs — تشخيص فرق التوقيت (3 ساعات) في سجلات الحضور.
// يطبع: إعدادات MySQL الزمنية، أنواع الأعمدة، والسجلات التي فيها فرق 180 دقيقة.
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

const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true, bigNumberStrings: true,
});

const [tz] = await db.query("SELECT @@global.time_zone AS g, @@session.time_zone AS s, NOW() AS n, UTC_TIMESTAMP() AS u");
console.log("=== إعدادات MySQL الزمنية ===");
console.log("global.time_zone :", tz[0].g);
console.log("session.time_zone :", tz[0].s);
console.log("NOW()            :", tz[0].n, "->", new Date(tz[0].n).toISOString());
console.log("UTC_TIMESTAMP()  :", tz[0].u);
console.log("JS now (UTC)     :", new Date().toISOString());

const col = async (table, colname) => {
  const [r] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${colname}'`);
  return r[0]?.Type ?? "(none)";
};
console.log("\n=== أنواع الأعمدة (TIMESTAMP vs DATETIME) ===");
for (const [t, c] of [["attendance_records", "checkInAt"], ["attendance_records", "checkOutAt"], ["tasks", "scheduledFor"], ["tasks", "dueAt"], ["leave_requests", "startAt"], ["leave_requests", "endAt"]]) {
  console.log(`${t}.${c}:`, await col(t, c));
}

// === كشف السجلات ذات فرق 180 دقيقة ===
// الوقت الحقيقي للرياض = UTC + 3 ساعات. الدالة riyadhMinutesOfDay تحسب ذلك.
function riyadhMinutesOfDay(now) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const f = (n) => Number(parts.find(p => p.type === n)?.value || "0");
  return f("hour") * 60 + f("minute");
}
// دقائق اليوم UTC (كما لو أُخذت getUTCHours/getUTCMinutes بدون تحويل).
function utcMinutesOfDay(now) {
  const d = new Date(now);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

const [records] = await db.query(
  "SELECT id, profileId, recordDate, checkInAt, checkOutAt, status, negativeMinutes, penaltyMinutes FROM attendance_records ORDER BY id"
);
console.log(`\n=== إجمالي سجلات الحضور: ${records.length} ===`);
const flagged = [];
for (const r of records) {
  if (!r.checkInAt) continue;
  const utcMin = utcMinutesOfDay(r.checkInAt);
  const riyadhMin = riyadhMinutesOfDay(r.checkInAt);
  const diff = riyadhMin - utcMin;
  // فرق 180 دقيقة (3 ساعات) بين القراءة UTC الخام وقراءة الرياض.
  if (Math.abs(diff - 180) <= 5) flagged.push({ ...r, utcMin, riyadhMin, diff });
}
console.log(`سجلات فيها فرق ~180 دقيقة بين UTC والرياض (checkIn): ${flagged.length}`);
for (const f of flagged.slice(0, 60)) {
  console.log(` - id=${f.id} profileId=${f.profileId} checkIn=${f.checkInAt.toISOString().slice(11,16)}Z utcMin=${f.utcMin} riyadhMin=${f.riyadhMin} negative=${f.negativeMinutes} penalty=${f.penaltyMinutes}`);
}

await db.end();

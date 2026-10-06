// scripts/audit-active-tasks.mjs — فحص قراءة فقط (SELECT) لقياس أثر السياسة الجديدة على المهام النشطة.
import fs from "node:fs";
import mysql from "mysql2/promise";

function env(key) {
  const p = "C:/projects12/rakiza-manassa-platform/.env.production.local";
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
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

// === نسخة مطابقة لـ accumulateWorkMinutes ===
const HIJRI_FORMAT = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Riyadh" });
const GREG_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });
function hijriParts(date) {
  const parts = HIJRI_FORMAT.formatToParts(date);
  const get = (t) => Number(parts.find(p => p.type === t)?.value ?? 0);
  return { day: get("day"), month: get("month"), year: get("year") };
}
function saudiGregorianParts(date) {
  const [year, month, day] = GREG_FORMAT.format(date).split("-").map(Number);
  return { year, month, day };
}
function isOfficialHoliday(date) {
  const { month: m, day: d } = saudiGregorianParts(date);
  if (m === 2 && d === 22) return true;
  if (m === 9 && d === 23) return true;
  const h = hijriParts(date);
  if (h.month === 10 && (h.day === 1 || h.day === 2)) return true;
  if (h.month === 12 && h.day >= 9 && h.day <= 12) return true;
  return false;
}
function isSaudiWorkday(now) {
  const { year, month, day } = saudiGregorianParts(now);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday >= 0 && weekday <= 4;
}
function accumulateWorkMinutes(from, to) {
  if (from.getTime() >= to.getTime()) return 0;
  let total = 0;
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (cursor.getTime() < to.getTime()) {
    if (isSaudiWorkday(cursor) && !isOfficialHoliday(cursor)) {
      const dayStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), 4, 0, 0));
      const dayEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), 11, 30, 0));
      const s = Math.max(dayStart.getTime(), from.getTime());
      const e = Math.min(dayEnd.getTime(), to.getTime());
      if (s < e) total += (e - s) / 60000;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return Math.floor(total);
}

const now = new Date();
const riyadh = (d) => d.toLocaleString("en-GB", { timeZone: "Asia/Riyadh", hour12: false });

const [rows] = await db.query(
  `SELECT t.id, t.title, t.assigneeProfileId, t.scheduledFor, t.status, t.isOpen, t.unitId, t.dueAt,
          p.fullName
   FROM tasks t
   LEFT JOIN person_profiles p ON p.id = t.assigneeProfileId
   WHERE t.status IN ('new','in_progress','overdue') AND t.archivedAt IS NULL
   ORDER BY t.scheduledFor ASC`
);

const stages = [];
let notified = 0, overdue = 0, disciplinary = 0, exempt = 0, active = 0;
for (const t of rows) {
  let stage, acc;
  if (t.isOpen) { stage = "مستثنى (isOpen)"; acc = 0; exempt++; }
  else {
    acc = accumulateWorkMinutes(new Date(t.scheduledFor), now);
    if (t.status === "overdue") { stage = "متأخرة (status)"; overdue++; }
    else if (acc >= 900) { stage = "مساءلة (>=900)"; disciplinary++; }
    else if (acc >= 450) { stage = "تنبيه (450-899)"; notified++; }
    else { stage = "نشطة (<450)"; active++; }
  }
  stages.push({ t, acc, stage });
}

console.log("NOW (UTC):", now.toISOString(), "| Riyadh:", riyadh(now));
console.log("إجمالي المهام النشطة:", rows.length);
console.log("");
console.log("=== التجميع ===");
console.log("مستثناة isOpen:", exempt);
console.log("نشطة (<450):", active);
console.log("ستنتقل لتنبيه (450-899):", notified);
console.log("متأخرة status=overdue:", overdue);
console.log("ستُساءل فوراً (>=900):", disciplinary);
console.log("");
console.log("=== جدول المهام (مصنّفة بالمرحلة المتوقعة) ===");
console.log(["id","الموظف","المعنون","scheduledFor(Riyadh)","status","isOpen","دقائق_العمل","المرحلة"].join("\t"));
for (const s of stages) {
  console.log([s.t.id, (s.t.fullName||"-").slice(0,20), (s.t.title||"-").slice(0,40), riyadh(new Date(s.t.scheduledFor)), s.t.status, s.t.isOpen?1:0, s.acc, s.stage].join("\t"));
}

// === المهام القديمة: scheduledFor قبل أمس، أو dueAt قديم ===
const dayAgo = new Date(now.getTime() - 48 * 3600 * 1000);
const oldSched = rows.filter(t => new Date(t.scheduledFor) < dayAgo && !t.isOpen);
const oldDue = rows.filter(t => t.dueAt && new Date(t.dueAt) < now && (t.status === "new" || t.status === "in_progress"));
console.log("");
console.log("=== مهام قديمة (scheduledFor قبل 48 ساعة، غير isOpen):", oldSched.length, "===");
const byEmp = {};
for (const t of oldSched) { const n = t.fullName || ("p" + t.assigneeProfileId); byEmp[n] = (byEmp[n]||0)+1; }
for (const [k,v] of Object.entries(byEmp)) console.log(" -", k, ":", v, "مهام");
console.log("=== مهام overdue ذات scheduledFor مستقبلي (شذوذ بيانات):", rows.filter(t => t.status==="overdue" && new Date(t.scheduledFor) > now).length, "===");
for (const t of rows.filter(t => t.status==="overdue" && new Date(t.scheduledFor) > now).slice(0,40)) {
  console.log(" - id=" + t.id + " | scheduledFor=" + riyadh(new Date(t.scheduledFor)) + " | " + (t.title||"-").slice(0,45));
}
console.log("=== مهام overdue ذات scheduledFor ماضٍ (مستحقة):", rows.filter(t => t.status==="overdue" && new Date(t.scheduledFor) <= now).length, "===");

// === cron config ===
const [jobs] = await db.query("SELECT jobType, isActive, cronExpression, scheduleCronTaskUid FROM scheduled_job_configs ORDER BY jobType");
console.log("");
console.log("=== scheduled_job_configs ===");
for (const j of jobs) console.log(" -", j.jobType, "| isActive:", j.isActive, "| cron:", j.cronExpression, "| uid:", (j.scheduleCronTaskUid||"(none)").slice(0,12));

await db.end();

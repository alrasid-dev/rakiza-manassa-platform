// scripts/reschedule-imported-tasks.mjs — المهمة 8: إعادة جدولة المهام المستوردة + إنشاء قوالب
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function env(key) {
  for (const line of fs.readFileSync(path.resolve(".env.production.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("=");
    if (e === -1) continue;
    if (t.slice(0, e).trim() !== key) continue;
    let v = t.slice(e + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

function normalizeArabic(s) {
  return String(s).replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآا]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/\s+/g, " ").trim();
}

const CLASSIFICATION = [
  ["daily", 1, ["تدوين الاحاطه", "تسجيل مباشرة", "التحقق من صلاحية", "حضور وانصراف", "بريد افادة", "قاعدة بيانات", "طلبات اجازات"]],
  ["weekly", 1, ["تقرير اسبوعي", "مستهدفات", "القضاة المدربين", "العمل عن بعد", "حصر اسماء", "استئذانات", "طلب الاعتمادات"]],
  ["monthly", 1, ["مباشره وتكليف", "تقييم شهري", "اجتماعات مع الرئيس", "بطاقات عمل", "خطة تدريب", "محطات العمل"]],
  ["quarterly", 1, ["مسودة التكريم", "العرض بالعهد", "قرارات الايفاد", "مقترح لتشكيل", "تنسيق مواقف"]],
  ["yearly", 1, ["تقييم الملازم"]],
  ["custom", 3, ["المعينين حديثا"]],
];

function classify(title) {
  const n = normalizeArabic(title);
  for (const [freq, interval, keywords] of CLASSIFICATION) {
    if (keywords.some(kw => n.includes(normalizeArabic(kw)))) return { frequency: freq, intervalDays: interval };
  }
  return null;
}

function riyadhParts(now) {
  const v = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const f = (n) => Number(v.find(x => x.type === n)?.value || "0");
  return { year: f("year"), month: f("month"), day: f("day") };
}
const at7 = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 4, 0, 0));
const at14 = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 11, 0, 0));
function toSql(dt) { return dt.toISOString().slice(0, 19).replace("T", " "); }
function nextSunday(y, m, d) {
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const days = (7 - dow) % 7 || 7;
  const nd = new Date(Date.UTC(y, m - 1, d + days));
  return { y: nd.getUTCFullYear(), m: nd.getUTCMonth() + 1, d: nd.getUTCDate() };
}
function firstOfNextMonth(y, m) {
  const nd = new Date(Date.UTC(y, m, 1));
  return { y: nd.getUTCFullYear(), m: nd.getUTCMonth() + 1, d: 1 };
}
function firstOfNextQuarter(y, m) {
  const qStart = Math.floor((m - 1) / 3) * 3;
  const nd = new Date(Date.UTC(y, qStart + 3, 1));
  return { y: nd.getUTCFullYear(), m: nd.getUTCMonth() + 1, d: 1 };
}
function schedule(frequency, today) {
  const { year, month, day } = today;
  const tmr = new Date(Date.UTC(year, month - 1, day + 1));
  const ty = tmr.getUTCFullYear(), tm = tmr.getUTCMonth() + 1, td = tmr.getUTCDate();
  if (frequency === "daily" || frequency === "custom") return { s: at7(ty, tm, td), d: at14(ty, tm, td) };
  if (frequency === "weekly") { const x = nextSunday(year, month, day); return { s: at7(x.y, x.m, x.d), d: at14(x.y, x.m, x.d) }; }
  if (frequency === "monthly") { const x = firstOfNextMonth(year, month); return { s: at7(x.y, x.m, x.d), d: at14(x.y, x.m, x.d) }; }
  if (frequency === "quarterly") { const x = firstOfNextQuarter(year, month); return { s: at7(x.y, x.m, x.d), d: at14(x.y, x.m, x.d) }; }
  if (frequency === "yearly") return { s: at7(year + 1, 1, 1), d: at14(year + 1, 1, 1) };
  return { s: at7(year, month, day), d: at14(year, month, day) };
}

const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true, bigNumberStrings: true,
});

const [tasks] = await db.query("SELECT id, unitId, title, assigneeProfileId, dueAt FROM tasks WHERE unitId IN (2,5) AND archivedAt IS NULL AND dueAt < NOW()");
console.log(`المهام المستهدفة (unitId 2,5 متأخرة غير مؤرشفة): ${tasks.length}`);

const summary = { daily: 0, weekly: 0, monthly: 0, quarterly: 0, yearly: 0, custom: 0, open: 0 };
const today = riyadhParts(new Date());
let templatesCreated = 0;

for (const task of tasks) {
  const cls = classify(task.title);
  if (!cls) {
    summary.open += 1;
    await db.query("UPDATE tasks SET recurrence='none', recurrenceInterval=NULL, scheduledFor=?, dueAt='2037-12-31 23:59:59', status='new' WHERE id=?", [toSql(at7(today.year, today.month, today.day)), task.id]);
    continue;
  }
  summary[cls.frequency] += 1;
  const { s, d } = schedule(cls.frequency, today);
  const [existingTpl] = await db.query("SELECT id FROM task_templates WHERE unitId=? AND title=? LIMIT 1", [task.unitId, task.title]);
  let templateId;
  if (existingTpl.length) {
    templateId = existingTpl[0].id;
    await db.query("UPDATE task_templates SET frequency=?, intervalDays=?, isActive=1, dueHourLocal=14, lastGeneratedAt=NOW() WHERE id=?", [cls.frequency, cls.intervalDays, templateId]);
  } else {
    const [ins] = await db.query("INSERT INTO task_templates (unitId,title,frequency,intervalDays,workdayOnly,dueHourLocal,defaultAssigneeProfileId,isActive,createdByUserId,lastGeneratedAt) VALUES (?,?,?,?,1,14,?,1,1,NOW())", [task.unitId, task.title, cls.frequency, cls.intervalDays, task.assigneeProfileId ?? null]);
    templateId = ins.insertId;
    templatesCreated += 1;
  }
  await db.query("UPDATE tasks SET recurrence=?, recurrenceInterval=?, scheduledFor=?, dueAt=?, templateId=?, status='new' WHERE id=?", [cls.frequency, cls.intervalDays, toSql(s), toSql(d), templateId, task.id]);
}

console.log("\n=== ملخص التصنيف ===");
console.log(JSON.stringify(summary));
console.log(`قوالب جديدة أُنشئت: ${templatesCreated}`);
await db.end();

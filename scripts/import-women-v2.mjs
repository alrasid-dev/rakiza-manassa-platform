// scripts/import-women-v2.mjs — استيراد الملف الجديد "القسم النسائي 2.xlsx" مع التكرار الفعلي
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

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

function normalizeArabic(s) {
  return String(s).replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآا]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/\s+/g, " ").trim();
}

const freqMap = { "يومي": "daily", "اسبوعي": "weekly", "أسبوعي": "weekly", "شهري": "monthly", "ربع سنوي": "quarterly", "اسبوعي وشهري": "weekly", "نصف شهري": "weekly" };
const hourMap = { "الساعة 7صباحا": 7, "الساعة 7:45ص": 8, "الساعة 8صباحا": 8, "الساعة 2ظهرا": 14, "الساعة 1 ظهراً": 13, "الساعة 9صباحا": 9, "الساعة 10 صباحاً": 10 };
const NAME_CORRECTIONS = { "سار العصيمي": "سارة العصيمي", "ساره العصيمي": "سارة العصيمي" };

function correctName(name) {
  const n = String(name ?? "").trim();
  return NAME_CORRECTIONS[n] ?? n;
}

function specificDayFromTitle(title) {
  const t = normalizeArabic(title);
  if (t.includes("اثنين")) return [1];
  if (t.includes("ثلاثاء")) return [2];
  if (t.includes("اربعاء")) return [3];
  if (t.includes("خميس")) return [4];
  if (t.includes("جمعه") || t.includes("جمعة")) return [5];
  if (t.includes("سبت")) return [6];
  if (t.includes("احد")) return [0];
  return null;
}

function toSql(dt) { return dt.toISOString().slice(0, 19).replace("T", " "); }

function riyadhParts(now) {
  const v = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const f = (n) => Number(v.find(x => x.type === n)?.value || "0");
  return { year: f("year"), month: f("month"), day: f("day") };
}

const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true, bigNumberStrings: true,
});

const wb = XLSX.readFile(path.resolve("excel_imports", "القسم النسائي 2 xlxs..xlsx"));
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

const fileTasks = [];
for (let i = 2; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  const title = String(r[1] ?? "").trim();
  if (!title) continue;
  fileTasks.push({ seq: String(r[0] ?? "").trim(), freq: String(r[2] ?? "").trim(), start: String(r[3] ?? "").trim(), end: String(r[4] ?? "").trim(), emps: [r[5], r[6], r[7]].map(x => String(x ?? "").trim()).filter(Boolean), title });
}

const [dbPeople] = await db.query("SELECT id, fullName FROM person_profiles WHERE unitId = 5 AND status = 'active' ORDER BY id");

function matchEmployee(fileNameRaw) {
  const fileName = correctName(fileNameRaw);
  if (!fileName || fileName === "مساعد الجابر") return null;
  const nf = normalizeArabic(fileName);
  const words = nf.split(" ").filter(Boolean);
  if (!words.length) return null;
  const first = words[0], last = words[words.length - 1];
  for (const p of dbPeople) {
    const np = normalizeArabic(p.fullName);
    const npw = np.split(" ").filter(Boolean);
    if (npw[0] === first && npw[npw.length - 1] === last) return p;
  }
  for (const p of dbPeople) {
    const np = normalizeArabic(p.fullName);
    const npw = np.split(" ").filter(Boolean);
    if (npw[npw.length - 1] === last && (npw[0].startsWith(first) || first.startsWith(npw[0]))) return p;
  }
  return null;
}
console.log("=== جدول مطابقة الأسماء ===");
const empMap = new Map();
for (const t of fileTasks) {
  for (const name of t.emps) {
    if (empMap.has(name)) continue;
    const p = matchEmployee(name);
    empMap.set(name, p ? p.id : null);
    console.log(`| ${name} | ${p ? p.fullName : "—"} | ${p ? p.id : "—"} | ${p ? "✅" : "❌"} |`);
  }
}

const [pending] = await db.query("SELECT COUNT(*) AS c FROM tasks WHERE unitId = 5 AND archivedAt IS NULL");
console.log(`\n=== الأرشفة ===`);
console.log(`المهام النشطة التي ستُرشف: ${pending[0].c}`);
const [ar] = await db.query("UPDATE tasks SET archivedAt = NOW(), archivedByUserId = 0, cancellationReason = 'استبدال - ملف جديد القسم النسائي 2.xlsx' WHERE unitId = 5 AND archivedAt IS NULL");
console.log(`أُرشفت: ${ar.affectedRows} مهمة`);

const [dt] = await db.query("UPDATE task_templates SET isActive = 0 WHERE unitId = 5");
console.log(`أُوقفت: ${dt.affectedRows} قالبًا`);

const today = riyadhParts(new Date());
const tmr = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
const ty = tmr.getUTCFullYear(), tm = tmr.getUTCMonth() + 1, td = tmr.getUTCDate();

const summary = { daily: 0, weekly: 0, monthly: 0, quarterly: 0, specific_days: 0 };
let created = 0;
const insertedTitles = new Set(); // منع تكرار القوالب بنفس العنوان
console.log("\n=== إنشاء القوالب والمهام ===");
for (const t of fileTasks) {
  let frequency = freqMap[t.freq] || "daily";
  let specificDays = null;
  if (frequency === "weekly") {
    const days = specificDayFromTitle(t.title);
    if (days) { frequency = "specific_days"; specificDays = days; }
  }
  const dueHour = hourMap[t.end] ?? 14;
  const primary = empMap.get(t.emps[0]) ?? null;
  const suggested = t.emps.join("، ");
  const notes = `المكلفون المقترحون: ${suggested || "غير محدد"}`;
  const specificDaysJson = specificDays ? JSON.stringify(specificDays) : null;

  // منع تكرار القوالب: تخطَّ إذا وُجد قالب نشط بنفس العنوان في نفس الوحدة أو أُدرج سابقاً في هذه الدفعة
  const normalizedTitle = normalizeArabic(t.title);
  const [existingTpl] = await db.query(
    "SELECT id FROM task_templates WHERE unitId = 5 AND isActive = 1 AND title = ? LIMIT 1",
    [t.title]
  );
  if (existingTpl.length > 0 || insertedTitles.has(normalizedTitle)) {
    console.log(`#${t.seq} [تخطي: قالب مكرر] "${t.title.slice(0, 50)}"`);
    continue;
  }
  insertedTitles.add(normalizedTitle);

  const [ins] = await db.query(
    "INSERT INTO task_templates (unitId, title, frequency, workdayOnly, dueHourLocal, defaultAssigneeProfileId, isActive, createdByUserId, specificDays) VALUES (5, ?, ?, 1, ?, ?, 1, 1, ?)",
    [t.title, frequency, dueHour, primary, specificDaysJson]
  );
  const templateId = ins.insertId;

  const scheduledFor = new Date(Date.UTC(ty, tm - 1, td, 4, 0, 0));
  const dueAt = new Date(Date.UTC(ty, tm - 1, td, dueHour - 3, 0, 0));
  await db.query(
    "INSERT INTO tasks (title, unitId, taskNotes, status, priority, taskType, scheduledFor, dueAt, assigneeProfileId, templateId, assignedByUserId, recurrence, isOpen, specificDays) VALUES (?, 5, ?, 'new', 'normal', 'permanent', ?, ?, ?, ?, 1, ?, 0, ?)",
    [t.title, notes, toSql(scheduledFor), toSql(dueAt), primary, templateId, frequency, specificDaysJson]
  );

  summary[frequency] = (summary[frequency] || 0) + 1;
  created += 1;
  console.log(`#${t.seq} [${frequency}${specificDays ? " " + JSON.stringify(specificDays) : ""}] tpl=${templateId} assignee=${primary} → ${t.title.slice(0, 50)}`);
}

console.log(`\nأُنشئ: ${created} قالبًا + ${created} مهمة.`);
console.log("\n=== توزيع القوالب الجديدة حسب التكرار ===");
console.table(summary);
await db.end();


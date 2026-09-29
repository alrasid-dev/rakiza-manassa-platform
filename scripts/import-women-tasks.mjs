// scripts/import-women-tasks.mjs — المرحلة 5: استيراد مهام القسم النسائي من الملف المصحح
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

function parseFrequency(freq) {
  const f = String(freq || "").trim();
  if (f.includes("ربع")) return "quarterly";
  if (f.includes("شهر") && f.includes("اسبوع")) return "weekly";
  if (f.includes("اسبوع")) return "weekly";
  if (f.includes("شهر")) return "monthly";
  if (f.includes("يومي")) return "daily";
  return "daily";
}

function parseDueHour(end) {
  const e = String(end || "");
  if (/2/.test(e)) return 14;
  if (/1/.test(e)) return 13;
  if (/9/.test(e)) return 9;
  return 14;
}

function riyadhParts(now) {
  const v = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const f = (n) => Number(v.find(x => x.type === n)?.value || "0");
  return { year: f("year"), month: f("month"), day: f("day") };
}
function toSql(dt) { return dt.toISOString().slice(0, 19).replace("T", " "); }

const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 4000), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza", ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true });

// 1) قراءة الملف
const wb = XLSX.readFile(path.resolve("excel_imports", "القسم النسائي xlxs..xlsx"));
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
const fileTasks = [];
for (let i = 2; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  const title = String(r[10] ?? "").trim();
  if (!title) continue;
  fileTasks.push({
    seq: r[0],
    freq: String(r[2] ?? "").trim(),
    start: String(r[3] ?? "").trim(),
    end: String(r[4] ?? "").trim(),
    emp1: String(r[5] ?? "").trim(),
    emp2: String(r[6] ?? "").trim(),
    emp3: String(r[7] ?? "").trim(),
    title,
  });
}

// 2) موظفات القسم النسائي
const [dbPeople] = await db.query("SELECT id, fullName FROM person_profiles WHERE unitId = 5 AND status = 'active' ORDER BY id");

function matchEmployee(fileName) {
  const NAME_ALIASES = {
    "سمية السلمان": 60131, // سميه السليمان — اختلاف إملائي في الملف
  };
  if (NAME_ALIASES[fileName]) {
    const pid = NAME_ALIASES[fileName];
    return dbPeople.find(p => p.id === pid) || null;
  }
  const nf = normalizeArabic(fileName);
  const words = nf.split(" ").filter(Boolean);
  if (!words.length) return null;
  const first = words[0];
  const last = words[words.length - 1];
  for (const p of dbPeople) {
    const np = normalizeArabic(p.fullName);
    const npw = np.split(" ").filter(Boolean);
    const npFirst = npw[0];
    const npLast = npw[npw.length - 1];
    if (npFirst === first && npLast === last) return p;
  }
  for (const p of dbPeople) {
    const np = normalizeArabic(p.fullName);
    const npw = np.split(" ").filter(Boolean);
    const npFirst = npw[0];
    const npLast = npw[npw.length - 1];
    if (npLast === last && (npFirst.startsWith(first) || first.startsWith(npFirst))) return p;
  }
  return null;
}

console.log("=== جدول المطابقة ===");
const empMap = new Map();
for (const t of fileTasks) {
  for (const name of [t.emp1, t.emp2, t.emp3]) {
    if (!name || empMap.has(name)) continue;
    const p = matchEmployee(name);
    empMap.set(name, p ? p.id : null);
    console.log(`| ${name} | ${p ? p.fullName : "—"} | ${p ? p.id : "—"} | ${p ? "✅" : "❌"} |`);
  }
}

// 3) إنشاء القوالب والمهام
const today = riyadhParts(new Date());
const tmr = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
const ty = tmr.getUTCFullYear(), tm = tmr.getUTCMonth() + 1, td = tmr.getUTCDate();
let created = 0;
console.log("\n=== إنشاء القوالب والمهام ===");
for (const t of fileTasks) {
  const frequency = parseFrequency(t.freq);
  const dueHour = parseDueHour(t.end);
  const primary = empMap.get(t.emp1) ?? null;
  const suggested = [t.emp1, t.emp2, t.emp3].filter(Boolean).join("، ");
  const notes = `المكلفون المقترحون: ${suggested || "غير محدد"}` + (t.start ? ` · وقت البدء الأصلي: ${t.start}` : "");

  const [ins] = await db.query(
    "INSERT INTO task_templates (unitId, title, frequency, workdayOnly, dueHourLocal, defaultAssigneeProfileId, isActive, createdByUserId) VALUES (?, ?, ?, 1, ?, ?, 1, 1)",
    [5, t.title, frequency, dueHour, primary]
  );
  const templateId = ins.insertId;

  const scheduledFor = new Date(Date.UTC(ty, tm - 1, td, 4, 0, 0)); // 07:00 الرياض
  const dueAt = new Date(Date.UTC(ty, tm - 1, td, dueHour - 3, 0, 0));
  await db.query(
    "INSERT INTO tasks (title, unitId, taskNotes, status, priority, taskType, scheduledFor, dueAt, assigneeProfileId, templateId, assignedByUserId, recurrence, isOpen) VALUES (?, 5, ?, 'new', 'normal', 'permanent', ?, ?, ?, ?, 1, ?, 0)",
    [t.title, notes, toSql(scheduledFor), toSql(dueAt), primary, templateId, frequency]
  );
  created += 1;
  console.log(`#${t.seq} [${frequency}] tpl=${templateId} assignee=${primary} → ${t.title.slice(0, 50)}`);
}

console.log(`\nأُنشئ: ${created} قالبًا + ${created} مهمة.`);
await db.end();

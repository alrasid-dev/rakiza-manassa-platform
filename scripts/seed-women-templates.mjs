// scripts/seed-women-templates.mjs — إدخال 37 قالب للقسم النسائي (unitId=5) من Excel v4
// dry-run (افتراضي): عرض الجدول مع IDs فقط. --execute: الإدراج الفعلي.
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const EXECUTE = process.argv.includes("--execute");

// ID لكل موظفة (مُتحقق منه من person_profiles)
const PID = {
  اماني: 30003, ابتسام: 60140, دلال: 60129, أثير: 60080, تماضر: 60132,
  "سارة المطوع": 60130, سمية: 60131, نوره: 60121, هنادي: 60125,
  "سارة العصيمي": 60126, الجوهره: 60146, سلمى: 60090, شهاليل: 60138, هيفاء: 60139,
};

// [العنوان, المفتاح, frequency, specificDays, startDate, endDate, dueHourLocal]
const ROWS = [
  ["اشراف على القسم النسائي حضور وانصراف ومتابعه الاعمال", "اماني", "daily", null, null, null, 14],
  ["متابعه  بريد القسم القسم النسائي", "اماني", "daily", null, null, null, 14],
  ["اشراف وتدريب طالبات التدريب التعاوني", "اماني", "daily", null, null, null, 14],
  ["استقبال مستفيدات", "اماني", "daily", null, null, "2026-10-12", 14],
  ["دراسة جودة الاحكام - دراسة الشكاوى", "ابتسام", "daily", null, null, null, 14],
  ["استقبال مستفيدات", "ابتسام", "daily", null, "2026-10-13", null, 14],
  ["متابعة  بريد  خدمات المستفيدات", "دلال", "daily", null, null, null, 14],
  ["تقسيم القضايا على الباحثات (دراسة جودة الأحكام )", "دلال", "specific_days", [0], null, null, 14],
  ["فرز الاحكام بتوجية من فضيلة الرئيس", "دلال", "daily", null, null, "2026-10-12", 14],
  ["استقبال مستفيدات", "دلال", "daily", null, "2026-10-13", null, 14],
  ["دراسة جودة الاحكام", "أثير", "daily", null, "2027-02-14", null, 14],
  ["استقبال مستفيدات", "أثير", "daily", null, "2027-02-14", null, 14],
  ["اعداد التقرير اليومي و التقرير الاسبوعي لانجاز التشكيلات القضائية", "تماضر", "specific_days", [1], null, null, 10],
  ["اعداد التقرير اليومي لانجاز التشكيلات القضائية", "تماضر", "specific_days", [2], null, null, 10],
  ["فرز الاحكام بتوجية من فضيلة الرئيس", "تماضر", "daily", null, null, null, 14],
  ["اعداد التقرير اليومي لانجاز التشكيلات القضائية", "سارة المطوع", "specific_days", [0], null, null, 10],
  ["فرز الاحكام بتوجية من فضيلة الرئيس", "سارة المطوع", "daily", null, "2026-10-13", "2027-01-04", 14],
  ["تقسيم الاعمال على الموظفات عن بعد", "سارة المطوع", "daily", null, null, null, 9],
  ["استقبال المستفيدات", "سارة المطوع", "daily", null, null, "2026-10-12", 14],
  ["اعداد التقرير اليومي  لانجاز التشكيلات القضائية", "سمية", "specific_days", [3], null, null, 10],
  ["اعداد التقرير اليومي لانجاز التشكيلات القضائية", "سمية", "specific_days", [4], null, null, 10],
  ["فرز الاحكام بتوجية من فضيلة الرئيس", "سمية", "daily", null, null, null, 14],
  ["استقبال المستفيدات", "نوره", "daily", null, null, "2026-10-12", 14],
  ["فرز الاحكام بتوجية من فضيلة الرئيس", "نوره", "daily", null, "2026-10-13", "2027-01-04", 14],
  ["متابعه حضور المتدربات", "نوره", "daily", null, null, "2026-10-13", 14],
  ["جمع اعمال الموظفات عن بعد (فرز الأحكام)", "نوره", "specific_days", [0], null, null, 14],
  ["استقبال المستفيدات", "هنادي", "daily", null, null, "2027-01-04", 14],
  ["فرز الاحكام بتوجية من فضيلة الرئيس", "هنادي", "daily", null, "2027-01-05", "2028-04-07", 14],
  ["اعداد تقارير اسبوعيه للتشكيلات القضائية  بشأن القضايا المتعثرة", "هنادي", "specific_days", [0], null, null, 14],
  ["حصر اعمال القسم", "هنادي", "specific_days", [0], "2026-10-12", null, 14],
  ["فرز الاحكام بتوجية من فضيلة الرئيس", "سارة العصيمي", "daily", null, "2027-01-05", "2028-04-07", 14],
  ["متابعه حضور المتدربات", "سارة العصيمي", "daily", null, "2026-10-13", "2027-01-04", 14],
  ["استقبال المستفيدات", "سارة العصيمي", "daily", null, null, "2027-01-04", 14],
  ["العمل مع مركز التهيئة معدل 8 قضايا", "الجوهره", "daily", null, null, null, 14],
  ["العمل مع مركز التهيئة معدل 8 قضايا", "سلمى", "daily", null, "2026-10-25", null, 14],
  ["العمل مع مركز التهيئة معدل 8 قضايا", "شهاليل", "daily", null, "2026-10-11", null, 14],
  ["العمل مع مركز التهيئة معدل 8 قضايا", "هيفاء", "daily", null, null, null, 14],
];


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
const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true,
});

const [people] = await db.query("SELECT id, fullName FROM person_profiles WHERE unitId = 5");
const idToName = Object.fromEntries(people.map(p => [p.id, p.fullName]));

console.log(`عدد الصفوف: ${ROWS.length}`);
console.log("\n=== الجدول النهائي (مع IDs) ===");
console.log("idx | المهمة | المُسند (ID) | frequency | specificDays | startDate | endDate | dueHour");
let idx = 0;
for (const [title, key, frequency, specificDays, startDate, endDate, dueHour] of ROWS) {
  const pid = PID[key];
  const name = idToName[pid] || `⚠️${key}(${pid})`;
  console.log(`${idx + 1} | ${title.slice(0, 42)} | ${name} (${pid}) | ${frequency} | ${specificDays ? JSON.stringify(specificDays) : "—"} | ${startDate || "NULL"} | ${endDate || "NULL"} | ${dueHour}`);
  idx++;
}

if (!EXECUTE) {
  console.log("\n(وضع dry-run — لم يُدرج أي شيء. شغّل مع --execute للإدراج)");
  await db.end();
  process.exit(0);
}

let inserted = 0;
for (const [title, key, frequency, specificDays, startDate, endDate, dueHour] of ROWS) {
  const pid = PID[key];
  const [res] = await db.query(
    "INSERT INTO task_templates (unitId, title, frequency, workdayOnly, dueHourLocal, defaultAssigneeProfileId, isActive, createdByUserId, specificDays, startDate, endDate) VALUES (5, ?, ?, 1, ?, ?, 1, 1, ?, ?, ?)",
    [title, frequency, dueHour, pid, specificDays ? JSON.stringify(specificDays) : null, startDate, endDate]
  );
  inserted += res.affectedRows;
}
console.log(`\nتم الإدراج: ${inserted} قالب (unitId=5).`);
await db.end();

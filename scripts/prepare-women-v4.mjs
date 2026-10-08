// scripts/prepare-women-v4.mjs — تحويل Excel v4 إلى جدول قوالب (قراءة فقط) → reports/women-v4-preview.md
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
function norm(s) { return String(s).replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآا]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/\s+/g, " ").trim(); }
const freqMap = { "يومي": "daily", "اسبوعي": "weekly", "أسبوعي": "weekly", "شهري": "monthly", "ربع سنوي": "quarterly", "اسبوعي وشهري": "weekly", "نصف شهري": "weekly" };
const NAME_CORRECTIONS = { "سار العصيمي": "سارة العصيمي", "ساره العصيمي": "سارة العصيمي" };
const correctName = (n) => NAME_CORRECTIONS[String(n ?? "").trim()] ?? String(n ?? "").trim();
const DAY_MAP = { "احد": 0, "أحد": 0, "اثنين": 1, "ثلاثاء": 2, "اربعاء": 3, "أربعاء": 3, "خميس": 4, "جمعه": 5, "جمعة": 5, "سبت": 6 };
const MONTH_MAP = { "يناير": 1, "فبراير": 2, "فبرار": 2, "مارس": 3, "ابريل": 4, "أبريل": 4, "مايو": 5, "يونيو": 6, "يوليو": 7, "اغسطس": 8, "أغسطس": 8, "سبتمبر": 9, "اكتوبر": 10, "أكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12 };

function parseDateParts(text) {
  const n = norm(text);
  const m = n.match(/(\d{1,2})\s*(يناير|فبراير|فبرار|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر)/);
  if (!m) return null;
  const y = n.match(/(20\d{2})/);
  return { day: Number(m[1]), month: MONTH_MAP[m[2]], year: y ? Number(y[1]) : null };
}

const wb = XLSX.readFile(path.resolve("excel_imports", "اعمال القسم النسائي 4 xlxs.xlsx"));
const sheetName = wb.SheetNames.includes("المهام") ? "المهام" : wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
const fileTasks = [];
for (let i = 2; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  const title = String(r[1] ?? "").trim();
  if (!title) continue;
  fileTasks.push({
    seq: String(r[0] ?? "").trim(), title, freq: String(r[2] ?? "").trim(),
    emps: [r[5], r[6], r[7]].map(x => String(x ?? "").trim()).filter(Boolean),
    startDateRaw: String(r[8] ?? "").trim(), endDateRaw: String(r[9] ?? "").trim(),
  });
}

const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true,
});
const [dbPeople] = await db.query("SELECT id, fullName FROM person_profiles WHERE unitId = 5 AND status = 'active' ORDER BY id");
function matchEmployee(fileNameRaw) {
  const fileName = correctName(fileNameRaw);
  if (!fileName || fileName === "مساعد الجابر") return null;
  const words = norm(fileName).split(" ").filter(Boolean);
  if (!words.length) return null;
  const first = words[0], last = words[words.length - 1];
  for (const p of dbPeople) {
    const npw = norm(p.fullName).split(" ").filter(Boolean);
    if (npw[0] === first && npw[npw.length - 1] === last) return p;
  }
  for (const p of dbPeople) {
    const npw = norm(p.fullName).split(" ").filter(Boolean);
    if (npw[npw.length - 1] === last && (npw[0].startsWith(first) || first.startsWith(npw[0]))) return p;
  }
  return null;
}


const CORRECTIONS = { "29": { startDate: "2027-01-05", endDate: "2028-04-07" }, "23": { startDate: "2026-10-13", endDate: "2027-01-04" } };
const toDateKey = (p) => p ? `${p.year ?? 2026}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}` : null;

function transform(t) {
  let frequency = freqMap[t.freq] || "daily";
  let specificDays = null;
  if (/كل يوم/.test(t.startDateRaw)) {
    const entry = Object.entries(DAY_MAP).find(([k]) => norm(t.startDateRaw).includes(k));
    if (entry) { frequency = "specific_days"; specificDays = [entry[1]]; }
  }
  let startDate = null, flag = null;
  const skipStart = /دائم/.test(t.startDateRaw) || /حاليا/.test(t.startDateRaw) || /كل يوم/.test(t.startDateRaw) || /تاريخ \d+ من كل شهر/.test(t.startDateRaw);
  if (!skipStart) {
    const p = parseDateParts(t.startDateRaw);
    if (p) { if (p.year == null) flag = "سنة ناقصة(بدء)"; startDate = toDateKey(p); }
    else if (t.startDateRaw) flag = "بدء غير مقروء: " + t.startDateRaw;
  }
  let endDate = null;
  if (t.endDateRaw) {
    const p = parseDateParts(t.endDateRaw);
    if (p) { if (p.year == null) flag = (flag ? flag + "; " : "") + "سنة ناقصة(نهاية)"; endDate = toDateKey(p); }
    else flag = (flag ? flag + "; " : "") + "نهاية غير مقروءة: " + t.endDateRaw;
  }
  if (CORRECTIONS[t.seq]) { startDate = CORRECTIONS[t.seq].startDate; endDate = CORRECTIONS[t.seq].endDate; flag = (flag ? flag + "; " : "") + "مصحح يدوياً"; }
  return { frequency, specificDays, startDate, endDate, flag };
}
const assigneeOf = (t) => t.emps.map(n => { const p = matchEmployee(n); return p ? p.fullName : (n ? `⚠️${n}` : null); }).filter(Boolean).join("، ") || "—";

const lines = [`# معاينة قوالب القسم النسائي (Excel v4)`, ``, `- عدد الصفوف المستخرجة: **${fileTasks.length}** (العمود A يصل إلى 34 مع فجوة/خلايا مدموجة).`, ``];
lines.push("| # | المهمة | المُسند | frequency | specificDays | startDate | endDate | ملاحظة |");
lines.push("|---|--------|---------|-----------|--------------|-----------|---------|--------|");
for (const t of fileTasks) {
  const x = transform(t);
  lines.push(`| ${t.seq || "(مدمج)"} | ${t.title} | ${assigneeOf(t)} | ${x.frequency} | ${x.specificDays ? JSON.stringify(x.specificDays) : "—"} | ${x.startDate || "NULL"} | ${x.endDate || "NULL"} | ${x.flag || "—"} |`);
}
lines.push("");
const out = path.resolve("reports", "women-v4-preview.md");
fs.writeFileSync(out, lines.join("\n"), "utf8");
console.log("كتبت إلى " + out + " (عدد القوالب=" + fileTasks.length + ")");
await db.end();

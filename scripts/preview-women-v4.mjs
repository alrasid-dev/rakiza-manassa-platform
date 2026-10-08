// scripts/preview-women-v4.mjs — معاينة قراءة فقط لملف "اعمال القسم النسائي 4 xlxs.xlsx"
// لا يُجري أي كتابة على قاعدة البيانات.
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
const NAME_CORRECTIONS = { "سار العصيمي": "سارة العصيمي", "ساره العصيمي": "سارة العصيمي" };
function correctName(name) { const n = String(name ?? "").trim(); return NAME_CORRECTIONS[n] ?? n; }
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

const wb = XLSX.readFile(path.resolve("excel_imports", "اعمال القسم النسائي 4 xlxs.xlsx"));
const sheetName = wb.SheetNames.includes("المهام") ? "المهام" : wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

console.log("=== الملف الخام (أول 8 أسطر) ===");
for (let i = 0; i < Math.min(8, rows.length); i++) console.log(`row[${i}]: ` + JSON.stringify(rows[i]));
console.log(`\nsheet=${sheetName} إجمالي الصفوف الخام=${rows.length}`);

// الأعمدة: A=م(0) B=المهمة(1) C=وقت التنفيذ(2) D=تاريخ البدء-وقت(3) E=تاريخ الانتهاء-وقت(4) F=الموظف1(5) G(6) H(7) I=تاريخ بدء المهمة(8) J=تاريخ إيقاف المهمة(9)
const fileTasks = [];
for (let i = 2; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  const title = String(r[1] ?? "").trim();
  if (!title) continue;
  fileTasks.push({
    seq: String(r[0] ?? "").trim(),
    title,
    freq: String(r[2] ?? "").trim(),
    startTime: String(r[3] ?? "").trim(),
    endTime: String(r[4] ?? "").trim(),
    emps: [r[5], r[6], r[7]].map(x => String(x ?? "").trim()).filter(Boolean),
    startDateRaw: String(r[8] ?? "").trim(),
    endDateRaw: String(r[9] ?? "").trim(),
  });
}
console.log(`عدد القوالب المستخرجة: ${fileTasks.length}`);

const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true, bigNumberStrings: true,
});
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
const empMap = new Map();
for (const t of fileTasks) {
  for (const name of t.emps) {
    if (empMap.has(name)) continue;
    const p = matchEmployee(name);
    empMap.set(name, p ? p.fullName : null);
  }
}

console.log("\n=== جدول القوالب (v4) — بالرقم الأصلي والقيم الكاملة ===");
console.log("seq | المهمة | المُسند | freq | I(بدء) | J(إيقاف)");
console.log("----|--------|---------|------|--------|---------");
for (const t of fileTasks) {
  const assigneeAll = t.emps.map(n => empMap.get(n) || `⚠️${n}`).join("، ") || "—";
  console.log(`${t.seq} | ${t.title} | ${assigneeAll} | ${t.freq} | ${t.startDateRaw || "—"} | ${t.endDateRaw || "—"}`);
}
await db.end();

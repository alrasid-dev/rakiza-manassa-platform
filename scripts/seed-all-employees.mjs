#!/usr/bin/env node
/**
 * بذر كل موظفي المحكمة (من ملف الموظفين المرفق) وتفعيل حساباتهم وتسكينهم في أقسامهم الصحيحة.
 * يتغاضى عن الأخطاء الإملائية في أسماء الأقسام عبر دالة تطبيع مضمّنة.
 */
import XLSX from "xlsx";
import mysql from "mysql2/promise";

const DESKTOP = "C:/Users/asus/OneDrive/Desktop";
const EMPLOYEES_FILE = "نموذج عرض بيانات الموظفين للموارد البشرية-تفاعلي داخلي.xlsx";
const SHEET = "الكل";

function normalizeArabic(text) {
  return String(text ?? "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[\u0649ى]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}
const PREFIXES = ["إدارة", "ادارة", "قسم", "وحدة", "مكتب", "شعبة"];
function deptKey(name) {
  let s = normalizeArabic(name);
  for (const p of PREFIXES) {
    const np = normalizeArabic(p);
    if (s.startsWith(np + " ")) { s = s.slice(np.length).trim(); break; }
  }
  return s.replace(/^ال(?=\S)/u, "").trim();
}
const DEPT_ALIASES = { "دعوي": "الدعاوى", "دعاوي": "الدعاوى" };

function columnIndex(header, names) {
  for (let i = 0; i < header.length; i++) {
    const h = normalizeArabic(header[i]);
    if (names.some(n => h.includes(normalizeArabic(n)))) return i;
  }
  return -1;
}

const raw = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
if (!raw) { console.log(JSON.stringify({ skipped: true, reason: "DATABASE_URL missing" })); process.exit(0); }

const wb = XLSX.readFile(DESKTOP + "/" + EMPLOYEES_FILE);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], { header: 1, defval: "" });
const header = rows[0];
const ci = {
  name: columnIndex(header, ["الاسم"]),
  nationalId: columnIndex(header, ["السجل"]),
  email: columnIndex(header, ["البريد"]),
  jobTitle: columnIndex(header, ["المسمى"]),
  dept: columnIndex(header, ["القسم"]),
  phone: columnIndex(header, ["التواصل"]),
  status: columnIndex(header, ["حالة الموظف"]),
};

const url = new URL(raw);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port || 4000),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, "") || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
});

async function ensureUnit(name) {
  const n = name.trim();
  const [byName] = await db.query("SELECT id FROM organization_units WHERE name = ? LIMIT 1", [n]);
  if (byName[0]) return byName[0].id;
  const code = `dept-${Buffer.from(n).toString("base64url").slice(0, 40)}`;
  await db.query("INSERT INTO organization_units (name, code, isActive) VALUES (?, ?, true) ON DUPLICATE KEY UPDATE name = VALUES(name), isActive = true", [n, code]);
  const [created] = await db.query("SELECT id FROM organization_units WHERE code = ? LIMIT 1", [code]);
  return created[0]?.id ?? null;
}

function attendanceMode(statusText) {
  const t = normalizeArabic(statusText);
  return (t.includes("عن بعد") || t.includes("عن بُعد")) ? "remote" : "in_person";
}
function employmentStatus(statusText) {
  const t = normalizeArabic(statusText);
  if (t.includes("اجازه") || t.includes("بدون راتب")) return "on_leave";
  if (t.includes("انقطاع") || t.includes("منقول خارج")) return "inactive";
  return "active";
}

async function main() {
const report = { created: 0, updated: 0, skipped: 0, departments: {}, warnings: [] };
try {
  for (const row of rows.slice(1)) {
    const name = String(row[ci.name] ?? "").trim().replace(/\s+/g, " ");
    const email = String(row[ci.email] ?? "").trim().toLowerCase();
    const dept = String(row[ci.dept] ?? "").trim().replace(/\s+/g, " ");
    if (!name) continue;
    if (!email || !/^[^@\s]+@moj\.gov\.sa$/i.test(email)) {
      report.skipped += 1;
      report.warnings.push({ name, email, reason: "بريد رسمي غير صالح" });
      continue;
    }
    const jobTitle = String(row[ci.jobTitle] ?? "").trim() || null;
    const nationalId = String(row[ci.nationalId] ?? "").trim() || null;
    const phone = String(row[ci.phone] ?? "").trim() || null;
    const deptName = dept || "غير مسكن";
    const unitId = await ensureUnit(deptName);
    if (unitId && !report.departments[deptName]) report.departments[deptName] = unitId;

    let userId;
    const [existingUser] = await db.query("SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1", [email]);
    if (existingUser[0]) {
      userId = existingUser[0].id;
    } else {
      const openId = `seed:${email}`;
      const [inserted] = await db.query(
        "INSERT INTO users (openId, name, email, role, mustChangePassword, loginMethod) VALUES (?, ?, ?, 'user', true, 'seed_employee')",
        [openId, name, email],
      );
      userId = inserted.insertId;
      report.created += 1;
    }

    await db.query(
      `INSERT INTO access_grants (fullName, officialEmail, notificationEmail, permission, isActive, grantedByUserId)
       VALUES (?, ?, ?, 'employee', true, 1)
       ON DUPLICATE KEY UPDATE fullName = VALUES(fullName), isActive = true, updatedAt = NOW()`,
      [name, email, email],
    );
    await db.query("UPDATE access_grants SET userId = ? WHERE LOWER(officialEmail) = LOWER(?)", [userId, email]);

    const [existingProfile] = await db.query("SELECT id FROM person_profiles WHERE LOWER(email) = LOWER(?) LIMIT 1", [email]);
    if (existingProfile[0]) {
      await db.query(
        "UPDATE person_profiles SET userId = ?, unitId = ?, fullName = ?, jobTitle = ?, nationalId = ?, phone = ?, attendanceMode = ?, status = ?, personType = 'administrative', updatedAt = NOW() WHERE id = ?",
        [userId, unitId, name, jobTitle, nationalId, phone, attendanceMode(row[ci.status]), employmentStatus(row[ci.status]), existingProfile[0].id],
      );
      report.updated += 1;
    } else {
      await db.query(
        `INSERT INTO person_profiles (userId, unitId, personType, fullName, email, nationalId, phone, jobTitle, attendanceMode, status, sourceReference)
         VALUES (?, ?, 'administrative', ?, ?, ?, ?, ?, ?, ?, 'employees-workbook-2026')`,
        [userId, unitId, name, email, nationalId, phone, jobTitle, attendanceMode(row[ci.status]), employmentStatus(row[ci.status])],
      );
      report.created += 1;
    }
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.end();
}
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

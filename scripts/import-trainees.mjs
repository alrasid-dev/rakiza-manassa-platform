#!/usr/bin/env node
/**
 * scripts/import-trainees.mjs
 * استيراد الملازمين القضائيين من Excel وربطهم بالقضاة المدربين.
 *
 * لكل صف: person_profile (trainee, unitId=2) + trainee_assignment.
 * القاضي غير المطابق: supervisingJudgeProfileId = null + حفظ الاسم في trainingJudge.
 * إنشاء user + access_grant (permission="trainee") لكل بريد رسمي.
 *
 * الاستخدام:
 *   node --env-file=.env.production.local scripts/import-trainees.mjs --dry-run
 *   node --env-file=.env.production.local scripts/import-trainees.mjs
 */
import XLSX from "xlsx";
import mysql from "mysql2/promise";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const FILE_ARG = process.argv.find(a => a.toLowerCase().endsWith(".xlsx"));
const FILE = path.resolve(FILE_ARG || "excel_imports/الملازمين xlsx..xlsx");

const SYSTEM_USER_ID = 1;
const TRAINEE_UNIT_ID = 2;
const SOURCE_REFERENCE = "trainees-workbook-2026";

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

function judgeKey(name) {
  return normalizeArabic(name)
    .replace(/^مكلف\s*/i, "")
    .replace(/\s(?:ابن|بن)\s+/g, " ");
}

function columnIndex(header, names) {
  for (let i = 0; i < header.length; i++) {
    const h = normalizeArabic(header[i]);
    if (names.some(n => h.includes(normalizeArabic(n)))) return i;
  }
  return -1;
}

function durationDaysFromText(text) {
  const t = normalizeArabic(text);
  if (t.includes("سنه") || t.includes("سنتين")) return 365;
  if (t.includes("شهر")) return 90;
  return 60;
}

const raw = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
if (!raw) {
  console.error("DATABASE_URL غير موجود — شغّل مع --env-file=.env.production.local");
  process.exit(1);
}
const url = new URL(raw);
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 4000),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true,
  bigNumberStrings: true,
});

if (DRY_RUN) console.log("*** DRY-RUN: سيُتراجع تلقائياً ولن يُحفظ أي تغيير ***");

const wb = XLSX.readFile(FILE);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
const header = rows[0];
const ci = {
  formation: columnIndex(header, ["التشكيل"]),
  judge: columnIndex(header, ["القاضي المدرب", "القاضي"]),
  name: columnIndex(header, ["اسم الملازم", "الملازم"]),
  duration: columnIndex(header, ["مدة الملازمة", "المدة"]),
  track: columnIndex(header, ["مسار"]),
  phone: columnIndex(header, ["جوال", "تواصل"]),
  email: columnIndex(header, ["البريد"]),
  nationalId: columnIndex(header, ["هوية", "سجل"]),
  note: columnIndex(header, ["ملاحظات"]),
  startDate: columnIndex(header, ["مباشرة"]),
};

const dataRows = rows.slice(1).filter(r => String(r[ci.name] ?? "").trim());

// تحميل القضاة الحاليين للفهرسة بالاسم المطبَّع.
const [judges] = await db.query("SELECT id, fullName, judicialFormation FROM person_profiles WHERE personType = 'judge'");
const judgeIndex = new Map();
for (const j of judges) {
  const key = judgeKey(j.fullName);
  if (!judgeIndex.has(key)) judgeIndex.set(key, []);
  judgeIndex.get(key).push(j);
}

let createdProfiles = 0, createdAssignments = 0, createdUsers = 0, createdGrants = 0, skipped = 0;
let matchedLinks = 0;
const unmatchedJudges = new Set();
const multiMatches = [];

await db.beginTransaction();
try {
  for (const row of dataRows) {
    const name = String(row[ci.name] ?? "").trim().replace(/\s+/g, " ");
    const email = String(row[ci.email] ?? "").trim().toLowerCase();
    const formation = String(row[ci.formation] ?? "").trim();
    const judgeName = String(row[ci.judge] ?? "").trim();
    const track = String(row[ci.track] ?? "").trim();
    const phone = String(row[ci.phone] ?? "").trim();
    const nationalId = String(row[ci.nationalId] ?? "").trim();
    const note = String(row[ci.note] ?? "").trim();
    const startDate = String(row[ci.startDate] ?? "").trim();
    const duration = durationDaysFromText(String(row[ci.duration] ?? ""));

    if (!name) { skipped++; continue; }

    // 1) user + access_grant
    let userId = null;
    if (email) {
      const [existingUser] = await db.query("SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1", [email]);
      if (existingUser[0]) {
        userId = existingUser[0].id;
      } else {
        const [ins] = await db.query(
          "INSERT INTO users (openId, name, email, role, mustChangePassword, loginMethod) VALUES (?, ?, ?, 'user', true, 'seed_trainee')",
          [`seed:${email}`, name, email],
        );
        userId = ins.insertId;
        createdUsers++;
      }
      await db.query(
        "INSERT INTO access_grants (fullName, officialEmail, notificationEmail, permission, isActive, grantedByUserId) VALUES (?, ?, ?, 'trainee', true, ?) ON DUPLICATE KEY UPDATE fullName = VALUES(fullName), permission = VALUES(permission), isActive = true, updatedAt = NOW()",
        [name, email, email, SYSTEM_USER_ID],
      );
      createdGrants++;
      await db.query("UPDATE access_grants SET userId = ? WHERE LOWER(officialEmail) = LOWER(?)", [userId, email]);
    }

    // 2) مطابقة القاضي
    let supervisingJudgeProfileId = null;
    const key = judgeKey(judgeName);
    const candidates = judgeIndex.get(key) || [];
    if (candidates.length === 1) {
      supervisingJudgeProfileId = candidates[0].id;
      matchedLinks++;
    } else if (candidates.length > 1) {
      const byFormation = candidates.find(c => normalizeArabic(c.judicialFormation) === normalizeArabic(formation));
      supervisingJudgeProfileId = (byFormation || candidates[0]).id;
      matchedLinks++;
      multiMatches.push({ judgeName, formation, count: candidates.length });
    } else {
      unmatchedJudges.add(judgeName);
    }

    // 3) person_profile
    const [profileRes] = await db.query(
      "INSERT INTO person_profiles (userId, unitId, personType, fullName, email, nationalId, phone, judicialFormation, attendanceMode, status, sourceReference) VALUES (?, ?, 'trainee', ?, ?, ?, ?, ?, 'remote', 'active', ?)",
      [userId, TRAINEE_UNIT_ID, name, email || null, nationalId || null, phone || null, formation || null, SOURCE_REFERENCE],
    );
    const profileId = profileRes.insertId;
    createdProfiles++;

    // 4) trainee_assignment
    await db.query(
      "INSERT INTO trainee_assignments (profileId, supervisingJudgeProfileId, trainingJudge, courtTrack, sourceStartDate, durationDays, status, sourceNote) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)",
      [profileId, supervisingJudgeProfileId, judgeName || null, track || null, startDate || null, duration, note || null],
    );
    createdAssignments++;
  }

  if (DRY_RUN) await db.rollback();
  else await db.commit();
} catch (err) {
  await db.rollback();
  throw err;
} finally {
  await db.end();
}

console.log("\n=== تقرير الاستيراد ===");
console.log(`ملازمون (person_profiles): ${createdProfiles}`);
console.log(`trainee_assignments: ${createdAssignments}`);
console.log(`روابط قاضٍ مطابق: ${matchedLinks}`);
console.log(`قضاة غير مطابقين: ${unmatchedJudges.size}`);
if (unmatchedJudges.size) console.log("  - " + [...unmatchedJudges].sort().join("\n  - "));
if (multiMatches.length) {
  console.log("\nتعدد مطابقة (اخترنا المطابق للتشكيل أو الأول):");
  for (const m of multiMatches) console.log(`  - ${m.judgeName} (${m.count} سجل) → تشكيل ${m.formation}`);
}
console.log(`users جديدة: ${createdUsers}`);
console.log(`access_grants: ${createdGrants}`);
console.log(`skipped: ${skipped}`);
console.log(DRY_RUN ? "\n[DRY-RUN] تم التراجع — لم يُحفظ أي تغيير." : "\nتم الالتزام (commit) بنجاح.");


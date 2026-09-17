#!/usr/bin/env node
/**
 * استيراد قضاة المحكمة من ملف Excel وتسكينهم في التشكيلات القضائية.
 *
 * الأعمدة المتوقعة: [التشكيل, القاضي, البريد الالكتروني].
 * - يُنشئ/يحدّث ملف شخصي لكل قاضٍ (personType = "judge") مع ربطه بالدائرة (judicialFormation).
 * - يتعامل مع القضاة المكلفين (بدون بريد) عبر المطابقة بالاسم.
 *
 * الاستخدام: node --env-file=.env.production.local scripts/import-judges.mjs <path-to-xlsx>
 */
import XLSX from "xlsx";
import mysql from "mysql2/promise";

const filePath = process.argv[2] || "C:/Users/asus/OneDrive/Desktop/قضاة المحكمة.xlsx";
const db = await mysql.createConnection(process.env.DATABASE_URL);

const wb = XLSX.readFile(filePath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

let inserted = 0;
let updated = 0;

for (const row of rows.slice(1)) {
  const [formationRaw, nameRaw, emailRaw] = row;
  const formation = String(formationRaw ?? "").trim();
  const rawName = String(nameRaw ?? "").trim();
  const fullName = rawName.replace(/^مكلف\s*/i, "").trim();
  const acting = /^مكلف/i.test(rawName);
  const email = String(emailRaw ?? "").trim().toLowerCase() || null;

  if (!fullName || !formation) continue;

  const jobTitle = acting ? "قاضٍ مكلف" : "قاضٍ";
  const values = {
    personType: "judge",
    fullName,
    email,
    judicialFormation: formation,
    jobTitle,
    status: "active",
    activityState: "inactive",
  };

  // البحث عن سجل قائم بالبريد ثم بالاسم والتشكيل.
  let existing = null;
  if (email) {
    [existing] = await db.query(
      "SELECT id FROM person_profiles WHERE LOWER(email) = ? LIMIT 1",
      [email],
    );
  }
  if (!existing?.[0]?.id) {
    [existing] = await db.query(
      "SELECT id FROM person_profiles WHERE personType = 'judge' AND fullName = ? AND judicialFormation = ? LIMIT 1",
      [fullName, formation],
    );
  }

  if (existing?.[0]?.id) {
    await db.query(
      "UPDATE person_profiles SET personType = 'judge', judicialFormation = ?, jobTitle = ?, status = 'active', email = COALESCE(?, email), updatedAt = NOW() WHERE id = ?",
      [formation, jobTitle, email, existing[0].id],
    );
    updated += 1;
  } else {
    const [res] = await db.query(
      "INSERT INTO person_profiles (personType, fullName, email, judicialFormation, jobTitle, status, activityState) VALUES ('judge', ?, ?, ?, ?, 'active', 'inactive')",
      [fullName, email, formation, jobTitle],
    );
    inserted += 1;
  }
}

await db.end();
console.log(`[judges] تم الاستيراد — أُنشئ: ${inserted}، حُدّث: ${updated} قاضٍ في تشكيلاتهم القضائية.`);

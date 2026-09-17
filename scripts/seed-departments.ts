#!/usr/bin/env node
/**
 * Idempotent department structure + managers seeding.
 * Usage: pnpm exec tsx scripts/seed-departments.ts  (requires DATABASE_URL)
 */
import mysql from "mysql2/promise";

const UNITS: Array<{ name: string }> = [
  { name: "مكتب فضيلة رئيس المحكمة" },
  { name: "أمانة المحكمة" },
  { name: "مكتب التنسيق" },
  { name: "إدارة مراقبة الأداء والعمليات" },
  { name: "شؤون القضاة" },
  { name: "شؤون الملازمين" },
  { name: "إدارة الخدمات المشتركة" },
  { name: "الموارد البشرية" },
  { name: "الاتصالات الإدارية" },
  { name: "الخدمات والصيانة" },
  { name: "القسم النسائي" },
  { name: "إدارة الإسناد القضائي" },
  { name: "وحدة إدارة القضايا" },
  { name: "محضرو الخصوم" },
  { name: "الباحثون" },
  { name: "إدارة الجلسات" },
  { name: "إدارة الدعاوى والأحكام" },
  { name: "الوثائق والمحفوظات" },
  { name: "قسم الدعاوى" },
  { name: "خدمات المستفيدين" },
  { name: "تسليم الأحكام" },
];

type Person = {
  fullName: string;
  unitName: string;
  jobTitle: string;
  role: string | null;
  personType: "judge" | "administrative";
  email?: string;
};

const PEOPLE: Person[] = [
  { fullName: "سعد ناصر عبدالعزيز الصويغ", unitName: "مكتب فضيلة رئيس المحكمة", jobTitle: "رئيس المحكمة", role: "court_president", personType: "judge", email: "snaswig@moj.gov.sa" },
  { fullName: "حاتم محمد عبدالله الفالح", unitName: "مكتب فضيلة رئيس المحكمة", jobTitle: "الرئيس المساعد", role: "assistant_president", personType: "judge", email: "hfaleh@moj.gov.sa" },
  { fullName: "عبدالله شباب سليمان العتيبي", unitName: "أمانة المحكمة", jobTitle: "أمين المحكمة", role: "court_secretary", personType: "administrative", email: "abssotaibi@moj.gov.sa" },
  { fullName: "ناصر المدرع", unitName: "مكتب التنسيق", jobTitle: "مسؤول مكتب التنسيق", role: "administrative_staff", personType: "administrative" },
  { fullName: "مساعد عبدالله بن حمد الجابر", unitName: "إدارة مراقبة الأداء والعمليات", jobTitle: "مدير مراقبة الأداء", role: "performance_monitor", personType: "administrative", email: "mahjaber@moj.gov.sa" },
  { fullName: "مبارك الودمان", unitName: "شؤون القضاة", jobTitle: "مسؤول شؤون القضاة", role: "department_manager", personType: "administrative", email: "mwadaman@moj.gov.sa" },
  { fullName: "فهد سلطان ناصر الراجح", unitName: "شؤون الملازمين", jobTitle: "مدير شؤون الملازمين", role: "trainee_affairs_manager", personType: "administrative", email: "fsurajeh@moj.gov.sa" },
  { fullName: "عادل الحسن", unitName: "إدارة الخدمات المشتركة", jobTitle: "مدير إدارة الخدمات المشتركة", role: "department_manager", personType: "administrative", email: "ahhasan@moj.gov.sa" },
  { fullName: "عبدالله الشايع", unitName: "الموارد البشرية", jobTitle: "رئيس الموارد البشرية", role: "human_resources_manager", personType: "administrative" },
  { fullName: "عبدالمحسن السقياني", unitName: "الاتصالات الإدارية", jobTitle: "رئيس الاتصالات الإدارية", role: "administrative_staff", personType: "administrative" },
  { fullName: "فيصل بن حميد", unitName: "الخدمات والصيانة", jobTitle: "رئيس الخدمات والصيانة", role: "administrative_staff", personType: "administrative" },
  { fullName: "اماني احمد بن صالح العثمان", unitName: "القسم النسائي", jobTitle: "رئيسة القسم النسائي", role: "department_manager", personType: "administrative", email: "alothman@moj.gov.sa" },
  { fullName: "فهد العنزي", unitName: "إدارة الإسناد القضائي", jobTitle: "مدير إدارة الإسناد القضائي", role: "department_manager", personType: "administrative", email: "ftenezi@moj.gov.sa" },
  { fullName: "رائد العصيمي", unitName: "وحدة إدارة القضايا", jobTitle: "رئيس وحدة إدارة القضايا", role: "administrative_staff", personType: "administrative" },
  { fullName: "النويبت", unitName: "محضرو الخصوم", jobTitle: "رئيس محضري الخصوم", role: "administrative_staff", personType: "administrative" },
  { fullName: "نواف السلمان", unitName: "الباحثون", jobTitle: "رئيس الباحثين", role: "administrative_staff", personType: "administrative" },
  { fullName: "معاذ العبيد", unitName: "إدارة الجلسات", jobTitle: "رئيس إدارة الجلسات", role: "administrative_staff", personType: "administrative" },
  { fullName: "ماجد الصبيحي", unitName: "إدارة الدعاوى والأحكام", jobTitle: "مدير إدارة الدعاوى والأحكام", role: "department_manager", personType: "administrative", email: "msabihi@moj.gov.sa" },
  { fullName: "فهد الفوزاني", unitName: "الوثائق والمحفوظات", jobTitle: "رئيس الوثائق والمحفوظات", role: "administrative_staff", personType: "administrative" },
  { fullName: "خالد المشوح", unitName: "قسم الدعاوى", jobTitle: "رئيس قسم الدعاوى", role: "administrative_staff", personType: "administrative" },
  { fullName: "سعيد باعباد", unitName: "خدمات المستفيدين", jobTitle: "رئيس خدمات المستفيدين", role: "administrative_staff", personType: "administrative" },
  { fullName: "عبدالعزيز محمد بن عبدالعزيز الحميدي", unitName: "تسليم الأحكام", jobTitle: "رئيس تسليم الأحكام", role: "department_manager", personType: "administrative", email: "amhumaidi@moj.gov.sa" },
];

function norm(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

async function unitIdFor(connection: mysql.Connection, name: string) {
  const n = norm(name);
  const [existing] = await connection.execute("SELECT id FROM organization_units WHERE name = ? LIMIT 1", [n]);
  if (existing[0]) return existing[0].id;
  const code = `seed-${Buffer.from(n).toString("base64url").slice(0, 40)}`;
  await connection.execute(
    "INSERT INTO organization_units (name, code, isActive) VALUES (?, ?, true) ON DUPLICATE KEY UPDATE name = VALUES(name), isActive = true",
    [n, code],
  );
  const [row] = await connection.execute("SELECT id FROM organization_units WHERE name = ? LIMIT 1", [n]);
  return row[0]?.id ?? null;
}

async function ensureUser(connection: mysql.Connection, email: string, fullName: string) {
  const [existing] = await connection.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1", [email]);
  if (existing[0]) return existing[0].id;
  const [inserted] = await connection.execute(
    "INSERT INTO users (email, name, role, loginMethod, mustChangePassword) VALUES (?, ?, 'user', 'manus', true)",
    [email, fullName],
  );
  return inserted.insertId;
}

async function findProfile(connection: mysql.Connection, person: Person) {
  if (person.email) {
    const [byEmail] = await connection.execute("SELECT id, userId, unitId, fullName, email FROM person_profiles WHERE LOWER(email) = LOWER(?) LIMIT 1", [person.email]);
    if (byEmail[0]) return byEmail[0];
  }
  const [byName] = await connection.execute("SELECT id, userId, unitId, fullName, email FROM person_profiles WHERE fullName = ? LIMIT 1", [person.fullName]);
  return byName[0] ?? null;
}

async function ensureCourtRole(connection: mysql.Connection, userId: number, role: string, unitId: number | null) {
  const [existing] = await connection.execute("SELECT id FROM court_role_assignments WHERE userId = ? AND role = ? AND isActive = true LIMIT 1", [userId, role]);
  if (existing[0]) {
    await connection.execute("UPDATE court_role_assignments SET unitId = ? WHERE id = ?", [unitId, existing[0].id]);
    return;
  }
  await connection.execute(
    "INSERT INTO court_role_assignments (userId, role, unitId, delegatedByUserId, isActive) VALUES (?, ?, ?, 1, true)",
    [userId, role, unitId],
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(JSON.stringify({ skipped: true, reason: "DATABASE_URL missing" }));
    process.exit(0);
  }
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const report = { units: 0, profiles: 0, roles: 0, needEmail: [] as string[] };
  try {
    for (const unit of UNITS) {
      await unitIdFor(connection, unit.name);
      report.units += 1;
    }
    for (const person of PEOPLE) {
      const unitId = await unitIdFor(connection, person.unitName);
      let userId: number | null = null;
      if (person.email) {
        userId = await ensureUser(connection, person.email, person.fullName);
      }
      let profile = await findProfile(connection, person);
      if (!profile) {
        const [inserted] = await connection.execute(
          "INSERT INTO person_profiles (userId, unitId, personType, fullName, email, jobTitle, status, sourceReference) VALUES (?, ?, ?, ?, ?, ?, 'active', 'seed-departments-2026')",
          [userId, unitId, person.personType, person.fullName, person.email ?? null, person.jobTitle],
        );
        profile = { id: inserted.insertId, userId, unitId, fullName: person.fullName, email: person.email ?? null };
        report.profiles += 1;
      } else {
        await connection.execute(
          "UPDATE person_profiles SET userId = COALESCE(userId, ?), unitId = COALESCE(?, unitId), email = COALESCE(email, ?), jobTitle = ?, status = 'active', updatedAt = NOW() WHERE id = ?",
          [userId, unitId, person.email ?? null, person.jobTitle, profile.id],
        );
      }
      if (person.email && userId && person.role) {
        await ensureCourtRole(connection, userId, person.role, person.role === "court_president" || person.role === "assistant_president" || person.role === "court_secretary" ? null : unitId);
        report.roles += 1;
      } else if (!person.email && person.role === "department_manager") {
        report.needEmail.push(person.fullName);
      }
    }
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


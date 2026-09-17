#!/usr/bin/env node
/**
 * بذر الحسابات الإدارية والأدوار في قاعدة TiDB (Idempotent).
 * 1) يضمن حسابات المستخدمين + منح الدخول النشطة + الملفات الشخصية + الأدوار القضائية.
 * 2) يعالج دخول المالك: mustChangePassword=false حتى يعمل الدخول عبر Google.
 * Usage: node --env-file=.env.prod scripts/seed-admin-roles.mjs
 */
import mysql from "mysql2/promise";

const OWNER_EMAIL = (process.env.PLATFORM_OWNER_EMAIL || "rakizaplatform@gmail.com").trim().toLowerCase();

const ACCOUNTS = [
  { fullName: "مالك المنصة", email: OWNER_EMAIL, role: null, permission: "full_control", personType: "administrative", unitName: null, userRole: "admin", mustChangePassword: false, note: "مالك المنصة (تحكم كامل)" },
  { fullName: "سعد ناصر عبدالعزيز الصويغ", email: "snaswig@moj.gov.sa", role: "court_president", permission: "general_view", personType: "judge", unitName: null, userRole: "user", mustChangePassword: true, note: "رئيس المحكمة" },
  { fullName: "حاتم محمد عبدالله الفالح", email: "hfaleh@moj.gov.sa", role: "assistant_president", permission: "general_view", personType: "judge", unitName: null, userRole: "user", mustChangePassword: true, note: "الرئيس المساعد" },
  { fullName: "عبدالله شباب سليمان العتيبي", email: "abssotaibi@moj.gov.sa", role: "court_secretary", permission: "general_view", personType: "administrative", unitName: "أمانة المحكمة", userRole: "user", mustChangePassword: true, note: "الأمين العام" },
  { fullName: "فهد سلطان ناصر الراجح", email: "fsurajeh@moj.gov.sa", role: "trainee_affairs_manager", permission: "general_view", personType: "administrative", unitName: "شؤون الملازمين", userRole: "user", mustChangePassword: true, note: "مدير شؤون الملازمين" },
  { fullName: "عبدالعزيز محمد بن عبدالعزيز الحميدي", email: "amhumaidi@moj.gov.sa", role: "department_manager", permission: "employee", personType: "administrative", unitName: "تسليم الاحكام", userRole: "user", mustChangePassword: true, note: "مدير قسم تسليم الأحكام" },
  { fullName: "مساعد عبدالله بن حمد الجابر", email: "mahjaber@moj.gov.sa", role: "performance_monitor", permission: "general_view", personType: "administrative", unitName: "إدارة مراقبة الأداء والعمليات", userRole: "user", mustChangePassword: true, note: "مدير قسم مراقبة الأداء" },
  { fullName: "اماني احمد بن صالح العثمان", email: "alothman@moj.gov.sa", role: "department_manager", permission: "employee", personType: "administrative", unitName: "القسم النسائي", userRole: "user", mustChangePassword: true, note: "مدير القسم النسائي" },
  { fullName: "بندر حمد عبدالعزيز الصالح", email: "bhabdaziz@moj.gov.sa", role: "department_manager", permission: "employee", personType: "administrative", unitName: "مكتب فضيلة رئيس المحكمة", userRole: "user", mustChangePassword: true, note: "مدير مكتب الرئيس" },
  { fullName: "سعد حسن عبدالرحمن السميح", email: "shsamaih@moj.gov.sa", role: "administrative_staff", permission: "employee", personType: "administrative", unitName: "مكتب فضيلة رئيس المحكمة", userRole: "user", mustChangePassword: true, note: "موظف مكتب الرئيس" },
];

const UNIT_ALIASES = new Map([
  ["مكتب فضيلة رئيس المحكمة", 90002],
  ["مكتب المساعد الرئيس", 90004],
  ["شؤون الملازمين", 90008],
  ["أمانة المحكمة", 90010],
  ["تسليم الاحكام", 90015],
  ["إدارة مراقبة الأداء والعمليات", 90024],
  ["القسم النسائي", 90030],
]);

const normalize = value => String(value ?? "").trim().replace(/\s+/g, " ");

async function ensureUnit(connection, name) {
  if (!name) return null;
  const normalized = normalize(name);
  const preferred = UNIT_ALIASES.get(normalized);
  if (preferred) {
    const [byId] = await connection.query("SELECT id FROM organization_units WHERE id = ? LIMIT 1", [preferred]);
    if (byId[0]) return byId[0].id;
  }
  const [byName] = await connection.query("SELECT id FROM organization_units WHERE name = ? LIMIT 1", [normalized]);
  if (byName[0]) return byName[0].id;
  const code = `seed-${Buffer.from(normalized).toString("base64url").slice(0, 40)}`;
  await connection.query(
    "INSERT INTO organization_units (name, code, isActive) VALUES (?, ?, true) ON DUPLICATE KEY UPDATE name = VALUES(name), isActive = true",
    [normalized, code],
  );
  const [created] = await connection.query("SELECT id FROM organization_units WHERE code = ? OR name = ? LIMIT 1", [code, normalized]);
  return created[0]?.id ?? null;
}


async function ensureUser(connection, { email, fullName, userRole, mustChangePassword }) {
  const [existing] = await connection.query("SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1", [email]);
  if (existing[0]) {
    const role = userRole === "admin" ? "admin" : "user";
    await connection.query("UPDATE users SET name = ?, role = ?, mustChangePassword = ?, updatedAt = NOW() WHERE id = ?", [fullName, role, mustChangePassword, existing[0].id]);
    return existing[0].id;
  }
  const openId = `seed:${email}`;
  const role = userRole === "admin" ? "admin" : "user";
  const [result] = await connection.query(
    "INSERT INTO users (openId, name, email, role, mustChangePassword, loginMethod) VALUES (?, ?, ?, ?, ?, 'seed_admin')",
    [openId, fullName, email, role, mustChangePassword],
  );
  return result.insertId;
}

async function ensureAccessGrant(connection, { fullName, email, permission, grantedByUserId }) {
  await connection.query(
    `INSERT INTO access_grants (fullName, officialEmail, notificationEmail, permission, isActive, grantedByUserId)
     VALUES (?, ?, ?, ?, true, ?)
     ON DUPLICATE KEY UPDATE fullName = VALUES(fullName), permission = VALUES(permission), notificationEmail = VALUES(notificationEmail), isActive = true, grantedByUserId = VALUES(grantedByUserId), updatedAt = NOW()`,
    [fullName, email, email, permission, grantedByUserId],
  );
}

async function findProfile(connection, { email, fullName }) {
  const [byEmail] = await connection.query("SELECT id, userId, unitId, fullName, email FROM person_profiles WHERE LOWER(email) = LOWER(?) LIMIT 1", [email]);
  if (byEmail[0]) return byEmail[0];
  const [byName] = await connection.query("SELECT id, userId, unitId, fullName, email FROM person_profiles WHERE fullName = ? LIMIT 1", [fullName]);
  return byName[0] ?? null;
}

async function ensureCourtRole(connection, { userId, role, unitId, delegatedByUserId }) {
  if (!role || !userId) return;
  const [existing] = await connection.query("SELECT id FROM court_role_assignments WHERE userId = ? AND role = ? AND isActive = true LIMIT 1", [userId, role]);
  if (existing[0]) {
    await connection.query("UPDATE court_role_assignments SET unitId = ?, delegatedByUserId = ? WHERE id = ?", [unitId, delegatedByUserId, existing[0].id]);
    return;
  }
  await connection.query(
    "INSERT INTO court_role_assignments (userId, role, unitId, delegatedByUserId, isActive) VALUES (?, ?, ?, ?, true)",
    [userId, role, unitId, delegatedByUserId],
  );
}

async function main() {
  const raw = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
  if (!raw) {
    console.log(JSON.stringify({ skipped: true, reason: "DATABASE_URL missing", accountCount: ACCOUNTS.length }, null, 2));
    process.exit(0);
  }
  const url = new URL(raw);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 4000),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, "") || "rakiza",
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  });

  // تنظيف بريدات خاطئة سابقة (مشتقة محلياً ثم استُبدلت بالبريد الرسمي الصحيح).
  const LEGACY_EMAILS = ["falrajh@moj.gov.sa", "maljaber@moj.gov.sa", "aalothman@moj.gov.sa"];
  for (const email of LEGACY_EMAILS) {
    const [legacyUsers] = await connection.query("SELECT id FROM users WHERE LOWER(email) = LOWER(?)", [email]);
    const ids = legacyUsers.map(row => row.id);
    if (ids.length) {
      await connection.query("DELETE FROM court_role_assignments WHERE userId IN (?)", [ids]);
      await connection.query("DELETE FROM person_profiles WHERE userId IN (?)", [ids]);
      await connection.query("DELETE FROM access_grants WHERE LOWER(officialEmail) = LOWER(?)", [email]);
      await connection.query("DELETE FROM users WHERE id IN (?)", [ids]);
    } else {
      await connection.query("DELETE FROM access_grants WHERE LOWER(officialEmail) = LOWER(?)", [email]);
      await connection.query("DELETE FROM person_profiles WHERE LOWER(email) = LOWER(?)", [email]);
    }
  }

  const report = { ok: true, upserted: [], warnings: [] };
  try {
    const ownerUserId = await ensureUser(connection, { email: OWNER_EMAIL, fullName: "مالك المنصة", userRole: "admin", mustChangePassword: false });
    await ensureAccessGrant(connection, { fullName: "مالك المنصة", email: OWNER_EMAIL, permission: "full_control", grantedByUserId: ownerUserId || 1 });

    for (const account of ACCOUNTS) {
      const unitId = await ensureUnit(connection, account.unitName);
      const userId = account.email === OWNER_EMAIL ? ownerUserId : await ensureUser(connection, { email: account.email, fullName: account.fullName, userRole: account.userRole, mustChangePassword: account.mustChangePassword });
      await ensureAccessGrant(connection, { fullName: account.fullName, email: account.email, permission: account.permission, grantedByUserId: ownerUserId || 1 });

      let profile = await findProfile(connection, account);
      if (!profile) {
        const [inserted] = await connection.query(
          `INSERT INTO person_profiles (userId, unitId, personType, fullName, email, jobTitle, status, sourceReference)
           VALUES (?, ?, ?, ?, ?, ?, 'active', 'seed-admin-roles-2026-09-16')`,
          [userId, unitId, account.personType, account.fullName, account.email, account.note ?? null],
        );
        profile = { id: inserted.insertId, userId, unitId, fullName: account.fullName, email: account.email };
        report.warnings.push({ email: account.email, createdProfile: true });
      } else {
        await connection.query(
          `UPDATE person_profiles SET userId = COALESCE(userId, ?), unitId = COALESCE(?, unitId), email = COALESCE(email, ?), status = 'active', updatedAt = NOW() WHERE id = ?`,
          [userId, unitId, account.email, profile.id],
        );
      }
      await connection.query("UPDATE access_grants SET userId = ? WHERE LOWER(officialEmail) = LOWER(?)", [userId, account.email]);
      const roleUnit = ["department_manager", "administrative_staff", "trainee_affairs_manager", "performance_monitor"].includes(account.role) ? unitId : null;
      await ensureCourtRole(connection, { userId, role: account.role, unitId: roleUnit, delegatedByUserId: ownerUserId || 1 });

      if (account.needsEmailConfirm) report.warnings.push({ email: account.email, fullName: account.fullName, note: "بريد مشتق محلياً — يُرجى التأكد منه من سجل الموظفين" });

      report.upserted.push({ email: account.email, fullName: account.fullName, role: account.role, permission: account.permission, unitId, userId, mustChangePassword: account.mustChangePassword });
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

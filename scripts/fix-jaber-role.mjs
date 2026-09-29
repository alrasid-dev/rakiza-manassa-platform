// scripts/fix-jaber-role.mjs — المهمة 3: تصحيح مساعد الجابر (department_manager) + تصحيح الاسمين
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
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
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 4000), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza", ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true });

const JABER = "مساعد عبدالله بن حمد الجابر";

// 1) تحديث الملف الشخصي
const [pp] = await db.query("UPDATE person_profiles SET unitId = 4, status = 'active', personType = 'administrative', jobTitle = 'مدير قسم' WHERE fullName = ?", [JABER]);
console.log("person_profiles updated:", pp.affectedRows);

// 2) حذف trainee_assignments
const [ta] = await db.query("DELETE FROM trainee_assignments WHERE profileId IN (SELECT id FROM person_profiles WHERE fullName = ?) OR supervisingJudgeProfileId IN (SELECT id FROM person_profiles WHERE fullName = ?)", [JABER, JABER]);
console.log("trainee_assignments deleted:", ta.affectedRows);

// 3) حذف الأدوار غير department_manager
const [del] = await db.query("DELETE FROM court_role_assignments WHERE userId = (SELECT u.id FROM users u JOIN person_profiles p ON p.userId = u.id WHERE p.fullName = ? LIMIT 1) AND role != 'department_manager'", [JABER]);
console.log("court_role_assignments (غير department_manager) deleted:", del.affectedRows);

// 4) إضافة دور department_manager لـ unitId=4
const [ins] = await db.query("INSERT INTO court_role_assignments (userId, role, unitId, isActive, delegatedByUserId, startsAt, createdAt) SELECT u.id, 'department_manager', 4, 1, 1, NOW(), NOW() FROM users u JOIN person_profiles p ON p.userId = u.id WHERE p.fullName = ? LIMIT 1", [JABER]);
console.log("court_role_assignments inserted:", ins.affectedRows);

// 5) تحديث الصلاحية إلى employee
const [ag] = await db.query("UPDATE access_grants SET permission = 'employee', isActive = 1 WHERE userId = (SELECT u.id FROM users u JOIN person_profiles p ON p.userId = u.id WHERE p.fullName = ? LIMIT 1)", [JABER]);
console.log("access_grants updated:", ag.affectedRows);

// 6) تصحيح الاسمين (تاء مربوطة)
const [n1] = await db.query("UPDATE person_profiles SET fullName = 'سارة رشدان راشد العصيمي' WHERE id = 60126");
console.log("سارة العصيمي corrected:", n1.affectedRows);
const [n2] = await db.query("UPDATE person_profiles SET fullName = 'سمية سعد بن عبدالله السلمان' WHERE id = 60131");
console.log("سمية السلمان corrected:", n2.affectedRows);

await db.end();

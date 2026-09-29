#!/usr/bin/env node
/**
 * scripts/setup-judges-access.mjs
 * يمنح القضاة (personType='judge') صلاحية موظف كاملة:
 * ينشئ user + access_grant (permission=employee) ويربط person_profiles.userId.
 * الاستخدام:
 *   node scripts/setup-judges-access.mjs --dry-run   (فحص فقط)
 *   node scripts/setup-judges-access.mjs             (تنفيذ فعلي)
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function readEnv(filePath, key) {
  if (!fs.existsSync(filePath)) return null;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    if (t.slice(0, eq).trim() !== key) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

const DRY_RUN = process.argv.includes("--dry-run");
const raw = readEnv(path.resolve(".env.production.local"), "DATABASE_URL") || process.env.DATABASE_URL;
if (!raw) { console.error("DATABASE_URL غير موجود"); process.exit(1); }
const url = new URL(raw);
const db = await mysql.createConnection({ host: url.hostname, port: Number(url.port || 4000), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza", ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" } });

const [judges] = await db.query("SELECT id, fullName, email, userId FROM person_profiles WHERE personType = 'judge' ORDER BY id");
const report = { mode: DRY_RUN ? "dry-run" : "commit", judges: judges.length, createdUsers: 0, createdGrants: 0, linkedProfiles: 0, reusedUsers: 0, existingGrants: 0, skippedNoEmail: 0, warnings: [] };

await db.beginTransaction();
try {
  for (const judge of judges) {
    const email = (judge.email ?? "").trim().toLowerCase();
    if (!email) { report.skippedNoEmail += 1; report.warnings.push({ judgeId: judge.id, name: judge.fullName, reason: "لا يوجد بريد رسمي" }); continue; }

    // 1) تحديد/إنشاء المستخدم.
    let userId = judge.userId;
    if (userId) {
      const [rows] = await db.query("SELECT id FROM users WHERE id = ? LIMIT 1", [userId]);
      if (!rows[0]) userId = null;
    }
    if (!userId) {
      const [byEmail] = await db.query("SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1", [email]);
      if (byEmail[0]) {
        userId = byEmail[0].id;
        report.reusedUsers += 1;
      } else {
        const openId = `seed:${email}`;
        const [ins] = await db.query(
          "INSERT INTO users (openId, name, email, role, mustChangePassword, loginMethod) VALUES (?, ?, ?, 'user', true, 'seed_judge')",
          [openId, judge.fullName, email],
        );
        userId = ins.insertId;
        report.createdUsers += 1;
      }
    }

    // 2) ربط الملف الشخصي بالمستخدم.
    if (judge.userId !== userId) {
      await db.query("UPDATE person_profiles SET userId = ? WHERE id = ?", [userId, judge.id]);
      report.linkedProfiles += 1;
    }

    // 3) إنشاء منحة الوصول إن لم توجد (بالبريد أو المستخدم).
    const [grants] = await db.query("SELECT id FROM access_grants WHERE userId = ? OR LOWER(officialEmail) = LOWER(?) LIMIT 1", [userId, email]);
    if (grants[0]) {
      report.existingGrants += 1;
    } else {
      await db.query(
        "INSERT INTO access_grants (userId, fullName, officialEmail, notificationEmail, permission, isActive, grantedByUserId) VALUES (?, ?, ?, ?, 'employee', true, 1) ON DUPLICATE KEY UPDATE isActive = true, userId = VALUES(userId)",
        [userId, judge.fullName, email, email],
      );
      report.createdGrants += 1;
    }
  }
  if (!DRY_RUN) await db.commit();
  else await db.rollback();
} catch (err) {
  await db.rollback();
  throw err;
}

console.log(JSON.stringify(report, null, 2));
await db.end();

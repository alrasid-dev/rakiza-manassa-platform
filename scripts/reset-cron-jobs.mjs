// scripts/reset-cron-jobs.mjs
// يعيد تعيين scheduleCronTaskUid (NULL) للوظائف الخمس المخفَّفة،
// تمهيداً لإعادة تسجيلها بالجداول الجديدة (مرة/يوم) عبر activate-cron-jobs.mjs.
// لا يلمس أي وظيفة أخرى (daily_task_reminder / trainee_due_soon / monthly_settlement).
//
// الاستخدام:
//   node scripts/reset-cron-jobs.mjs           -> معاينة فقط (بدون تغيير)
//   node scripts/reset-cron-jobs.mjs --apply   -> تنفيذ المسح بعد حفظ نسخة احتياطية

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const TARGET_JOBS = [
  "task_escalation",
  "trainee_excel_sync",
  "leave_status_refresh",
  "support_ticket_escalation",
  "attendance_confirmation",
];

let rawUrl = "";

function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    if (t.slice(0, eq).trim() !== key) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else if (v.startsWith('"') || v.startsWith("'")) v = v.slice(1);
    else if (v.endsWith('"') || v.endsWith("'")) v = v.slice(0, -1);
    return v;
  }
  return null;
}

function readEnv(key) {
  for (const f of [".env.production.local", ".env.local", ".env"]) {
    const v = readEnvValue(path.resolve(f), key);
    if (v) return v;
  }
  return process.env[key] || "";
}

function redact(message) {
  let out = String(message);
  try {
    if (rawUrl) {
      const url = new URL(rawUrl);
      if (url.password) out = out.split(url.password).join("***");
      out = out.split(rawUrl).join("[REDACTED]");
    }
  } catch {
    /* ignore */
  }
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");
  rawUrl = readEnv("DATABASE_URL");
  if (!rawUrl) {
    console.error("DATABASE_URL غير موجود في .env.production.local");
    process.exit(1);
  }

  const url = new URL(rawUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 4000),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  console.log("Connected to " + database + " @ " + url.hostname + ":" + (url.port || 4000));
  console.log("Mode: " + (apply ? "APPLY (تنفيذ)" : "PREVIEW (معاينة فقط)"));
  console.log("");

  const [rows] = await connection.query(
    "SELECT id, jobType, scheduleCronTaskUid, cronExpression, isActive FROM scheduled_job_configs ORDER BY id"
  );

  console.log("--- الحالة الحالية ---");
  for (const r of rows) {
    console.log(`${r.jobType.padEnd(26)} uid=${r.scheduleCronTaskUid || "(null)"}  cron=${r.cronExpression}  active=${r.isActive}`);
  }
  console.log("");

  // نسخة احتياطية من القيم القديمة.
  const backupPath = path.resolve("backups", `cron-job-configs-before-reset-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ exportedAt: new Date().toISOString(), rows }, null, 2));
  console.log("✅ نسخة احتياطية محفوظة: " + backupPath);
  console.log("");

  const toReset = rows.filter(r => TARGET_JOBS.includes(r.jobType));
  console.log("--- الوظائف المستهدفة (5) ---");
  for (const r of toReset) {
    const willClear = r.scheduleCronTaskUid ? `سيُمسح uid=${r.scheduleCronTaskUid}` : "uid فارغ أصلاً — لا تغيير";
    console.log(`${r.jobType.padEnd(26)} ${willClear}`);
  }
  console.log("");

  if (!apply) {
    console.log("(لم يُنفَّذ أي تغيير — أضِف --apply للتنفيذ الفعلي)");
    await connection.end();
    return;
  }

  let cleared = 0;
  for (const r of toReset) {
    if (!r.scheduleCronTaskUid) continue;
    await connection.query("UPDATE scheduled_job_configs SET scheduleCronTaskUid = NULL, updatedAt = NOW() WHERE jobType = ?", [r.jobType]);
    cleared += 1;
    console.log(`✅ cleared: ${r.jobType} (كان uid=${r.scheduleCronTaskUid})`);
  }

  console.log("");
  console.log(`اكتمل: أُعيد تعيين ${cleared} وظيفة (من أصل ${toReset.length} مستهدفة).`);
  console.log("الخطوة التالية: node scripts/activate-cron-jobs.mjs");
  await connection.end();
}

main().catch(err => {
  console.error("فشل: " + redact(err && err.message ? err.message : String(err)));
  process.exit(1);
});

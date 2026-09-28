// scripts/activate-cron-jobs.mjs
// تفعيل الوظائف المجدولة السبعة (CORE_JOBS):
//   1) تسجيل كل وظيفة في خدمة Heartbeat (webdevtoken.v1.WebDevService) لاستلام taskUid.
//   2) حفظ taskUid و cronExpression في جدول scheduled_job_configs مع isActive = 1.
// يقرأ DATABASE_URL وبيانات Forge من .env.production.local دون طباعة أي أسرار.
//
// الاستخدام:
//   node scripts/activate-cron-jobs.mjs          -> تسجيل الوظائف + عرض الجدول النهائي
//   node scripts/activate-cron-jobs.mjs --list   -> عرض الجدول الحالي فقط

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const SERVICE = "webdevtoken.v1.WebDevService";

const CORE_JOBS = [
  { jobType: "daily_task_reminder", cronExpression: "0 0 4 * * 0-4", path: "/api/scheduled/daily-task-reminder", description: "تذكير المهام اليومية في بداية يوم العمل" },
  { jobType: "task_escalation", cronExpression: "0 */15 4-12 * * 0-4", path: "/api/scheduled/task-escalation", description: "فحص التصعيدات كل 15 دقيقة أثناء وقت العمل" },
  { jobType: "trainee_due_soon", cronExpression: "0 0 3 * * *", path: "/api/scheduled/trainee-due-soon", description: "تنبيه الملازمين قبل انتهاء الملازمة بسبعة أيام" },
  { jobType: "leave_status_refresh", cronExpression: "0 0 * * * *", path: "/api/scheduled/leave-status-refresh", description: "تحديث حالات الإجازات آلياً" },
  { jobType: "trainee_excel_sync", cronExpression: "0 */30 4-12 * * 0-4", path: "/api/scheduled/trainee-excel-sync", description: "مزامنة مصدر Excel كل 30 دقيقة أثناء وقت العمل" },
  { jobType: "support_ticket_escalation", cronExpression: "0 0 * * * *", path: "/api/scheduled/support-ticket-escalation", description: "فحص تصعيد تذاكر الدعم كل ساعة" },
  { jobType: "attendance_confirmation", cronExpression: "0 0 4-12 * * 0-4", path: "/api/scheduled/attendance-confirmation", description: "إرسال طلبات تأكيد الحضور للعاملين عن بعد خلال وقت العمل" },
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    } else if (v.startsWith('"') || v.startsWith("'")) {
      v = v.slice(1);
    } else if (v.endsWith('"') || v.endsWith("'")) {
      v = v.slice(0, -1);
    }
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

function heartbeatEndpoint(forgeUrl, rpc) {
  const base = forgeUrl.endsWith("/") ? forgeUrl : forgeUrl + "/";
  return new URL(SERVICE + "/" + rpc, base).toString();
}

async function createHeartbeatJob(job, forgeUrl, forgeApiKey) {
  const endpoint = heartbeatEndpoint(forgeUrl, "CreateHeartbeatJob");
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${forgeApiKey}`,
    "content-type": "application/json",
    "connect-protocol-version": "1",
  };
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `rakiza-${job.jobType}`,
      cronExpression: job.cronExpression,
      callbackPath: job.path,
      callbackMethod: "POST",
      callbackPayload: "{}",
      description: job.description,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Heartbeat CreateHeartbeatJob failed (${res.status})${detail ? ": " + detail : ""}`);
  }
  const data = await res.json();
  if (!data || !data.taskUid) throw new Error("Heartbeat CreateHeartbeatJob returned no taskUid");
  return data;
}

async function printTable(connection) {
  const [rows] = await connection.query(
    "SELECT id, jobType, scheduleCronTaskUid, cronExpression, isActive, updatedAt FROM scheduled_job_configs ORDER BY id"
  );
  if (!rows.length) {
    console.log("(جدول scheduled_job_configs فارغ — لا توجد وظائف مسجلة)");
    return;
  }
  console.table(rows.map((r) => ({ ...r, scheduleCronTaskUid: r.scheduleCronTaskUid || "(null)" })));
}

async function main() {
  const listOnly = process.argv.includes("--list");

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

  if (listOnly) {
    await printTable(connection);
    await connection.end();
    return;
  }

  const forgeUrl = readEnv("BUILT_IN_FORGE_API_URL");
  const forgeApiKey = readEnv("BUILT_IN_FORGE_API_KEY");

  if (!forgeUrl || !forgeApiKey) {
    console.error("");
    console.error("================================================================");
    console.error("❌ لا يمكن تسجيل الوظائف المجدولة: خدمة Heartbeat غير مهيأة.");
    console.error("================================================================");
    console.error("يحتاج تسجيل الـ cron إلى متغيري البيئة التاليين (مفقودان حالياً):");
    console.error("  - BUILT_IN_FORGE_API_URL");
    console.error("  - BUILT_IN_FORGE_API_KEY");
    console.error("");
    console.error("هذان المتغيران هما اعتماد خدمة Forge (webdevtoken.v1.WebDevService)");
    console.error("التي تستدعي مسارات /api/scheduled/* حسب الجدولة.");
    console.error("");
    console.error("الحالة الحالية لجدول scheduled_job_configs:");
    await printTable(connection);
    console.error("");
    console.error("أضِف المفتاح والرابط إلى .env.production.local ثم أعد تشغيل هذا السكربت.");
    await connection.end();
    process.exit(1);
  }

  const results = [];
  for (const job of CORE_JOBS) {
    const [rows] = await connection.query(
      "SELECT id, scheduleCronTaskUid FROM scheduled_job_configs WHERE jobType = ?",
      [job.jobType]
    );
    const config = rows[0] || null;
    if (config && config.scheduleCronTaskUid) {
      results.push({ jobType: job.jobType, taskUid: config.scheduleCronTaskUid, created: false });
      continue;
    }

    const heartbeat = await createHeartbeatJob(job, forgeUrl, forgeApiKey);

    if (config) {
      await connection.query(
        "UPDATE scheduled_job_configs SET scheduleCronTaskUid = ?, isActive = 1, updatedAt = NOW() WHERE id = ?",
        [heartbeat.taskUid, config.id]
      );
    } else {
      await connection.query(
        "INSERT INTO scheduled_job_configs (jobType, scheduleCronTaskUid, cronExpression, isActive) VALUES (?, ?, ?, 1)",
        [job.jobType, heartbeat.taskUid, job.cronExpression]
      );
    }
    results.push({ jobType: job.jobType, taskUid: heartbeat.taskUid, created: true });
  }

  console.log("");
  console.log("--- نتيجة التسجيل ---");
  console.table(results);

  console.log("");
  console.log("--- الجدول النهائي ---");
  await printTable(connection);

  await connection.end();
}

main().catch((err) => {
  console.error("فشل: " + redact(err && err.message ? err.message : String(err)));
  process.exit(1);
});


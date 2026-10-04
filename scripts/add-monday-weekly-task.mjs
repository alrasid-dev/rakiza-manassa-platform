// scripts/add-monday-weekly-task.mjs
// إضافة قالب + مهمة أسبوعية (كل يوم إثنين) لـ«جمع اعمال الموظفات عن بعد (فرز الأحكام)».
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function readEnvValue(filePath, key) {
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

const TITLE = "جمع اعمال الموظفات عن بعد (فرز الأحكام)";
const ASSIGNEE_PROFILE_ID = 60121; // نورة القحطاني
const UNIT_ID = 5;
const ADMIN_USER_ID = 1; // مالك المنصة

const rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
const url = new URL(rawUrl);
const conn = await mysql.createConnection({
  host: url.hostname, port: Number(url.port || 4000),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true,
});

// حساب الإثنين القادم (07:00 الرياض = 04:00 UTC؛ الاستحقاق 14:00 الرياض = 11:00 UTC)
const R = 3 * 60 * 60 * 1000; // Riyadh UTC+3
const now = new Date();
const riyadhNow = new Date(now.getTime() + R);
const dow = riyadhNow.getUTCDay(); // 0=الأحد ... 6=السبت
let days = (1 - dow + 7) % 7; // أيام حتى الإثنين
if (dow === 1) days = 7; // إن كان اليوم إثنين → الإثنين القادم
const mondayUtc = new Date(Date.UTC(riyadhNow.getUTCFullYear(), riyadhNow.getUTCMonth(), riyadhNow.getUTCDate() + days, 0, 0, 0));
const scheduledFor = new Date(mondayUtc.getTime() + 4 * 60 * 60 * 1000); // 04:00 UTC = 07:00 الرياض
const dueAt = new Date(mondayUtc.getTime() + 11 * 60 * 60 * 1000);      // 11:00 UTC = 14:00 الرياض

// 1) القالب
const [tpl] = await conn.query(
  "INSERT INTO task_templates (unitId, title, frequency, intervalDays, specificDays, workdayOnly, dueHourLocal, defaultAssigneeProfileId, isActive, createdByUserId, createdAt, updatedAt) VALUES (?, ?, 'specific_days', NULL, ?, 1, 14, ?, 1, ?, NOW(), NOW())",
  [UNIT_ID, TITLE, "[1]", ASSIGNEE_PROFILE_ID, ADMIN_USER_ID]
);
const templateId = Number(tpl.insertId);

// 2) المهمة الأولى
const [task] = await conn.query(
  "INSERT INTO tasks (templateId, unitId, title, status, priority, assigneeProfileId, assignedByUserId, scheduledFor, dueAt, taskType, isOpen, recurrence, specificDays, createdAt, updatedAt) VALUES (?, ?, ?, 'new', 'normal', ?, ?, ?, ?, 'permanent', 0, 'specific_days', '[1]', NOW(), NOW())",
  [templateId, UNIT_ID, TITLE, ASSIGNEE_PROFILE_ID, ADMIN_USER_ID, scheduledFor, dueAt]
);
const taskId = Number(task.insertId);

// 3) تحقق
const [tplCheck] = await conn.query("SELECT id, unitId, title, frequency, specificDays, defaultAssigneeProfileId, isActive, dueHourLocal, createdByUserId FROM task_templates WHERE id = ?", [templateId]);
const [taskCheck] = await conn.query("SELECT id, templateId, title, status, assigneeProfileId, scheduledFor, dueAt, unitId FROM tasks WHERE id = ?", [taskId]);

const fmt = (d) => (d instanceof Date ? d.toISOString().slice(0, 16).replace("T", " ") : String(d));
const L = [];
L.push("## القالب المُنشأ");
L.push(JSON.stringify(tplCheck[0], null, 2));
L.push(`\n## المهمة المُنشأة`);
L.push(`id=${taskCheck[0].id} | templateId=${taskCheck[0].templateId} | status=${taskCheck[0].status} | assignee=${taskCheck[0].assigneeProfileId} | scheduledFor=${fmt(taskCheck[0].scheduledFor)} | dueAt=${fmt(taskCheck[0].dueAt)}`);
L.push(`\nاليوم الحالي (Riyadh dow): ${dow} | أيام حتى الإثنين: ${days} | الإثنين القادم (UTC): ${mondayUtc.toISOString().slice(0, 10)}`);

const outPath = path.resolve("reports", "_monday_task_result_tmp.txt");
fs.writeFileSync(outPath, L.join("\n"), "utf8");
console.log("WROTE:", outPath);
console.log("templateId:", templateId, "taskId:", taskId, "scheduledFor:", scheduledFor.toISOString(), "dueAt:", dueAt.toISOString());
await conn.end();

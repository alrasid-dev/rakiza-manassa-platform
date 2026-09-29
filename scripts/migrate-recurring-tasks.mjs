#!/usr/bin/env node
/**
 * scripts/migrate-recurring-tasks.mjs
 * Migration نظام المهام المتكررة:
 *  - tasks.recurrence: إضافة 'quarterly' إلى enum.
 *  - tasks.sourceTaskId: عمود جديد + فهرس idx_tasks_sourceTaskId.
 *  - task_templates.lastGeneratedAt: عمود جديد.
 *  - tasks.templateId: فهرس idx_tasks_templateId (العمود موجود مسبقاً).
 * الاستخدام: node scripts/migrate-recurring-tasks.mjs
 */
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

const raw = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || process.env.DATABASE_URL;
if (!raw) { console.error("DATABASE_URL غير موجود"); process.exit(1); }
const url = new URL(raw);
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 4000),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
});

const report = { steps: [] };

async function columnExists(table, column) {
  const [rows] = await db.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
    [table, column],
  );
  return rows.length > 0;
}

async function indexExists(table, index) {
  const [rows] = await db.query(
    "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?",
    [table, index],
  );
  return rows.length > 0;
}

// 1) tasks.recurrence: إضافة quarterly
const [colInfo] = await db.query(
  "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='tasks' AND COLUMN_NAME='recurrence'",
);
const columnType = colInfo[0]?.COLUMN_TYPE ?? "";
if (columnType.includes("quarterly")) {
  report.steps.push({ step: "recurrence_enum", status: "skipped", note: "quarterly موجود مسبقاً" });
} else {
  await db.query("ALTER TABLE tasks MODIFY COLUMN recurrence ENUM('none','daily','weekly','monthly','quarterly','custom') NOT NULL DEFAULT 'none'");
  report.steps.push({ step: "recurrence_enum", status: "done" });
}

// 2) tasks.sourceTaskId + فهرس
if (await columnExists("tasks", "sourceTaskId")) {
  report.steps.push({ step: "sourceTaskId", status: "skipped", note: "موجود" });
} else {
  await db.query("ALTER TABLE tasks ADD COLUMN sourceTaskId INT NULL DEFAULT NULL");
  report.steps.push({ step: "sourceTaskId", status: "done" });
}
if (await indexExists("tasks", "idx_tasks_sourceTaskId")) {
  report.steps.push({ step: "idx_tasks_sourceTaskId", status: "skipped", note: "موجود" });
} else {
  await db.query("CREATE INDEX idx_tasks_sourceTaskId ON tasks (sourceTaskId)");
  report.steps.push({ step: "idx_tasks_sourceTaskId", status: "done" });
}

// 3) task_templates.lastGeneratedAt
if (await columnExists("task_templates", "lastGeneratedAt")) {
  report.steps.push({ step: "lastGeneratedAt", status: "skipped", note: "موجود" });
} else {
  await db.query("ALTER TABLE task_templates ADD COLUMN lastGeneratedAt TIMESTAMP NULL DEFAULT NULL");
  report.steps.push({ step: "lastGeneratedAt", status: "done" });
}

// 4) tasks.templateId فهرس (العمود موجود)
const hasTemplateId = await columnExists("tasks", "templateId");
if (hasTemplateId && !(await indexExists("tasks", "idx_tasks_templateId"))) {
  await db.query("CREATE INDEX idx_tasks_templateId ON tasks (templateId)");
  report.steps.push({ step: "idx_tasks_templateId", status: "done" });
} else {
  report.steps.push({ step: "idx_tasks_templateId", status: hasTemplateId ? "skipped" : "n/a", note: hasTemplateId ? "موجود" : "templateId غير موجود" });
}

console.log(JSON.stringify(report, null, 2));
await db.end();

#!/usr/bin/env node
/**
 * scripts/migrate-specific-days.mjs
 * Migration دعم "أيام محددة من الأسبوع" (specific_days):
 *  - task_templates.frequency: إضافة 'specific_days'.
 *  - tasks.recurrence: إضافة 'specific_days'.
 *  - عمود JSON: task_templates.specificDays و tasks.specificDays.
 * الاستخدام: node scripts/migrate-specific-days.mjs
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

async function enumHasValue(table, column, value) {
  const [rows] = await db.query(
    "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
    [table, column],
  );
  const type = rows[0]?.COLUMN_TYPE ?? "";
  return type.includes(`'${value}'`);
}

// 1) task_templates.frequency: add specific_days
if (await enumHasValue("task_templates", "frequency", "specific_days")) {
  report.steps.push({ step: "task_templates.frequency", status: "skipped", note: "specific_days موجود" });
} else {
  await db.query("ALTER TABLE task_templates MODIFY COLUMN frequency ENUM('daily','weekly','monthly','quarterly','yearly','custom','specific_days') NOT NULL DEFAULT 'custom'");
  report.steps.push({ step: "task_templates.frequency", status: "done" });
}

// 2) tasks.recurrence: add specific_days
if (await enumHasValue("tasks", "recurrence", "specific_days")) {
  report.steps.push({ step: "tasks.recurrence", status: "skipped", note: "specific_days موجود" });
} else {
  await db.query("ALTER TABLE tasks MODIFY COLUMN recurrence ENUM('none','daily','weekly','monthly','quarterly','yearly','custom','specific_days') NOT NULL DEFAULT 'none'");
  report.steps.push({ step: "tasks.recurrence", status: "done" });
}

// 3) task_templates.specificDays
if (await columnExists("task_templates", "specificDays")) {
  report.steps.push({ step: "task_templates.specificDays", status: "skipped", note: "موجود" });
} else {
  await db.query("ALTER TABLE task_templates ADD COLUMN specificDays JSON NULL DEFAULT NULL");
  report.steps.push({ step: "task_templates.specificDays", status: "done" });
}

// 4) tasks.specificDays
if (await columnExists("tasks", "specificDays")) {
  report.steps.push({ step: "tasks.specificDays", status: "skipped", note: "موجود" });
} else {
  await db.query("ALTER TABLE tasks ADD COLUMN specificDays JSON NULL DEFAULT NULL");
  report.steps.push({ step: "tasks.specificDays", status: "done" });
}

console.log(JSON.stringify(report, null, 2));
await db.end();

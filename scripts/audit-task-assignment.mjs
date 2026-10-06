// scripts/audit-task-assignment.mjs — فحص صحة إسناد المهام (قراءة فقط).
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function env(key) {
  for (const line of fs.readFileSync(".env.production.local", "utf8").split(/\r?\n/)) {
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
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true, bigNumberStrings: true,
  timezone: "Z",
});

// المهام النشطة + المُسند + القسم + القالب.
const [tasks] = await db.query(`
  SELECT t.id, t.title, t.status, t.scheduledFor, t.createdAt,
         t.assigneeProfileId, t.unitId AS taskUnitId, t.templateId,
         p.fullName AS assigneeName, p.status AS assigneeStatus, p.unitId AS assigneeUnitId, p.personType,
         u.name AS taskUnitName, pu.name AS assigneeUnitName,
         tt.unitId AS templateUnitId, tt.defaultAssigneeProfileId AS templateDefaultAssignee
  FROM tasks t
  LEFT JOIN person_profiles p ON p.id = t.assigneeProfileId
  LEFT JOIN organization_units u ON u.id = t.unitId
  LEFT JOIN organization_units pu ON pu.id = p.unitId
  LEFT JOIN task_templates tt ON tt.id = t.templateId
  WHERE t.status IN ('new','in_progress','overdue','under_review') AND t.archivedAt IS NULL
  ORDER BY t.assigneeProfileId, t.scheduledFor
`);

const flags = [];
const rows = [];
for (const t of tasks) {
  const issues = [];
  const source = t.templateId ? "template" : "manual";
  // (أ) مُسند غير فعّال
  if (t.assigneeProfileId == null) issues.push("بلا مُسند");
  else if (t.assigneeStatus !== "active") issues.push(`مُسند ${t.assigneeStatus}`);
  // (ب) مُسند خارج القسم
  if (t.taskUnitId != null && t.assigneeUnitId != null && t.taskUnitId !== t.assigneeUnitId) issues.push("خارج القسم");
  // (ج) وراثة القالب: قالب قسم X لكن المُسند قسم Y
  if (t.templateId && t.templateUnitId != null && t.assigneeUnitId != null && t.templateUnitId !== t.assigneeUnitId) issues.push("قالب قسم مختلف");
  // (د) القالب له defaultAssignee مختلف
  if (t.templateId && t.templateDefaultAssignee != null && t.assigneeProfileId != null && t.templateDefaultAssignee !== t.assigneeProfileId) issues.push("مُسند ≠ defaultAssignee القالب");
  // (هـ) مُسند لقيادة/مدير
  if (t.personType === "judge") issues.push("مُسند لقاضٍ");

  rows.push({ id: t.id, title: t.title, status: t.status, scheduledFor: t.scheduledFor, assigneeProfileId: t.assigneeProfileId, assigneeName: t.assigneeName, assigneeStatus: t.assigneeStatus, assigneeUnitId: t.assigneeUnitId, assigneeUnitName: t.assigneeUnitName, taskUnitId: t.taskUnitId, taskUnitName: t.taskUnitName, templateId: t.templateId, templateUnitId: t.templateUnitId, source, issues: issues.join("; ") || "" });
}

// (و) تكرار: نفس title + scheduledFor لمُسندَين مختلفين.
const dupKey = {};
for (const t of tasks) {
  const key = `${t.title}|${t.scheduledFor?.toISOString?.() ?? t.scheduledFor}`;
  (dupKey[key] = dupKey[key] || []).push(t.assigneeProfileId);
}
const dup = Object.entries(dupKey).filter(([, ids]) => new Set(ids.filter(Boolean)).size > 1);

console.log("=== ملخص ===");
console.log("إجمالي المهام النشطة:", tasks.length);
console.log("مهام بلا مُسند:", rows.filter(r => r.assigneeProfileId == null).length);
console.log("مهام لمُسند غير فعّال:", rows.filter(r => r.issues.includes("مُسند ") && r.assigneeStatus !== "active").length);
console.log("مهام خارج القسم:", rows.filter(r => r.issues.includes("خارج القسم")).length);
console.log("مهام قالب قسم مختلف:", rows.filter(r => r.issues.includes("قالب قسم مختلف")).length);
console.log("مهام مُسند ≠ defaultAssignee:", rows.filter(r => r.issues.includes("مُسند ≠ defaultAssignee القالب")).length);
console.log("مهام مكررة (title+scheduledFor لمُسندين):", dup.length);

console.log("\n=== جدول المهام (بها مشاكل فقط) ===");
console.log(["taskId", "title", "status", "assignee", "assigneeStatus", "assigneeUnit", "taskUnit", "source", "issues"].join("\t"));
for (const r of rows.filter(r => r.issues)) {
  console.log([r.id, (r.title || "").slice(0, 35), r.status, `${r.assigneeProfileId}:${(r.assigneeName || "").slice(0, 12)}`, r.assigneeStatus, r.assigneeUnitName, r.taskUnitName, r.source, r.issues].join("\t"));
}

// === حفظ CSV ===
const dateStr = new Date().toISOString().slice(0, 10);
const dir = path.resolve("reports");
fs.mkdirSync(dir, { recursive: true });
const header = "taskId,title,status,assigneeProfileId,assigneeName,assigneeStatus,assigneeUnitId,assigneeUnitName,taskUnitId,taskUnitName,templateId,templateUnitId,source,issues";
const csv = [header];
for (const r of rows) {
  csv.push([r.id, `"${(r.title || "").replace(/"/g, '""')}"`, r.status, r.assigneeProfileId, `"${(r.assigneeName || "").replace(/"/g, '""')}"`, r.assigneeStatus, r.assigneeUnitId, `"${(r.assigneeUnitName || "").replace(/"/g, '""')}"`, r.taskUnitId, `"${(r.taskUnitName || "").replace(/"/g, '""')}"`, r.templateId, r.templateUnitId, r.source, `"${r.issues}"`].join(","));
}
const csvPath = path.join(dir, `task-assignment-audit-${dateStr}.csv`);
fs.writeFileSync(csvPath, csv.join("\n") + "\n", "utf8");
console.log(`\nحُفظ التقرير: ${csvPath}`);

await db.end();

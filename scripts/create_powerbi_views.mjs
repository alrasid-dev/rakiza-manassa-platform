// إنشاء SQL Views جاهزة للاتصال بـ Power BI.
// آمن (idempotent): DROP VIEW IF EXISTS ثم CREATE VIEW.
// لا يلمس أي بيانات — يضيف Views فقط.
// التشغيل:  node scripts/_create_powerbi_views.mjs
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

const raw =
  readEnv(path.resolve(".env.production.local"), "DATABASE_URL") ||
  readEnv(path.resolve(".env.local"), "DATABASE_URL") ||
  readEnv(path.resolve(".env"), "DATABASE_URL") ||
  process.env.DATABASE_URL;

if (!raw) {
  console.error("لم يتم العثور على DATABASE_URL");
  process.exit(1);
}

const url = new URL(raw);
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 4000),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  timezone: "Z",
});

// ملاحظة: جميع الطوابع الزمنية مخزّنة بصيغة UTC.
// تجميع «اليوم» في daily_flow يعتمد اليوم السعودي (UTC+3).
const views = [
  {
    name: "v_powerbi_kpi",
    sql: `CREATE VIEW v_powerbi_kpi AS
SELECT
  (SELECT COUNT(*) FROM tasks) AS total_tasks,
  (SELECT COUNT(*) FROM tasks WHERE status = 'new') AS new_tasks,
  (SELECT COUNT(*) FROM tasks WHERE status = 'in_progress') AS in_progress_tasks,
  (SELECT COUNT(*) FROM tasks WHERE status = 'under_review') AS under_review_tasks,
  (SELECT COUNT(*) FROM tasks WHERE status = 'completed') AS completed_tasks,
  (SELECT COUNT(*) FROM tasks WHERE status = 'overdue') AS overdue_tasks,
  (SELECT COUNT(*) FROM tasks WHERE status = 'cancelled') AS cancelled_tasks,
  (SELECT COUNT(*) FROM person_profiles WHERE archivedAt IS NULL) AS total_employees,
  (SELECT COUNT(*) FROM person_profiles WHERE status = 'active' AND archivedAt IS NULL) AS active_employees,
  (SELECT COUNT(*) FROM organization_units WHERE isActive = 1) AS active_units,
  (SELECT COUNT(*) FROM attendance_records WHERE status = 'present') AS present_records,
  (SELECT COUNT(*) FROM attendance_records WHERE status = 'late') AS late_records,
  (SELECT COUNT(*) FROM attendance_records WHERE status = 'absent') AS absent_records,
  (SELECT COUNT(*) FROM leave_requests WHERE status = 'approved') AS approved_leaves,
  (SELECT COUNT(*) FROM leave_requests WHERE status = 'pending') AS pending_leaves,
  (SELECT COUNT(*) FROM approval_requests WHERE entityType = 'disciplinary_action' AND status = 'pending') AS pending_disciplinary,
  (SELECT COUNT(*) FROM notifications WHERE isRead = 0) AS unread_notifications`,
  },
  {
    name: "v_powerbi_tasks",
    sql: `CREATE VIEW v_powerbi_tasks AS
SELECT
  t.id AS task_id,
  t.title,
  t.status,
  t.priority,
  t.taskType AS task_type,
  t.isOpen AS is_open,
  t.isPinned AS is_pinned,
  t.isConfidential AS is_confidential,
  t.unitId AS unit_id,
  ou.name AS unit_name,
  t.assigneeProfileId AS assignee_id,
  pp.fullName AS assignee_name,
  t.assignedByUserId AS assigned_by_user_id,
  t.scheduledFor AS scheduled_for,
  t.startedAt AS started_at,
  t.dueAt AS due_at,
  t.completedAt AS completed_at,
  t.recurrence,
  t.hasObstacle AS has_obstacle,
  t.templateId AS template_id,
  t.archivedAt AS archived_at,
  t.createdAt AS created_at,
  t.updatedAt AS updated_at
FROM tasks t
LEFT JOIN organization_units ou ON ou.id = t.unitId
LEFT JOIN person_profiles pp ON pp.id = t.assigneeProfileId`,
  },
  {
    name: "v_powerbi_attendance",
    sql: `CREATE VIEW v_powerbi_attendance AS
SELECT
  a.id AS attendance_id,
  a.profileId AS profile_id,
  pp.fullName AS profile_name,
  pp.unitId AS unit_id,
  ou.name AS unit_name,
  a.recordDate AS record_date,
  a.checkInAt AS check_in_at,
  a.checkOutAt AS check_out_at,
  a.status,
  a.penaltyMinutes AS penalty_minutes,
  a.negativeMinutes AS negative_minutes,
  a.positiveMinutes AS positive_minutes,
  a.excuseApplied AS excuse_applied,
  a.note,
  a.createdAt AS created_at
FROM attendance_records a
LEFT JOIN person_profiles pp ON pp.id = a.profileId
LEFT JOIN organization_units ou ON ou.id = pp.unitId`,
  },
  {
    name: "v_powerbi_leaves",
    sql: `CREATE VIEW v_powerbi_leaves AS
SELECT
  l.id AS leave_id,
  l.profileId AS profile_id,
  pp.fullName AS profile_name,
  pp.unitId AS unit_id,
  ou.name AS unit_name,
  l.requestType AS request_type,
  l.startAt AS start_at,
  l.endAt AS end_at,
  l.durationMinutes AS duration_minutes,
  l.status,
  l.hijriMonthKey AS hijri_month_key,
  l.handoverConfirmed AS handover_confirmed,
  l.substituteProfileId AS substitute_profile_id,
  sub.fullName AS substitute_name,
  l.requestedByUserId AS requested_by_user_id,
  l.reviewedAt AS reviewed_at,
  l.createdAt AS created_at
FROM leave_requests l
LEFT JOIN person_profiles pp ON pp.id = l.profileId
LEFT JOIN organization_units ou ON ou.id = pp.unitId
LEFT JOIN person_profiles sub ON sub.id = l.substituteProfileId`,
  },
  {
    name: "v_powerbi_employees",
    sql: `CREATE VIEW v_powerbi_employees AS
SELECT
  p.id AS employee_id,
  p.fullName AS full_name,
  p.email,
  p.phone,
  p.employeeNumber AS employee_number,
  p.jobTitle AS job_title,
  p.personType AS person_type,
  p.attendanceMode AS attendance_mode,
  p.status,
  p.activityState AS activity_state,
  p.unitId AS unit_id,
  ou.name AS unit_name,
  p.directManagerProfileId AS manager_id,
  m.fullName AS manager_name,
  p.createdAt AS created_at
FROM person_profiles p
LEFT JOIN organization_units ou ON ou.id = p.unitId
LEFT JOIN person_profiles m ON m.id = p.directManagerProfileId
WHERE p.archivedAt IS NULL`,
  },
  {
    name: "v_powerbi_units",
    sql: `CREATE VIEW v_powerbi_units AS
SELECT
  ou.id AS unit_id,
  ou.name,
  ou.code,
  ou.parentId AS parent_id,
  parent.name AS parent_name,
  ou.isActive AS is_active,
  (SELECT COUNT(*) FROM person_profiles p WHERE p.unitId = ou.id AND p.archivedAt IS NULL) AS employee_count,
  ou.createdAt AS created_at
FROM organization_units ou
LEFT JOIN organization_units parent ON parent.id = ou.parentId`,
  },
  {
    name: "v_powerbi_daily_flow",
    sql: `CREATE VIEW v_powerbi_daily_flow AS
SELECT
  dates.d AS flow_date,
  COALESCE(t.tasks_created, 0) AS tasks_created,
  COALESCE(t.tasks_completed, 0) AS tasks_completed,
  COALESCE(a.attendance_records, 0) AS attendance_records,
  COALESCE(a.present_count, 0) AS present_count,
  COALESCE(a.late_count, 0) AS late_count,
  COALESCE(a.absent_count, 0) AS absent_count,
  COALESCE(a.on_leave_count, 0) AS on_leave_count,
  COALESCE(l.leaves_requested, 0) AS leaves_requested,
  COALESCE(l.leaves_approved, 0) AS leaves_approved
FROM (
  SELECT DATE(DATE_ADD(scheduledFor, INTERVAL 3 HOUR)) AS d FROM tasks
  UNION
  SELECT DATE(DATE_ADD(recordDate, INTERVAL 3 HOUR)) AS d FROM attendance_records
  UNION
  SELECT DATE(DATE_ADD(startAt, INTERVAL 3 HOUR)) AS d FROM leave_requests
) dates
LEFT JOIN (
  SELECT DATE(DATE_ADD(scheduledFor, INTERVAL 3 HOUR)) AS d,
    COUNT(*) AS tasks_created,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS tasks_completed
  FROM tasks GROUP BY DATE(DATE_ADD(scheduledFor, INTERVAL 3 HOUR))
) t ON t.d = dates.d
LEFT JOIN (
  SELECT DATE(DATE_ADD(recordDate, INTERVAL 3 HOUR)) AS d,
    COUNT(*) AS attendance_records,
    SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_count,
    SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late_count,
    SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
    SUM(CASE WHEN status = 'on_leave' THEN 1 ELSE 0 END) AS on_leave_count
  FROM attendance_records GROUP BY DATE(DATE_ADD(recordDate, INTERVAL 3 HOUR))
) a ON a.d = dates.d
LEFT JOIN (
  SELECT DATE(DATE_ADD(startAt, INTERVAL 3 HOUR)) AS d,
    COUNT(*) AS leaves_requested,
    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS leaves_approved
  FROM leave_requests GROUP BY DATE(DATE_ADD(startAt, INTERVAL 3 HOUR))
) l ON l.d = dates.d`,
  },
  {
    name: "v_powerbi_overdue",
    sql: `CREATE VIEW v_powerbi_overdue AS
SELECT
  t.id AS task_id,
  t.title,
  t.status,
  t.priority,
  t.unitId AS unit_id,
  ou.name AS unit_name,
  t.assigneeProfileId AS assignee_id,
  pp.fullName AS assignee_name,
  t.scheduledFor AS scheduled_for,
  t.dueAt AS due_at,
  TIMESTAMPDIFF(HOUR, t.dueAt, UTC_TIMESTAMP()) AS overdue_hours,
  t.createdAt AS created_at
FROM tasks t
LEFT JOIN organization_units ou ON ou.id = t.unitId
LEFT JOIN person_profiles pp ON pp.id = t.assigneeProfileId
WHERE t.status = 'overdue' AND t.archivedAt IS NULL`,
  },
  {
    name: "v_powerbi_unit_summary",
    sql: `CREATE VIEW v_powerbi_unit_summary AS
SELECT
  ou.id AS unit_id,
  ou.name AS unit_name,
  ou.code AS unit_code,
  (SELECT COUNT(*) FROM person_profiles p WHERE p.unitId = ou.id AND p.archivedAt IS NULL) AS employee_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.unitId = ou.id AND t.archivedAt IS NULL) AS total_tasks,
  (SELECT COUNT(*) FROM tasks t WHERE t.unitId = ou.id AND t.status = 'new' AND t.archivedAt IS NULL) AS new_tasks,
  (SELECT COUNT(*) FROM tasks t WHERE t.unitId = ou.id AND t.status = 'in_progress' AND t.archivedAt IS NULL) AS in_progress_tasks,
  (SELECT COUNT(*) FROM tasks t WHERE t.unitId = ou.id AND t.status = 'completed' AND t.archivedAt IS NULL) AS completed_tasks,
  (SELECT COUNT(*) FROM tasks t WHERE t.unitId = ou.id AND t.status = 'overdue' AND t.archivedAt IS NULL) AS overdue_tasks,
  (SELECT COUNT(*) FROM task_templates tt WHERE tt.unitId = ou.id AND tt.isActive = 1) AS active_templates,
  (SELECT COUNT(*) FROM attendance_records a JOIN person_profiles p2 ON p2.id = a.profileId WHERE p2.unitId = ou.id AND a.status = 'present') AS present_records,
  (SELECT COUNT(*) FROM attendance_records a JOIN person_profiles p2 ON p2.id = a.profileId WHERE p2.unitId = ou.id AND a.status = 'late') AS late_records,
  (SELECT COUNT(*) FROM attendance_records a JOIN person_profiles p2 ON p2.id = a.profileId WHERE p2.unitId = ou.id AND a.status = 'absent') AS absent_records
FROM organization_units ou
WHERE ou.isActive = 1`,
  },
];

let created = 0;
for (const v of views) {
  await db.query(`DROP VIEW IF EXISTS ${v.name}`);
  await db.query(v.sql);
  created += 1;
  console.log(`✓ created: ${v.name}`);
}

const [rows] = await db.query("SELECT TABLE_NAME FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'v_powerbi_%' ORDER BY TABLE_NAME");
console.log(`\nتم إنشاء ${created} View بنجاح.`);
console.log("Views المتاحة:", rows.map((r) => r.TABLE_NAME).join(", "));

await db.end();



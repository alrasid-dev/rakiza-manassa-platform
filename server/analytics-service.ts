import { sql } from "drizzle-orm";
import { getDb } from "./db";

// نطاق فلترة الأقسام: null = كل الأقسام، number[] = أقسام محددة (مدير قسم).
export type AnalyticsUnitScope = number[] | null;

function unitClause(unitIds: AnalyticsUnitScope, column: string): ReturnType<typeof sql> {
  if (!unitIds || unitIds.length === 0) return sql``;
  const list = unitIds.map(n => String(n)).join(", ");
  return sql` AND ${sql.raw(column)} IN (${sql.raw(list)})`;
}

function rangeClause(from: Date | null, to: Date | null, column: string): ReturnType<typeof sql> {
  if (from && to) return sql` AND ${sql.raw(column)} >= ${from} AND ${sql.raw(column)} <= ${to}`;
  if (from) return sql` AND ${sql.raw(column)} >= ${from}`;
  if (to) return sql` AND ${sql.raw(column)} <= ${to}`;
  return sql``;
}

async function queryRows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(query);
  const rows = Array.isArray(result) ? result[0] : (result as { rows?: unknown[] }).rows;
  return (rows ?? []) as T[];
}

export interface AnalyticsKpis {
  activeUnits: number;
  activeEmployees: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  completionRate: number;
  attendanceRate: number;
  approvedLeaves: number;
  pendingDisciplinary: number;
  automationRate: number;
}

export async function getAnalyticsKpis(input: { from: Date | null; to: Date | null; unitIds: AnalyticsUnitScope }): Promise<AnalyticsKpis> {
  const taskUnit = unitClause(input.unitIds, "t.unitId");
  const empUnit = unitClause(input.unitIds, "p.unitId");
  const taskDate = rangeClause(input.from, input.to, "t.scheduledFor");
  const attDate = rangeClause(input.from, input.to, "a.recordDate");
  const leaveDate = rangeClause(input.from, input.to, "l.startAt");

  const rows = await queryRows<Record<string, unknown>>(sql`
    SELECT
      (SELECT COUNT(*) FROM organization_units WHERE isActive = 1) AS active_units,
      (SELECT COUNT(*) FROM person_profiles p WHERE p.status = 'active' AND p.archivedAt IS NULL ${empUnit}) AS active_employees,
      (SELECT COUNT(*) FROM tasks t WHERE 1=1 ${taskDate} ${taskUnit}) AS total_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.status = 'completed' ${taskDate} ${taskUnit}) AS completed_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.status = 'overdue' ${taskDate} ${taskUnit}) AS overdue_tasks,
      (SELECT COUNT(*) FROM attendance_records a JOIN person_profiles p ON p.id = a.profileId WHERE 1=1 ${attDate} ${empUnit}) AS attendance_total,
      (SELECT COUNT(*) FROM attendance_records a JOIN person_profiles p ON p.id = a.profileId WHERE a.status = 'present' ${attDate} ${empUnit}) AS attendance_present,
      (SELECT COUNT(*) FROM leave_requests l JOIN person_profiles p ON p.id = l.profileId WHERE l.status = 'approved' ${leaveDate} ${empUnit}) AS approved_leaves,
      (SELECT COUNT(*) FROM approval_requests ar JOIN person_profiles p ON p.id = ar.entityId WHERE ar.entityType = 'disciplinary_action' AND ar.status = 'pending' ${rangeClause(input.from, input.to, "ar.createdAt")} ${empUnit}) AS pending_disciplinary,
      (SELECT COUNT(*) FROM tasks t WHERE t.templateId IS NOT NULL ${taskDate} ${taskUnit}) AS automated_tasks
  `);

  const r = rows[0] ?? {};
  const totalTasks = Number(r.total_tasks ?? 0);
  const completedTasks = Number(r.completed_tasks ?? 0);
  const attendanceTotal = Number(r.attendance_total ?? 0);
  const attendancePresent = Number(r.attendance_present ?? 0);

  return {
    activeUnits: Number(r.active_units ?? 0),
    activeEmployees: Number(r.active_employees ?? 0),
    totalTasks,
    completedTasks,
    overdueTasks: Number(r.overdue_tasks ?? 0),
    completionRate: totalTasks ? completedTasks / totalTasks : 0,
    attendanceRate: attendanceTotal ? attendancePresent / attendanceTotal : 0,
    approvedLeaves: Number(r.approved_leaves ?? 0),
    pendingDisciplinary: Number(r.pending_disciplinary ?? 0),
    automationRate: totalTasks ? Number(r.automated_tasks ?? 0) / totalTasks : 0,
  };
}

export interface DailyFlowPoint {
  date: string;
  tasksCreated: number;
  tasksCompleted: number;
  present: number;
  late: number;
  absent: number;
}

export async function getAnalyticsDailyFlow(input: { from: Date; to: Date; unitIds: AnalyticsUnitScope }): Promise<DailyFlowPoint[]> {
  const taskUnit = unitClause(input.unitIds, "t.unitId");
  const empUnit = unitClause(input.unitIds, "p.unitId");

  const taskRows = await queryRows<{ d: string; tasks_created: number; tasks_completed: number }>(sql`
    SELECT DATE(DATE_ADD(t.scheduledFor, INTERVAL 3 HOUR)) AS d,
      COUNT(*) AS tasks_created,
      SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS tasks_completed
    FROM tasks t
    WHERE t.scheduledFor >= ${input.from} AND t.scheduledFor <= ${input.to} ${taskUnit}
    GROUP BY d ORDER BY d
  `);

  const attRows = await queryRows<{ d: string; present: number; late: number; absent: number }>(sql`
    SELECT DATE(DATE_ADD(a.recordDate, INTERVAL 3 HOUR)) AS d,
      SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late,
      SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent
    FROM attendance_records a JOIN person_profiles p ON p.id = a.profileId
    WHERE a.recordDate >= ${input.from} AND a.recordDate <= ${input.to} ${empUnit}
    GROUP BY d ORDER BY d
  `);

  const byDate = new Map<string, DailyFlowPoint>();
  for (const row of taskRows) {
    byDate.set(row.d, { date: row.d, tasksCreated: Number(row.tasks_created ?? 0), tasksCompleted: Number(row.tasks_completed ?? 0), present: 0, late: 0, absent: 0 });
  }
  for (const row of attRows) {
    const existing = byDate.get(row.d);
    if (existing) { existing.present = Number(row.present ?? 0); existing.late = Number(row.late ?? 0); existing.absent = Number(row.absent ?? 0); }
    else byDate.set(row.d, { date: row.d, tasksCreated: 0, tasksCompleted: 0, present: Number(row.present ?? 0), late: Number(row.late ?? 0), absent: Number(row.absent ?? 0) });
  }
  return Array.from(byDate.values());
}

export async function getAnalyticsTasksByUnit(): Promise<Array<{ unitName: string; taskCount: number }>> {
  const rows = await queryRows<{ unit_name: string; task_count: number }>(sql`
    SELECT COALESCE(ou.name, 'بدون قسم') AS unit_name, COUNT(*) AS task_count
    FROM tasks t
    LEFT JOIN organization_units ou ON ou.id = t.unitId
    WHERE t.archivedAt IS NULL
    GROUP BY ou.name
    ORDER BY task_count DESC
    LIMIT 10
  `);
  return rows.map(r => ({ unitName: r.unit_name, taskCount: Number(r.task_count ?? 0) }));
}

export async function getAnalyticsLeavesByStatus(): Promise<Array<{ status: string; count: number }>> {
  const rows = await queryRows<{ status: string; count: number }>(sql`
    SELECT status, COUNT(*) AS count FROM leave_requests GROUP BY status ORDER BY count DESC
  `);
  return rows.map(r => ({ status: r.status, count: Number(r.count ?? 0) }));
}


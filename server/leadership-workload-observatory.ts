export type WorkloadTaskSnapshot = {
  id: number;
  unitId: number | null;
  assigneeProfileId: number | null;
  status: "new" | "in_progress" | "under_review" | "overdue" | "completed" | "cancelled" | "paused";
  priority: "normal" | "high" | "critical";
  dueAt: Date | null;
};

export type WorkloadUnitSnapshot = { id: number; name: string; isActive: boolean };
export type WorkloadProfileSnapshot = { id: number; fullName: string; unitId: number | null; status: "active" | "inactive" | "suspended"; onLeave?: boolean };
export type PressureLevel = "high" | "medium" | "low" | "none";

const OPEN_STATUSES = new Set<WorkloadTaskSnapshot["status"]>(["new", "in_progress", "under_review", "overdue"]);

function pressureLevel(score: number, openTasks: number): PressureLevel {
  if (!openTasks) return "none";
  if (score >= 70) return "high";
  if (score >= 35) return "medium";
  return "low";
}

/**
 * لا يحاول هذا المحرك تقدير كفاءة بشرية أو تنفيذ قرار. هو يحسب فقط مؤشرات
 * قابلة للتتبع من العبء المفتوح والمواعيد والقوة العاملة الظاهرة في البيانات.
 */
export function buildLeadershipWorkloadObservatory(input: { now: Date; units: WorkloadUnitSnapshot[]; profiles: WorkloadProfileSnapshot[]; tasks: WorkloadTaskSnapshot[] }) {
  const activeUnits = input.units.filter(unit => unit.isActive);
  const activeProfiles = input.profiles.filter(profile => profile.status === "active" && !profile.onLeave && profile.unitId != null);
  const profilesByUnit = new Map<number, WorkloadProfileSnapshot[]>();
  for (const profile of activeProfiles) profilesByUnit.set(profile.unitId!, [...(profilesByUnit.get(profile.unitId!) ?? []), profile]);
  const profileById = new Map(activeProfiles.map(profile => [profile.id, profile]));
  const assignedOpen = new Map<number, number>();
  const unitRows = activeUnits.map(unit => {
    const unitTasks = input.tasks.filter(task => task.unitId === unit.id && OPEN_STATUSES.has(task.status));
    const assigned = unitTasks.filter(task => task.assigneeProfileId && profileById.has(task.assigneeProfileId));
    const overdueTasks = unitTasks.filter(task => task.status === "overdue");
    const dueSoonTasks = unitTasks.filter(task => Boolean(task.dueAt && task.dueAt >= input.now && task.dueAt.getTime() - input.now.getTime() <= 48 * 60 * 60 * 1000));
    const highPriorityTasks = unitTasks.filter(task => task.priority === "high" || task.priority === "critical");
    for (const task of assigned) assignedOpen.set(task.assigneeProfileId!, (assignedOpen.get(task.assigneeProfileId!) ?? 0) + 1);
    const activeStaffCount = (profilesByUnit.get(unit.id) ?? []).length;
    const unassignedTasks = unitTasks.length - assigned.length;
    const weightedLoad = unitTasks.length + overdueTasks.length * 2 + dueSoonTasks.length + highPriorityTasks.length + unassignedTasks * 2;
    const pressureScore = Math.min(100, Math.round((weightedLoad / Math.max(activeStaffCount, 1)) * 20));
    return { unitId: unit.id, unitName: unit.name, activeStaffCount, openTasks: unitTasks.length, overdueTasks: overdueTasks.length, dueSoonTasks: dueSoonTasks.length, highPriorityTasks: highPriorityTasks.length, unassignedTasks, weightedLoad, pressureScore, pressureLevel: pressureLevel(pressureScore, unitTasks.length) };
  });
  const staff = activeProfiles.map(profile => {
    const unit = unitRows.find(item => item.unitId === profile.unitId);
    const openTasks = assignedOpen.get(profile.id) ?? 0;
    return { profileId: profile.id, fullName: profile.fullName, unitId: profile.unitId!, unitName: unit?.unitName ?? "وحدة غير محددة", openTasks, sourceUnitPressureScore: unit?.pressureScore ?? 0, sourceUnitPressureLevel: unit?.pressureLevel ?? "none" };
  }).sort((a, b) => a.openTasks - b.openTasks || a.fullName.localeCompare(b.fullName, "ar"));
  const candidates = staff.filter(member => member.openTasks <= 1 && member.sourceUnitPressureScore < 35 && (unitRows.find(unit => unit.unitId === member.unitId)?.activeStaffCount ?? 0) > 1);
  const usedCandidates = new Set<number>();
  const recommendations = unitRows.filter(unit => unit.pressureLevel === "high").sort((a, b) => b.pressureScore - a.pressureScore).flatMap(target => {
    const selected = candidates.filter(candidate => candidate.unitId !== target.unitId && !usedCandidates.has(candidate.profileId)).slice(0, Math.min(2, Math.max(1, Math.ceil(target.overdueTasks / 3))));
    selected.forEach(candidate => usedCandidates.add(candidate.profileId));
    return selected.map(candidate => ({
      type: "temporary_assignment" as const,
      profileId: candidate.profileId,
      profileName: candidate.fullName,
      sourceUnitId: candidate.unitId,
      sourceUnitName: candidate.unitName,
      targetUnitId: target.unitId,
      targetUnitName: target.unitName,
      reason: `ضغط ${target.pressureScore}/100: ${target.openTasks} مهمة مفتوحة، منها ${target.overdueTasks} متأخرة و${target.dueSoonTasks} قريبة الاستحقاق، مقابل ${target.activeStaffCount} موظف متاح. المرشح لديه ${candidate.openTasks} مهمة مفتوحة ووحدة منشئه عند ضغط ${candidate.sourceUnitPressureScore}/100.`,
      requiresHumanApproval: true,
      action: "review_only" as const,
    }));
  });
  const totals = unitRows.reduce((accumulator, unit) => ({ activeStaff: accumulator.activeStaff + unit.activeStaffCount, openTasks: accumulator.openTasks + unit.openTasks, overdueTasks: accumulator.overdueTasks + unit.overdueTasks, dueSoonTasks: accumulator.dueSoonTasks + unit.dueSoonTasks, highPressureUnits: accumulator.highPressureUnits + Number(unit.pressureLevel === "high") }), { activeStaff: 0, openTasks: 0, overdueTasks: 0, dueSoonTasks: 0, highPressureUnits: 0 });
  return { generatedAt: input.now, totals, units: unitRows.sort((a, b) => b.pressureScore - a.pressureScore || b.overdueTasks - a.overdueTasks || a.unitName.localeCompare(b.unitName, "ar")), staff, recommendations };
}

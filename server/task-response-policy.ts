export function taskAssignmentNotification(taskId: number, title: string) {
  return {
    dedupeKey: `direct-task-assigned-${taskId}`,
    title: "تم إسناد مهمة جديدة",
    body: `تم إسناد المهمة: ${title}. افتح المهام لتأكيد المعالجة أو إضافة تعليق وإحالته للمدير.`,
  };
}

export function taskCopyNotification(taskId: number, title: string, traineeProfileId: number) {
  return {
    dedupeKey: `task-copy-${taskId}-${traineeProfileId}`,
    title: "نسخة تنبيه على مهمة تشغيلية",
    body: `تمت إضافتك نسخة تنبيه على المهمة: ${title}. لا يعني ذلك تكليفك بالمهمة، ويفتح مركز المهام تفاصيلها ضمن نطاق اطلاعك.`,
  };
}

export function taskAssignmentNotifications(input: { taskId: number; title: string; assigneeProfileId?: number; traineeCopyProfileId?: number }) {
  const notifications: Array<{ profileId: number; category: "task_due"; title: string; body: string; dedupeKey: string }> = [];
  if (input.assigneeProfileId) {
    notifications.push({ profileId: input.assigneeProfileId, category: "task_due", ...taskAssignmentNotification(input.taskId, input.title) });
  }
  if (input.traineeCopyProfileId && input.traineeCopyProfileId !== input.assigneeProfileId) {
    notifications.push({ profileId: input.traineeCopyProfileId, category: "task_due", ...taskCopyNotification(input.taskId, input.title, input.traineeCopyProfileId) });
  }
  return notifications;
}

export function completedTaskTransition() {
  return { status: "under_review" as const, updateType: "submitted" as const, note: "تمت المعالجة بانتظار مراجعة المدير" };
}

export const TASK_START_DEADLINE_HOURS = 2;
export const TASK_REVIEW_DEADLINE_HOURS = 24;

/** مهلة بدء المهمة (من وقت الإسناد/الاستحقاق). */
export function taskStartDeadline(scheduledFor: Date): Date {
  return new Date(scheduledFor.getTime() + TASK_START_DEADLINE_HOURS * 60 * 60 * 1000);
}

/** مهلة مراجعة المهمة المقدمة (من وقت الرفع للمراجعة). */
export function taskReviewDeadline(submittedAt: Date): Date {
  return new Date(submittedAt.getTime() + TASK_REVIEW_DEADLINE_HOURS * 60 * 60 * 1000);
}

/** نوع تنبيه المهمة قبل الموعد. */
export type TaskNudgeKind = "none" | "24h" | "12h" | "1h";

/** يحدد أقرب تنبيه قبل موعد استحقاق المهمة (24/12/1 ساعة). */
export function taskDueNudgeKind(dueAt: Date, now: Date): TaskNudgeKind {
  const diff = dueAt.getTime() - now.getTime();
  if (diff <= 0) return "none";
  const hours = diff / 36e5;
  if (hours <= 1) return "1h";
  if (hours <= 12) return "12h";
  if (hours <= 24) return "24h";
  return "none";
}

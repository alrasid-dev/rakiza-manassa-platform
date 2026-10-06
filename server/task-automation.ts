import { isOfficialHoliday } from "./holidays";

export type TaskFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom" | "specific_days";

// ============================================================================
// سياسة دورة حياة المهمة (المرجع الموحّد لحساب ساعات العمل)
// يوم العمل = 7.5 ساعة = 450 دقيقة: 07:00 → 14:15 (435 دقيقة) + 15 دقيقة مهلة خروج.
// ============================================================================

/** بداية يوم العمل التشغيلي (07:00 بتوقيت الرياض). */
export const WORK_DAY_START_MINUTES = 420;
/** نهاية يوم العمل الفعلي (14:15) + 15 دقيقة مهلة خروج = 14:30. */
export const WORK_DAY_END_MINUTES = 870;
/** عدد دقائق العمل في اليوم التشغيلي = 450 (7.5 ساعة). */
export const WORK_DAY_MINUTES = 450;
/** عند تراكم 450 دقيقة عمل (7.5 ساعة) → تنبيه (بدون مساءلة). */
export const NOTIFY_WORK_MINUTES = 450;
/** عند تراكم 900 دقيقة عمل (15 ساعة) → مرحلة المهلة الإضافية. */
export const DEADLINE_WORK_MINUTES = 900;
/** عدد ساعات الفتح المبكر قبل scheduledFor. */
export const EARLY_OPEN_HOURS = 4;
/** وقت المساءلة اليومي (14:45) بعد تجاوز المهلة الإضافية. */
export const DISCIPLINARY_MINUTES_OF_DAY = 885;
/** تاريخ بداية تطبيق السياسة الجديدة (2026-10-07 00:00 الرياض = 2026-10-06 21:00 UTC). */
export const NEW_POLICY_CUTOFF = new Date("2026-10-06T21:00:00.000Z");
/** ساعات الفتح المبكر الافتراضية للمهام التي ليس لها موعد فتح صريح. */
export const DEFAULT_EARLY_OPEN_HOURS = 4;

/** دقيقة اليوم بتوقيت الرياض (0–1439). */
function riyadhMinutesOfDayLocal(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const field = (name: string) => Number(parts.find(p => p.type === name)?.value || "0");
  return field("hour") * 60 + field("minute");
}

/**
 * يحسب دقائق العمل المتراكمة بين تاريخين.
 * - نافذة يومية: 07:00 → 14:30 بتوقيت الرياض (435 دقيقة + 15 مهلة خروج = 450 دقيقة/يوم).
 * - يستثني الجمعة/السبت والأعياد الرسمية.
 * - يستثني الساعات خارج النافذة اليومية.
 * هذه هي **المرجع الوحيد** لحساب التنبيه/المهلة/المساءلة/dueAt/الواجهة.
 */
export function accumulateWorkMinutes(from: Date, to: Date): number {
  if (from.getTime() >= to.getTime()) return 0;
  let total = 0;
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (cursor.getTime() < to.getTime()) {
    if (isSaudiWorkday(cursor) && !isOfficialHoliday(cursor)) {
      // 07:00 الرياض = 04:00 UTC، و14:30 الرياض = 11:30 UTC.
      const dayStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), 4, 0, 0));
      const dayEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), 11, 30, 0));
      const overlapStart = Math.max(dayStart.getTime(), from.getTime());
      const overlapEnd = Math.min(dayEnd.getTime(), to.getTime());
      if (overlapStart < overlapEnd) total += (overlapEnd - overlapStart) / 60000;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return Math.floor(total);
}

/** مرحلة دورة حياة المهمة الحالية (تُستخدم في الواجهة والخادم معاً). */
export type TaskLifecycleStage = "future" | "opening" | "active" | "notified" | "deadline" | "disciplinary";

/**
 * يحدد مرحلة المهمة:
 * - future: قبل نافذة الفتح المبكر.
 * - opening: ضمن 4 ساعات قبل scheduledFor (تظهر للموظف).
 * - active: مفتوحة للتنفيذ.
 * - notified: تجاوزت 450 دقيقة عمل (تنبيه).
 * - deadline: تجاوزت 900 دقيقة عمل (مهلة إضافية).
 * - disciplinary: تجاوزت 900 دقيقة عمل + بعد 14:45 (مساءلة مباشرة).
 * المهام المفتوحة (isOpen) والمنتهية لا تخضع لأي ضغط زمني.
 */
export function taskLifecycleStage(input: { scheduledFor: Date; now: Date; status?: string; isOpen?: boolean }): TaskLifecycleStage {
  const { scheduledFor, now } = input;
  if (input.isOpen) return "active";
  if (input.status === "completed" || input.status === "cancelled" || input.status === "under_review" || input.status === "paused") return "active";
  const accumulated = accumulateWorkMinutes(scheduledFor, now);
  if (accumulated >= DEADLINE_WORK_MINUTES) {
    return riyadhMinutesOfDayLocal(now) >= DISCIPLINARY_MINUTES_OF_DAY ? "disciplinary" : "deadline";
  }
  if (accumulated >= NOTIFY_WORK_MINUTES) return "notified";
  if (now.getTime() < scheduledFor.getTime()) {
    return now.getTime() >= scheduledFor.getTime() - EARLY_OPEN_HOURS * 60 * 60 * 1000 ? "opening" : "future";
  }
  return "active";
}

/** يبحث عن اللحظة التي تصل عندها دقائق العمل المتراكمة إلى threshold (لحساب dueAt الديناميكي). */
export function workMinutesDeadlineAt(from: Date, thresholdMinutes: number): Date {
  // نفحص خطوة بساعة؛ يكفي لدقة العرض، ونضبط النهاية على نهاية اليوم + grace.
  const cursor = new Date(from.getTime());
  for (let step = 0; step < 24 * 14; step += 1) {
    if (accumulateWorkMinutes(from, cursor) >= thresholdMinutes) return new Date(cursor.getTime());
    cursor.setTime(cursor.getTime() + 30 * 60 * 1000);
  }
  return new Date(cursor.getTime());
}

/** وصف مبسّط لمهمة تكفي لتحديد سياسة الفتح/الاستحقاق. */
export type TaskScheduleShape = { scheduledFor: Date; dueAt?: Date | null; isOpen?: boolean };

/**
 * هل للمهمة موعد نهائي محدد صراحة (غير الإزاحة الافتراضية القديمة 6/24 ساعة)؟
 * - isOpen=true تُعامل كمفتوحة بلا حد زمني.
 * - أي فرق بين dueAt و scheduledFor غير 6/24 ساعة = موعد محدد صراحة.
 */
export function hasExplicitSchedule(task: TaskScheduleShape): boolean {
  if (task.isOpen) return true;
  if (!task.dueAt) return false;
  const diffHours = (task.dueAt.getTime() - task.scheduledFor.getTime()) / (60 * 60 * 1000);
  return diffHours !== 6 && diffHours !== 24;
}

/** هل تنطبق السياسة الجديدة (7.5س/15س/14:45) على المهمة؟ */
export function appliesNewPolicy(task: TaskScheduleShape): boolean {
  if (task.isOpen) return false;
  if (task.scheduledFor.getTime() < NEW_POLICY_CUTOFF.getTime()) return false;
  if (hasExplicitSchedule(task)) return false;
  return true;
}

/** متى تُفتح المهمة للموظف؟ (يحترم المواعيد الصريحة). */
export function taskOpenAt(task: TaskScheduleShape): Date {
  if (task.isOpen || hasExplicitSchedule(task)) return new Date(task.scheduledFor);
  return new Date(task.scheduledFor.getTime() - DEFAULT_EARLY_OPEN_HOURS * 60 * 60 * 1000);
}

function riyadhParts(now: Date) {
  const values = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const field = (name: string) => Number(values.find(value => value.type === name)?.value || "0");
  return { year: field("year"), month: field("month"), day: field("day") };
}

export function isSaudiWorkday(now: Date) {
  const { year, month, day } = riyadhParts(now);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday >= 0 && weekday <= 4;
}

/** يوم الأسبوع بتوقيت الرياض: 0=الأحد ... 6=السبت. */
export function dayOfWeekRiyadh(now: Date) {
  const { year, month, day } = riyadhParts(now);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** يحوّل قيمة specificDays (نص JSON أو مصفوفة) إلى مصفوفة أيام صالحة. */
export function parseSpecificDays(value: unknown): number[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const days = value.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
    return days.length ? days : null;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const days = parsed.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
        return days.length ? days : null;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function isTemplateDue(frequency: TaskFrequency, workdayOnly: boolean, now: Date, intervalDays: number | null = null, lastGeneratedAt: Date | null = null, specificDays: number[] | null = null): boolean {
  if (workdayOnly && !isSaudiWorkday(now)) return false;
  const { year, month, day } = riyadhParts(now);
  // دعم الأيام المحددة
  if (frequency === "specific_days" && specificDays && specificDays.length > 0) {
    return specificDays.includes(dayOfWeekRiyadh(now));
  }
  // دعم interval (كل X أيام)
  if (intervalDays && intervalDays > 1) {
    if (!lastGeneratedAt) return true; // أول مرة
    const daysSinceLast = Math.floor((now.getTime() - lastGeneratedAt.getTime()) / 86400000);
    return daysSinceLast >= intervalDays;
  }
  if (frequency === "daily") {
    // القوالب اليومية: تُولَّد مرة واحدة في اليوم السعودي فقط
    if (!lastGeneratedAt) return true; // أول مرة
    const last = riyadhParts(lastGeneratedAt);
    return last.year !== year || last.month !== month || last.day !== day;
  }
  if (frequency === "weekly") return dayOfWeekRiyadh(now) === 0;
  if (frequency === "monthly") return day === 1;
  if (frequency === "quarterly") return day === 1 && [1, 4, 7, 10].includes(month);
  if (frequency === "yearly") return day === 1 && month === 1;
  if (frequency === "custom") return true;
  return false;
}

export function saudiScheduledTime(now: Date, hourLocal: number) {
  const { year, month, day } = riyadhParts(now);
  return new Date(Date.UTC(year, month - 1, day, hourLocal - 3, 0, 0));
}

export function dateRangeForSaudiDay(now: Date) {
  const start = saudiScheduledTime(now, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function isWithinSaudiWorkHours(now: Date) {
  if (!isSaudiWorkday(now)) return false;
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "2-digit", hour12: false }).format(now));
  return hour >= 7 && hour < 15;
}

export function nextSaudiWorkStart(now: Date) {
  let candidate = new Date(now);
  for (let attempts = 0; attempts < 8; attempts += 1) {
    if (isSaudiWorkday(candidate)) {
      const start = saudiScheduledTime(candidate, 7);
      if (isWithinSaudiWorkHours(now)) return now;
      if (start.getTime() > now.getTime()) return start;
    }
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return now;
}

export function escalationAt(scheduledFor: Date) {
  return new Date(scheduledFor.getTime() + 6 * 60 * 60 * 1000);
}

export function taskEscalationDeadline(scheduledFor: Date, dueAt: Date) {
  const sixHourDeadline = escalationAt(scheduledFor);
  return dueAt.getTime() < sixHourDeadline.getTime() ? dueAt : sixHourDeadline;
}

export function shouldEscalateTask(scheduledFor: Date, dueAt: Date, now: Date) {
  return taskEscalationDeadline(scheduledFor, dueAt).getTime() <= now.getTime();
}

export function escalationStage(scheduledFor: Date, dueAt: Date, now: Date) {
  const firstDeadline = taskEscalationDeadline(scheduledFor, dueAt);
  if (now.getTime() < firstDeadline.getTime()) return "none" as const;
  const supervisoryDeadline = new Date(firstDeadline.getTime() + 6 * 60 * 60 * 1000);
  return now.getTime() >= supervisoryDeadline.getTime() ? "supervisory" as const : "first" as const;
}

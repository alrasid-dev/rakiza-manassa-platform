// client/src/lib/work-hours.ts
// نسخة العميل من سياسة ساعات العمل الموحّدة (مطابقة لـ server/task-automation.ts).
// تُستخدم لعرض العداد الزمني للمهمة بمراحل دورة الحياة الجديدة.

const HIJRI_FORMAT = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Riyadh" });
const GREG_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });

export const WORK_DAY_START_MINUTES = 420;
export const WORK_DAY_END_MINUTES = 870;
export const NOTIFY_WORK_MINUTES = 450;
export const DEADLINE_WORK_MINUTES = 900;
export const EARLY_OPEN_HOURS = 4;
export const DISCIPLINARY_MINUTES_OF_DAY = 885;

function hijriParts(date: Date): { day: number; month: number; year: number } {
  const parts = HIJRI_FORMAT.formatToParts(date);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  return { day: get("day"), month: get("month"), year: get("year") };
}

function saudiGregorianParts(date: Date): { year: number; month: number; day: number } {
  const [year, month, day] = GREG_FORMAT.format(date).split("-").map(Number);
  return { year, month, day };
}

export function isOfficialHoliday(date: Date): boolean {
  const { month: m, day: d } = saudiGregorianParts(date);
  if (m === 2 && d === 22) return true;
  if (m === 9 && d === 23) return true;
  const h = hijriParts(date);
  if (h.month === 10 && (h.day === 1 || h.day === 2)) return true;
  if (h.month === 12 && h.day >= 9 && h.day <= 12) return true;
  return false;
}

export function isSaudiWorkday(now: Date): boolean {
  const { year, month, day } = saudiGregorianParts(now);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday >= 0 && weekday <= 4;
}

function riyadhMinutesOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const field = (name: string) => Number(parts.find(p => p.type === name)?.value || "0");
  return field("hour") * 60 + field("minute");
}

export function accumulateWorkMinutes(from: Date, to: Date): number {
  if (from.getTime() >= to.getTime()) return 0;
  let total = 0;
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (cursor.getTime() < to.getTime()) {
    if (isSaudiWorkday(cursor) && !isOfficialHoliday(cursor)) {
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

export type TaskLifecycleStage = "future" | "opening" | "active" | "notified" | "deadline" | "disciplinary";

export function taskLifecycleStage(input: { scheduledFor: Date; now: Date; status?: string; isOpen?: boolean }): TaskLifecycleStage {
  const { scheduledFor, now } = input;
  if (input.isOpen) return "active";
  if (input.status === "completed" || input.status === "cancelled" || input.status === "under_review" || input.status === "paused") return "active";
  const accumulated = accumulateWorkMinutes(scheduledFor, now);
  if (accumulated >= DEADLINE_WORK_MINUTES) {
    return riyadhMinutesOfDay(now) >= DISCIPLINARY_MINUTES_OF_DAY ? "disciplinary" : "deadline";
  }
  if (accumulated >= NOTIFY_WORK_MINUTES) return "notified";
  if (now.getTime() < scheduledFor.getTime()) {
    return now.getTime() >= scheduledFor.getTime() - EARLY_OPEN_HOURS * 60 * 60 * 1000 ? "opening" : "future";
  }
  return "active";
}

/** نص العداد الزمني بمراحل دورة الحياة الجديدة (يبدأ بعد/متبقي/تنبيه/مهلة/مقفلة). */
export function taskWorkCountdownLabel(input: { scheduledFor: Date | string | number | null; status?: string; isOpen?: boolean; now?: Date }): { text: string; tone: "muted" | "orange" | "red" } | null {
  const scheduled = input.scheduledFor ? new Date(input.scheduledFor) : null;
  if (!scheduled || Number.isNaN(scheduled.getTime())) return null;
  const now = input.now ?? new Date();
  const stage = taskLifecycleStage({ scheduledFor: scheduled, now, status: input.status, isOpen: input.isOpen });
  if (stage === "future") {
    const diffMin = Math.ceil((scheduled.getTime() - now.getTime()) / 60000);
    return { text: `يبدأ بعد ${diffMin} دقيقة`, tone: "muted" };
  }
  if (stage === "opening") {
    const diffMin = Math.ceil((scheduled.getTime() - now.getTime()) / 60000);
    return { text: `يبدأ بعد ${diffMin} دقيقة`, tone: "muted" };
  }
  if (stage === "disciplinary") {
    return { text: "⚠️ مهلة إضافية — المساءلة الساعة 14:45 اليوم", tone: "red" };
  }
  if (stage === "deadline") {
    return { text: "⚠️ مهلة إضافية — المساءلة الساعة 14:45 اليوم", tone: "red" };
  }
  if (stage === "notified") {
    return { text: "⚠️ تنبيه — تجاوزت المهمة 7.5 ساعة عمل", tone: "orange" };
  }
  // active: اعرض ما تبقّى حتى 450 دقيقة عمل
  const accumulated = accumulateWorkMinutes(scheduled, now);
  const remaining = Math.max(0, NOTIFY_WORK_MINUTES - accumulated);
  if (remaining <= 0) return { text: "متبقي أقل من ساعة عمل", tone: "orange" };
  const hours = Math.floor(remaining / 60);
  const mins = remaining % 60;
  return { text: `متبقي ${hours > 0 ? `${hours} ساعة` : ""}${hours > 0 && mins > 0 ? " و" : ""}${mins > 0 ? `${mins} دقيقة` : ""} عمل`.trim(), tone: "muted" };
}

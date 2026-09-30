export type TaskFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom" | "specific_days";

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
  const { month, day } = riyadhParts(now);
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
  if (frequency === "daily") return true;
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

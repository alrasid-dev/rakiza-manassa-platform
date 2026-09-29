export type TaskFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "custom";

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

export function isTemplateDue(frequency: TaskFrequency, workdayOnly: boolean, now: Date) {
  if (workdayOnly && !isSaudiWorkday(now)) return false;
  const { month, day } = riyadhParts(now);
  if (frequency === "daily") return true;
  if (frequency === "weekly") return new Date(Date.UTC(riyadhParts(now).year, month - 1, day)).getUTCDay() === 0;
  if (frequency === "monthly") return day === 1;
  if (frequency === "quarterly") return day === 1 && [1, 4, 7, 10].includes(month);
  if (frequency === "custom") return true; // يُعامل كـ daily
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

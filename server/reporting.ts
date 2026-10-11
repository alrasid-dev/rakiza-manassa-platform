import { dateRangeForSaudiDay } from "./task-automation";

export type ReportPeriod = "daily" | "weekly" | "monthly" | "historical";

export function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

export function reportStart(period: ReportPeriod, now: Date) {
  // بداية اليوم السعودي (00:00 الرياض) بدل منتصف الليل UTC — يمنع إزاحة 3 ساعات في التقارير.
  const riyadhMidnight = dateRangeForSaudiDay(now).start;
  if (period === "daily") return riyadhMidnight;
  if (period === "weekly") {
    const riyadhDate = new Date(riyadhMidnight.getTime() + RIYADH_OFFSET_MS);
    const day = riyadhDate.getUTCDay();
    const offset = day === 0 ? 6 : day - 1; // الرجوع إلى يوم الاثنين
    return new Date(riyadhMidnight.getTime() - offset * 86_400_000);
  }
  if (period === "monthly") {
    const riyadhDate = new Date(riyadhMidnight.getTime() + RIYADH_OFFSET_MS);
    return new Date(Date.UTC(riyadhDate.getUTCFullYear(), riyadhDate.getUTCMonth(), 1, -3));
  }
  return new Date(0);
}

export function previousReportRange(period: Exclude<ReportPeriod, "historical">, now: Date) {
  const currentStart = reportStart(period, now);
  const previousEnd = currentStart;
  const previousStart = new Date(currentStart);
  if (period === "daily") previousStart.setUTCDate(previousStart.getUTCDate() - 1);
  else if (period === "weekly") previousStart.setUTCDate(previousStart.getUTCDate() - 7);
  else previousStart.setUTCMonth(previousStart.getUTCMonth() - 1);
  return { startAt: previousStart, endAt: previousEnd };
}

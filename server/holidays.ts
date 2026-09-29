/**
 * server/holidays.ts
 * الإجازات الرسمية السعودية عبر تقويم أم القرى + ساعات العمل في رمضان.
 * يعتمد على Intl.DateTimeFormat بنظام islamic-umalqura (مدعوم في Node و Vercel).
 * يعمل لأي نطاق زمني (يشمل 10 سنوات قادمة) بدون تخزين مسبق.
 */

const HIJRI_FORMAT = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Riyadh" });
const GREG_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });

export type WorkHours = { start: string; end: string };
export type HijriDate = { day: number; month: number; year: number };

/** ساعات العمل التشغيلية المعتمدة (من سياسة التشغيل). */
export const NORMAL_WORK_HOURS: WorkHours = { start: "07:00", end: "15:00" };
/** ساعات العمل الرسمية المخففة في رمضان. */
export const RAMADAN_WORK_HOURS: WorkHours = { start: "10:00", end: "15:00" };

export function hijriParts(date: Date): HijriDate {
  const parts = HIJRI_FORMAT.formatToParts(date);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  return { day: get("day"), month: get("month"), year: get("year") };
}

/** الأجزاء الميلادية بتوقيت الرياض (لتجنب انحراف اليوم بسبب توقيت الخادم). */
export function saudiGregorianParts(date: Date): { year: number; month: number; day: number } {
  const [year, month, day] = GREG_FORMAT.format(date).split("-").map(Number);
  return { year, month, day };
}

/** رمضان هو الشهر التاسع هجرياً. */
export function isRamadan(date: Date): boolean {
  return hijriParts(date).month === 9;
}

/** ساعات العمل المطبقة في يوم معيّن (رمضان أو عادية). */
export function workHoursFor(date: Date): WorkHours {
  return isRamadan(date) ? RAMADAN_WORK_HOURS : NORMAL_WORK_HOURS;
}

/** اسم الإجازة الرسمية السعودية إن وقع اليوم فيها، وإلا null. */
export function officialHolidayName(date: Date): string | null {
  const { month: m, day: d } = saudiGregorianParts(date);
  if (m === 2 && d === 22) return "يوم التأسيس";
  if (m === 9 && d === 23) return "اليوم الوطني";
  const h = hijriParts(date);
  // عيد الفطر: 1-2 شوال.
  if (h.month === 10 && (h.day === 1 || h.day === 2)) return "عيد الفطر";
  // وقفة عرفات وعيد الأضحى: 9-12 ذو الحجة.
  if (h.month === 12 && h.day >= 9 && h.day <= 12) return "عيد الأضحى";
  return null;
}

export function isOfficialHoliday(date: Date): boolean {
  return officialHolidayName(date) !== null;
}

/** قائمة الإجازات الرسمية في نطاق زمني (للعرض أو التخطيط). */
export function listOfficialHolidays(start: Date, end: Date): Array<{ date: string; name: string }> {
  const out: Array<{ date: string; name: string }> = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(23, 59, 59, 999);
  while (cursor <= last) {
    const name = officialHolidayName(cursor);
    if (name) out.push({ date: cursor.toISOString().slice(0, 10), name });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

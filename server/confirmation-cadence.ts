/**
 * server/confirmation-cadence.ts
 * نظام انضباط تأكيد الحضور (Cadence) الجديد.
 * يومي → (منضبط 5 أيام متواصلة) الأحد/الثلاثاء/الخميس → (منضبط 15 يوم متواصلة) مرة كل 15 يوم.
 * أي تخلف → يرجع للافتراضي (يومي) والعد يبدأ من الصفر.
 */

export type ConfirmationCadence = "daily" | "three_times_weekly" | "every_fifteen_days";

/** أيام العمل لنظام "3 مرات أسبوعياً" (0=الأحد ... 4=الخميس). */
export const THREE_TIMES_WEEKLY_DAYS = [0, 2, 4] as const; // الأحد / الثلاثاء / الخميس

/** مدة نافذة التأكيد بالدقائق. */
export const CONFIRMATION_WINDOW_MINUTES = 30;
/** بداية نافذة التوليد العشوائي (09:00). */
export const CONFIRMATION_RANDOM_START_MINUTES = 9 * 60;
/** نهاية نافذة التوليد العشوائي (13:45). */
export const CONFIRMATION_RANDOM_END_MINUTES = 13 * 60 + 45;

/** حساب cadence بناءً على عدد أيام العمل المتواصلة المنجزة (done). */
export function confirmationCadence(consecutiveDoneDays: number): ConfirmationCadence {
  if (consecutiveDoneDays >= 15) return "every_fifteen_days";
  if (consecutiveDoneDays >= 5) return "three_times_weekly";
  return "daily";
}

/** هل يجب توليد تكليف تأكيد في هذا اليوم (weekday 0-6، 0=الأحد)؟ */
export function shouldConfirmOnWorkday(cadence: ConfirmationCadence, weekday: number, daysSinceLastDone: number): boolean {
  if (cadence === "daily") return true;
  if (cadence === "three_times_weekly") return (THREE_TIMES_WEEKLY_DAYS as readonly number[]).includes(weekday);
  if (cadence === "every_fifteen_days") return daysSinceLastDone >= 15;
  return false;
}

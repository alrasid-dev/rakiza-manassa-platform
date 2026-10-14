// توقيت الرياض الموحّد — UTC+3 بلا توقيت صيفي.
// هذه الوحدة هي المرجع الوحيد لتحويلات التوقيت في العميل، لمنع أخطاء إزاحة الـ 3 ساعات نهائياً.
// القاعدة: DB يخزّن UTC، والرياض = UTC+3 (لا توقيت صيفي).

export const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 (السعودية، لا توقيت صيفي)

export type DateLike = Date | string | number | null | undefined;

function coerceDate(value: DateLike): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** يحوّل لحظة UTC إلى لحظة الرياض (بإزاحة ثابتة +3 ساعات). */
export function toRiyadh(date: Date): Date {
  return new Date(date.getTime() + RIYADH_OFFSET_MS);
}

/** يستخرج تاريخ الرياض بصيغة YYYY-MM-DD. */
export function riyadhDateKey(date: DateLike): string {
  const d = coerceDate(date);
  return d ? toRiyadh(d).toISOString().slice(0, 10) : "";
}

/** يستخرج وقت الرياض بصيغة HH:MM. */
export function riyadhTimeKey(date: DateLike): string {
  const d = coerceDate(date);
  return d ? toRiyadh(d).toISOString().slice(11, 16) : "";
}

/** يستخرج تاريخ ووقت الرياض بصيغة YYYY-MM-DDTHH:MM (لتغذية حقول datetime-local). */
export function riyadhDateTimeLocal(date: DateLike): string {
  const d = coerceDate(date);
  return d ? toRiyadh(d).toISOString().slice(0, 16) : "";
}

/** يحوّل نص datetime-local "YYYY-MM-DDTHH:MM" المُدخل بتوقيت الرياض إلى لحظة UTC (طرح 3 ساعات). */
export function riyadhLocalToUtc(localStr: string): Date {
  const [datePart, timePart = "00:00"] = localStr.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh = 0, mm = 0] = timePart.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 3, mm, 0));
}

/** تاريخ بداية اليوم الرياض (كـ UTC Date = 21:00 UTC لليوم السابق). */
export function riyadhDayStart(date: Date): Date {
  const r = toRiyadh(date);
  return new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate(), -3));
}

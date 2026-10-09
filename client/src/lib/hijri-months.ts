/** أدوات الشهر الهجري (أم القرى) للواجهة — توليد قائمة أشهر + تحويل الشهر الهجري إلى نطاق ميلادي. */

/** مفتاح الشهر الهجري بصيغة «1448-04». */
export function hijriMonthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric", month: "numeric" }).formatToParts(date);
  const year = parts.find(p => p.type === "year")?.value ?? "0";
  const month = (parts.find(p => p.type === "month")?.value ?? "0").padStart(2, "0");
  return `${year}-${month}`;
}

/** اسم الشهر الهجري للعرض. */
export function hijriMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { year: "numeric", month: "long" }).format(date);
}

/** آخر (count) شهر هجري (الأحدث أولاً، بلا تكرار). */
export function recentHijriMonths(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count * 2; i++) {
    const d = new Date(now.getTime() - i * 15 * 86400000);
    const k = hijriMonthKey(d);
    if (!out.includes(k)) out.push(k);
    if (out.length >= count) break;
  }
  return out;
}

/** يحوّل مفتاح شهر هجري («1448-04») إلى نطاق ميلادي { startAt, endAt } (endAt حصري). */
export function hijriMonthRange(key: string): { startAt: Date; endAt: Date } | null {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return null;
  const now = new Date();
  const nowKey = hijriMonthKey(now);
  const [nowYear, nowMonth] = nowKey.split("-").map(Number);
  const monthDiff = (year - nowYear) * 12 + (month - nowMonth);
  const anchor = new Date(now.getTime() + monthDiff * 29.5 * 86400000);
  const matches: Date[] = [];
  for (let offset = -45; offset <= 45; offset++) {
    const d = new Date(anchor.getTime() + offset * 86400000);
    if (hijriMonthKey(d) === key) matches.push(d);
  }
  if (!matches.length) return null;
  matches.sort((a, b) => a.getTime() - b.getTime());
  const first = matches[0];
  const last = matches[matches.length - 1];
  return {
    startAt: new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate())),
    endAt: new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() + 1)),
  };
}

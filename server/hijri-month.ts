/**
 * يحدد مفتاح الشهر الهجري (سنة-شهر) وفق تقويم أم القرى،
 * لاستخدامه في تجميع حدود الاستئذان الشهرية.
 */
export function hijriMonthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0";
  const month = (parts.find((p) => p.type === "month")?.value ?? "0").padStart(2, "0");
  return `${year}-${month}`;
}

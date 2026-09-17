/** حفظ احتياطي موازٍ لتفضيلات لوحة القيادة في localStorage لسرعة الاستجابة اللحظية عند إعادة التحميل. */
export const DASHBOARD_PREFERENCES_STORAGE_KEY = "rakiza:dashboardPreferences:v1";

export function readDashboardPreferencesLocal<T>(): T | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(DASHBOARD_PREFERENCES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeDashboardPreferencesLocal(value: unknown) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DASHBOARD_PREFERENCES_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* تجاهل أخطاء التخزين المحلي (مساحة ممتلئة أو وضع خاص). */
  }
}

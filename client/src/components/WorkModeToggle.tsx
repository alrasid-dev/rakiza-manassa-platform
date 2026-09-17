/** يعرض الواجهة والصلاحيات آلياً حسب الموقع الوظيفي للمستخدم في الهيكلة التنظيمية (لا تبديل يدوي). */
export function useWorkMode(hasLeadershipScope: boolean): "employee" | "manager" {
  return hasLeadershipScope ? "manager" : "employee";
}

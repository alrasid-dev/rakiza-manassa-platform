/** حدود سياسة الاستئذان المعتمدة. */
export const PERMISSION_POLICY = {
  /** الحد الأقصى للاستئذان الواحد بالدقائق. */
  maxMinutesPerRequest: 250,
  /** الحد الأقصى الشهري (بالمجموع) بالدقائق، حسب الشهر الهجري. */
  maxMinutesPerMonth: 1000,
  /** عدد الاستئذانات المسموح بها دون موافقة الأمين (الرابع+ يتطلب اعتماد الأمين). */
  maxRequestsBeforeOwnerApproval: 3,
} as const;

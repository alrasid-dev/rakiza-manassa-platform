/** سياسة البصمة الدقيقة للدخول والخروج — تصنيف الوقت إلى نقاط ودقائق تأخير/تبكير (بتوقيت الرياض). */

export type CheckInStatus = "too_early" | "early_present" | "present" | "late_no_penalty" | "late" | "too_late";
export type CheckOutStatus = "too_early" | "early" | "normal" | "late_present" | "late_no_penalty" | "too_late";

export type CheckInClassification = { allowed: boolean; status: CheckInStatus; points: number; lateMinutes: number };
export type CheckOutClassification = { allowed: boolean; status: CheckOutStatus; points: number; earlyMinutes: number };

// الحدود الزمنية بالدقائق (بتوقيت الرياض).
export const FINGERPRINT_OPEN_MIN = 420;      // 07:00
export const MORNING_REWARD_END_MIN = 450;    // 07:30
export const PRESENT_END_MIN = 480;           // 08:00
export const LATE_NO_PENALTY_END_MIN = 495;   // 08:15
export const ACTUAL_END_MIN = 855;            // 14:15
export const EVENING_REWARD_END_MIN = 886;    // 14:46
export const FINGERPRINT_CLOSE_MIN = 899;     // 14:59

/** تصنيف لحظة الدخول (الحضور). */
export function classifyCheckIn(min: number): CheckInClassification {
  // قبل 07:00
  if (min < FINGERPRINT_OPEN_MIN) return { allowed: false, status: "too_early", points: 0, lateMinutes: 0 };

  // 07:00 → 07:30: إيجابي كل دقيقتين (07:00 = +15، 07:30 = 0)
  if (min <= MORNING_REWARD_END_MIN) {
    const points = Math.floor((MORNING_REWARD_END_MIN - min) / 2);
    return { allowed: true, status: "early_present", points, lateMinutes: 0 };
  }

  // 07:31 → 08:00: حاضر عادي
  if (min <= PRESENT_END_MIN) return { allowed: true, status: "present", points: 0, lateMinutes: 0 };

  // 08:01 → 08:15: متأخر بدون خصم
  if (min <= LATE_NO_PENALTY_END_MIN) return { allowed: true, status: "late_no_penalty", points: 0, lateMinutes: 0 };

  // 08:16 → 14:59: متأخر يُحسب من 07:30
  if (min <= FINGERPRINT_CLOSE_MIN) {
    const lateMinutes = min - MORNING_REWARD_END_MIN;
    return { allowed: true, status: "late", points: 0, lateMinutes };
  }

  // 15:00+
  return { allowed: false, status: "too_late", points: 0, lateMinutes: 0 };
}

/** تصنيف لحظة الخروج (الانصراف). */
export function classifyCheckOut(min: number): CheckOutClassification {
  // قبل 07:00
  if (min < FINGERPRINT_OPEN_MIN) return { allowed: false, status: "too_early", points: 0, earlyMinutes: 0 };

  // 07:00 → 14:14: انصراف مبكر (سلبي)
  if (min < ACTUAL_END_MIN) {
    const earlyMinutes = ACTUAL_END_MIN - min;
    return { allowed: true, status: "early", points: 0, earlyMinutes };
  }

  // 14:15: انصراف طبيعي
  if (min === ACTUAL_END_MIN) return { allowed: true, status: "normal", points: 0, earlyMinutes: 0 };

  // 14:16 → 14:46: إيجابي كل دقيقتين (14:16 = +15، 14:46 = 0)
  if (min <= EVENING_REWARD_END_MIN) {
    const points = Math.floor((EVENING_REWARD_END_MIN - min) / 2);
    return { allowed: true, status: "late_present", points, earlyMinutes: 0 };
  }

  // 14:47 → 14:59: مسموح بلا نقاط
  if (min <= FINGERPRINT_CLOSE_MIN) return { allowed: true, status: "late_no_penalty", points: 0, earlyMinutes: 0 };

  // 15:00+
  return { allowed: false, status: "too_late", points: 0, earlyMinutes: 0 };
}

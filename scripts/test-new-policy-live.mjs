// scripts/test-new-policy-live.mjs
// اختبار فعلي (dry-run) لسياسة دورة الحياة الجديدة — 4 سيناريوهات، بدون كتابة/إشعار حقيقي.
// يُشغَّل عبر: npx tsx scripts/test-new-policy-live.mjs
import { accumulateWorkMinutes, appliesNewPolicy, DEFAULT_EARLY_OPEN_HOURS, hasExplicitSchedule, NEW_POLICY_CUTOFF, taskLifecycleStage, taskOpenAt, workMinutesDeadlineAt } from "../server/task-automation.ts";

const rows = [];
function record(input, expected, actual, ok) {
  rows.push({ input, expected, actual, ok });
}

// ===== السيناريو 1: مهمة افتراضية تبدأ 10:00 (scheduledFor بعد CUTOFF) =====
const sched = new Date("2026-10-11T07:00:00.000Z"); // الأحد 10:00 الرياض
const notifiedAt = workMinutesDeadlineAt(sched, 450);
const deadlineAt = workMinutesDeadlineAt(sched, 900);
record("مهمة افتراضية 10:00 — عند 450 دقيقة عمل", "notified", taskLifecycleStage({ scheduledFor: sched, now: notifiedAt, status: "in_progress" }), taskLifecycleStage({ scheduledFor: sched, now: notifiedAt, status: "in_progress" }) === "notified");
record("مهمة افتراضية 10:00 — عند 900 دقيقة عمل (قبل 14:45)", "deadline", taskLifecycleStage({ scheduledFor: sched, now: deadlineAt, status: "in_progress" }), taskLifecycleStage({ scheduledFor: sched, now: deadlineAt, status: "in_progress" }) === "deadline");
// 900 دقيقة عمل + بعد 14:45 الرياض = 11:45 UTC
const disciplinaryNow = new Date(deadlineAt.getTime());
disciplinaryNow.setUTCHours(11, 45, 0, 0);
record("مهمة افتراضية 10:00 — عند 900 + 14:45", "disciplinary", taskLifecycleStage({ scheduledFor: sched, now: disciplinaryNow, status: "in_progress" }), taskLifecycleStage({ scheduledFor: sched, now: disciplinaryNow, status: "in_progress" }) === "disciplinary");

// ===== السيناريو 2: مهمة محددة صراحة بمدة 4 ساعات =====
const explicitSched = new Date("2026-10-11T07:00:00.000Z");
const explicitDue = new Date(explicitSched.getTime() + 4 * 60 * 60 * 1000);
record("مهمة صريحة 4 ساعات — لا سياسة 7.5س/15س", "appliesNewPolicy=false", appliesNewPolicy({ scheduledFor: explicitSched, dueAt: explicitDue, isOpen: false }), appliesNewPolicy({ scheduledFor: explicitSched, dueAt: explicitDue, isOpen: false }) === false);
record("مهمة صريحة 4 ساعات — لا فتح مبكر", "taskOpenAt=scheduledFor", taskOpenAt({ scheduledFor: explicitSched, dueAt: explicitDue, isOpen: false }).toISOString(), taskOpenAt({ scheduledFor: explicitSched, dueAt: explicitDue, isOpen: false }).toISOString() === explicitSched.toISOString());

// ===== السيناريو 3: مهمة isOpen = true =====
record("مهمة isOpen — مستثناة", "appliesNewPolicy=false + active", `${appliesNewPolicy({ scheduledFor: sched, dueAt: null, isOpen: true })}/${taskLifecycleStage({ scheduledFor: sched, now: disciplinaryNow, status: "in_progress", isOpen: true })}`, appliesNewPolicy({ scheduledFor: sched, dueAt: null, isOpen: true }) === false && taskLifecycleStage({ scheduledFor: sched, now: disciplinaryNow, status: "in_progress", isOpen: true }) === "active");

// ===== السيناريو 4: مهمة scheduledFor < CUTOFF =====
const legacySched = new Date("2026-10-05T07:00:00.000Z");
record("مهمة قبل CUTOFF — لا تُعالج", "appliesNewPolicy=false", appliesNewPolicy({ scheduledFor: legacySched, dueAt: null, isOpen: false }), appliesNewPolicy({ scheduledFor: legacySched, dueAt: null, isOpen: false }) === false);

// ===== الجدول =====
console.log("NEW_POLICY_CUTOFF:", NEW_POLICY_CUTOFF.toISOString(), "(2026-10-07 00:00 الرياض)");
console.log("DEFAULT_EARLY_OPEN_HOURS:", DEFAULT_EARLY_OPEN_HOURS);
console.log("");
console.log(["المدخل", "المتوقع", "الفعلي", "النتيجة"].join("\t"));
for (const r of rows) {
  console.log([r.input, r.expected, r.actual, r.ok ? "✅" : "❌"].join("\t"));
}
const failed = rows.filter(r => !r.ok).length;
console.log(`\n${rows.length - failed}/${rows.length} ✅ | ${failed} ❌`);
process.exit(failed > 0 ? 1 : 0);

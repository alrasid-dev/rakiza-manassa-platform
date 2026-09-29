# تقرير نظام التكرار المتقدم (interval + yearly + كل X أيام)

**التاريخ:** 2026-09-29
**الفرع:** main (متزامن مع origin/main)

## المهام المنجزة

| # | المهمة | commit |
|---|--------|:---:|
| 1 | Migration: yearly + interval + intervalDays | `fe02a9f` |
| 2 | isTemplateDue يدعم interval + yearly | `5c8058f` |
| 3 | createRecurringTasksAndNotifications يدعم interval | `fbfc25a` |
| 4 | نموذج إنشاء متقدم (يومي/أسبوعي/شهري/سنوي/كل X أيام) | `57bd0ed` |
| 5 | createTask يدعم custom interval | `72e7f94` |
| 6 | شارة التكرار المتقدم | `efcbd65` |
| 7 | تحديث صفحة القوالب بدعم interval | `43d315d` |

## الأنواع المدعومة

| النوع | المعنى | Interval |
|-------|--------|:---:|
| daily | كل يوم | 1 |
| weekly | كل أسبوع (الأحد) | 1 |
| monthly | كل شهر (يوم 1) | 1 |
| quarterly | كل ربع سنة (يوم 1 في 1/4/7/10) | 1 |
| yearly | كل سنة (1 يناير) | 1 |
| custom | كل X أيام | 1-365 |

> ملاحظة: أُبقيت `quarterly` في enum `tasks.recurrence` و`task_templates.frequency` عمداً — لأن القوالب الربع سنوية تولّد مهامًا بـ `recurrence = frequency`، وحذفها كان سيكسر ذلك التوليد. أُضيف `yearly` فوقها.

## تفاصيل الـ Migration

- **النسخة الاحتياطية:** `backups/backup_BEFORE_INTERVAL.json`
- **السكربت:** `scripts/migrate-recurring-interval.mjs` (idempotent)
- **الأعمدة/القيم المضافة:**
  - `tasks.recurrence`: أُضيف `yearly` (مع الإبقاء على `quarterly`).
  - `tasks.recurrenceInterval`: عمود `INT NULL` (كل X أيام للمهمة).
  - `task_templates.frequency`: أُضيف `yearly`.
  - `task_templates.intervalDays`: عمود `INT NULL` (كل X أيام للقالب).
- **`drizzle/schema.ts`**: عُدّلت الأنواع والأعمدة بنفس القيم.

## أمثلة سلوكية

- «تدوين الإحاطة» يومي → مهمة كل يوم 7 صباحاً (أيام العمل فقط).
- «تقرير أسبوعي» أسبوعي → كل أحد 7 صباحاً.
- «تقرير شهري» شهري → يوم 1 من كل شهر.
- «تقرير سنوي» سنوي → 1 يناير من كل سنة.
- «كل 3 أيام» custom interval=3 → كل 3 أيام (يبدأ فوراً ثم بعد 3 أيام من آخر توليد).

## آلية التوليد (Cron)

- `daily-task-reminder` عبر GitHub Actions كل 5 دقائق (idempotent per-day).
- `isTemplateDue` يعتمد على توقيت الرياض (`riyadhParts`) لتجنّب كسر المنطقة الزمنية على Vercel/UTC.
- بعد كل توليد يُحدّث `lastGeneratedAt` لمنع التكرار المزدوج.

## الاختبارات

- **TSC:** ✅
- **Vitest:** ✅ 642 passed / 8 skipped (650)
- **Build:** ✅

## Vercel

- آخر deploy: بعد آخر push إلى `main` (يُبنى تلقائياً عند الدفع).

## ما يحتاج مراجعة لاحقة

1. **تصنيف يدوي للقوالب الـ29** عبر صفحة `/task-templates` (يومي/أسبوعي/شهري/ربع سنوي/سنوي/كل X أيام) — القوالب الحالية بلا كلمات تكرار فتبقى `custom` (تعمل كـ daily الآن).
2. **`sourceTaskId`**: يُنصح لاحقاً بقراءته لدعم سلاسل التكرار من مهمة أصل.
3. **تحقق من Vercel deploy** بعد آخر push.

# تقرير الإصلاحات
## التاريخ: 2026-09-29

## المهام المنفذة:
| # | المهمة | الحالة | commit |
|---|--------|:---:|:---:|
| 1 | عزل مهام الأقسام | ✅ | 4ff3137 |
| 2 | عزل meetings.invite | ✅ | 93b84df |
| 3 | زر PDF | ✅ | ce7a2fa |
| 4 | شارة الإجازة | ✅ | 0d35f91 |
| 5 | صلاحية الأمين | ✅ | 9dfef01 |

## الثغرات المُصلَحة:
1. مدير قسم كان يقدر يعدل/يلغي/يعلّق مهام قسم آخر → الآن `403`.
2. مدير قسم كان يقدر يدعو حاضرين لاجتماع قسم آخر → الآن `403`.

## تفاصيل التنفيذ:
1. **عزل مهام الأقسام**: أُضيفت دالة `canAccessTask` في `server/routers/court.ts` تمنح الوصول للقيادة/صاحب المهمة/مدير وحدة المهمة فقط، وطُبّقت على إجراءات المهام (update/cancel/details/timeline/attachments/addComment/reportObstacle/acknowledge/markAsProcessed/setPinned/setNotes وغيرها). أُضيف اختبار `server/task-isolation.test.ts`.
2. **عزل meetings.invite**: أُنشئت `getMeetingById` في `server/court-service.ts` وأُضيف فحص وحدة الاجتماع قبل دعوة الحاضرين. أُضيف اختبار `server/meetings-invite-isolation.test.ts`.
3. **زر PDF**: أُضيفت بطاقة "دليل السياسات الخاص بي" في `PersonalSettingsPage.tsx` تولّد وتحمّل ملف PDF عبر `trpc.court.policies.pdf`.
4. **شارة الإجازة**: أُضيف إجراء `court.holidays.today` في الخادم وشارة "يوم إجازة رسمية" وشريط رمضان في `TasksWorkspaceContent.tsx`. أُضيف اختبار `server/holidays-endpoint.test.ts`.
5. **صلاحية الأمين**: رُفعت صلاحية الأمين عبدالله العتيبي (`abssotaibi@moj.gov.sa`) من `general_view` إلى `full_control` عبر `scripts/upgrade-secretary-permission.mjs` (مع نسخة احتياطية مسبقة). أصبح يستطيع فتح الاجتماعات واعتماد الإجازات وتعديل الموظفين.

## الاختبارات:
- TSC: ✅ (`npm run check` — tsconfig.node.json + tsconfig.app.json)
- Vitest: ✅ (637 passed / 8 skipped)
- Build: ✅ (`npm run build`)

## Vercel:
- آخر deploy: يُشغَّل تلقائياً من آخر push إلى `main` (commit `9dfef01`).

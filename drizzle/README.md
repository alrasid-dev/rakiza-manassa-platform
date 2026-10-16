# Drizzle Migrations — ملاحظات مهمة

## ⚠️ Journal Desync (حالة موجودة مسبقاً)

`_journal.json` متوقف عند `0081`، لكن هناك ملفات migration لاحقة:
- 0082_permission_policy.sql
- 0083_attendance_exemption.sql
- 0084_leave_cancelled_status.sql
- 0085_add_assistant_secretary_and_delegation_capabilities.sql

**السبب:** المشروع يطبّق migrations يدوياً (جدول `__drizzle_migrations` فارغ).

**النتيجة:** `drizzle-kit generate` غير قابل للاستخدام حالياً — يُنتج migrations خاطئة.

## 🔧 كيفية إضافة migration جديد

1. اكتب ملف `.sql` يدوياً في `drizzle/`.
2. طبّقه يدوياً على DB.
3. وثّقه هنا.
4. ⚠️ لا تستخدم `drizzle-kit generate`.

## 📋 المهام المؤجلة

- [ ] إصلاح journal desync (re-baseline أو ترقيع يدوي).
- [ ] تفعيل drizzle-kit generate بعد الإصلاح.

## 📁 Migrations اليدوية

| # | الملف | الوصف | تاريخ التطبيق |
|---|-------|-------|---------------|
| 0082 | permission_policy | سياسة الاستئذان | 2026-09-28 |
| 0083 | attendance_exemption | إعفاء الحضور | 2026-09-28 |
| 0084 | leave_cancelled_status | حالة إلغاء الإجازة | 2026-10-05 |
| 0085 | add_assistant_secretary_and_delegation_capabilities | الأمين المساعد + قدرات التفويض | 2026-10-16 |

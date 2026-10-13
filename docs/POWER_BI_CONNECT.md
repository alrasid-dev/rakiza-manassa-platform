# الاتصال بقاعدة البيانات عبر Power BI (SQL Views)

هذا الدليل يشرح كيفية ربط **Power BI Desktop** مباشرة بقاعدة بيانات المنصة (TiDB Cloud) عبر
**SQL Views** جاهزة (`v_powerbi_*`) لتسهيل بناء التقارير بدون الحاجة لفهم بنية الجداول الخام.

---

## 1) بيانات الاتصال (TiDB Cloud)

> ⚠️ **لا تضع كلمة المرور هنا.** خذها من ملف البيئة المحلي (راجع الخطوة 3 أدناه).

| الحقل | القيمة |
|---|---|
| الخادم (Server) | `gateway01.eu-central-1.prod.aws.tidbcloud.com` |
| المنفذ (Port) | `4000` |
| قاعدة البيانات (Database) | `rakiza` |
| اسم المستخدم (Username) | `KVJ1FBiHBq8eqUY.root` |
| كلمة المرور | 🔒 من ملف `.env.production.local` (متغيّر `DATABASE_URL`) |
| نوع الاتصال | MySQL (TiDB متوافق مع MySQL) |
| التشفير | TLS/SSL مطلوب (`Encrypt=True`) |

---

## 2) خطوات الاتصال من Power BI Desktop

1. افتح **Power BI Desktop**.
2. من شريط **الصفحة الرئيسية (Home)** → اضغط **Get Data** → اختر **MySQL database**.
   - (إذا لم تجد MySQL، اختر **More...** وابحث عنه).
3. أدخل:
   - **Server**: `gateway01.eu-central-1.prod.aws.tidbcloud.com:4000`
   - **Database**: `rakiza`
4. اختر **Database** في نافذة المصادقة، ثم أدخل:
   - **User name**: `KVJ1FBiHBq8eqUY.root`
   - **Password**: 🔒 (من ملف البيئة)
5. في نافذة **Navigator** ستظهر الجداول و **Views**. ابحث عن أسماء `v_powerbi_*`.
6. حدّد الـ Views المطلوبة واضغط **Load**.

> ملاحظة: إذا ظهرت شاشة تحذير بخصوص الشهادات/TLS، فعّل خيار **Encrypt connection**.

---

## 3) من أين أحصل على كلمة المرور؟

كلمة المرور موجودة داخل **`DATABASE_URL`** في أحد ملفات البيئة (لا تُرفع هذه الملفات إلى Git):

- `.env.production.local` (بيئة الإنتاج — المفضّل)
- `.env.local`
- `.env`

صيغة `DATABASE_URL`:
```
mysql://KVJ1FBiHBq8eqUY.root:<كلمة المرور>@gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/rakiza?ssl={"rejectUnauthorized":false}
```
كلمة المرور هي الجزء بين `:` و `@` مباشرة بعد اسم المستخدم.

---

## 4) قائمة الـ Views الجاهزة

| View | المحتوى |
|---|---|
| `v_powerbi_kpi` | صف واحد بملخص KPI شامل (مهام، موظفون، حضور، إجازات، تنبيهات). |
| `v_powerbi_tasks` | كل المهام مع اسم القسم واسم المكلَّف. |
| `v_powerbi_attendance` | كل سجلات الحضور مع اسم الموظف والقسم. |
| `v_powerbi_leaves` | كل الإجازات/الأذونات مع اسم الموظف والقسم. |
| `v_powerbi_employees` | كل الموظفين غير المؤرشفين مع القسم والمدير. |
| `v_powerbi_units` | كل الأقسام مع القسم الأب وعدد الموظفين. |
| `v_powerbi_daily_flow` | تجميع يومي (مهام + حضور + إجازات) حسب اليوم السعودي. |
| `v_powerbi_overdue` | المهام المتأخرة مع عدد ساعات التأخير. |
| `v_powerbi_unit_summary` | ملخص لكل قسم (موظفون، مهام، حضور، قوالب نشطة). |

### حالات المهام (status)
`new` = جديدة · `in_progress` = قيد التنفيذ · `under_review` = تحت المراجعة · `completed` = مكتملة · `overdue` = متأخرة · `cancelled` = ملغاة · `paused` = موقوفة.

---

## 5) ملاحظات مهمة

- **المنطقة الزمنية**: كل الطوابع الزمنية مخزّنة بصيغة **UTC**.
  - في عرض `v_powerbi_daily_flow`، عمود `flow_date` مبني على **اليوم السعودي (UTC+3)**.
  - لباقي الأعمدة، أضف **3 ساعات** في Power BI للحصول على التوقيت السعودي (عمود محسوب: `[العمود] + #duration(0,3,0,0)`).
- **المهام المؤرشفة**: عدّادات `unit_summary` و`overdue` تستثني المؤرشفة (`archivedAt IS NULL`).
- **الملاحظات الإدارية/التأديبية**: لا يوجد جدول مخصص، بل تُخزَّن في `approval_requests` بنوع `disciplinary_action` (متاح في `v_powerbi_kpi` كعداد `pending_disciplinary`).

---

## 6) كيف أُحدّث الـ Views؟

الـ Views تُعاد إنشاؤها بأمان (idempotent) من سكربت:

```bash
node scripts/create_powerbi_views.mjs
```

- يطبق `DROP VIEW IF EXISTS` ثم `CREATE VIEW` لكل View.
- **لا يلمس أي بيانات** — يضيف/يستبدل الـ Views فقط.
- أعد تشغيله كلما عدّلت تعريفات الـ Views في السكربت.

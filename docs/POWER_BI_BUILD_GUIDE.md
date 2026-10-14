# دليل بناء تقارير Power BI — منصة رَكيزة

هذا الدليل يشرح خطوة-بخطوة بناء تقرير Power BI كامل اعتمادًا على الـ **SQL Views**
الجاهزة (`v_powerbi_*`) وملف **theme** ومقاييس **DAX**.

---

## 0) المتطلبات المسبقة

| # | الخطوة | المرجع |
|---|---|---|
| 1 | الاتصال بقاعدة البيانات (TiDB) | `docs/POWER_BI_CONNECT.md` |
| 2 | استيراد **الـ Theme** | `docs/powerbi-theme-rakiza.json` |
| 3 | لصق **مقاييس DAX** في جدول `_Measures` | `docs/powerbi-measures.dax` |
| 4 | تثبيت خط **Tajawal** على الجهاز (Google Fonts) | ضروري لهوية المنصة |

### استيراد الـ Theme
1. من شريط **View** → اختر **Themes** → **Browse for themes**.
2. اختر ملف `powerbi-theme-rakiza.json`.

### تفعيل RTL (عربي)
1. **File** → **Options and settings** → **Options** → **Regional Settings**.
2. اضبط اللغة على **Arabic (Saudi Arabia)**، وفعّل **Use right-to-left layout**.
3. أعد فتح الملف ليطبَّق الاتجاه.

---

## 1) العلاقات بين الجداول (Relationships)

أنشئ العلاقات التالية يدويًا (Model view → Manage relationships)، كلها **Many-to-one**:

| الجدول (Many) | العمود | الجدول (One) | العمود | الاتجاه |
|---|---|---|---|---|
| `v_powerbi_tasks` | `unit_id` | `v_powerbi_units` | `unit_id` | واحد→متعدد |
| `v_powerbi_tasks` | `assignee_id` | `v_powerbi_employees` | `employee_id` | واحد→متعدد |
| `v_powerbi_attendance` | `profile_id` | `v_powerbi_employees` | `employee_id` | واحد→متعدد |
| `v_powerbi_attendance` | `unit_id` | `v_powerbi_units` | `unit_id` | واحد→متعدد |
| `v_powerbi_leaves` | `profile_id` | `v_powerbi_employees` | `employee_id` | واحد→متعدد |
| `v_powerbi_leaves` | `unit_id` | `v_powerbi_units` | `unit_id` | واحد→متعدد |
| `v_powerbi_employees` | `unit_id` | `v_powerbi_units` | `unit_id` | واحد→متعدد |
| `v_powerbi_daily_flow` | `flow_date` | `Dim_Date` | `Date` | واحد→متعدد |

> **جدول التاريخ (Dim_Date):** أنشئه لتشغيل Time Intelligence. أبسط طريقة:
> Model → New table → `Dim_Date = CALENDAR(MIN('v_powerbi_daily_flow'[flow_date]), MAX('v_powerbi_daily_flow'[flow_date]))`
> ثم اربطه بـ `flow_date`.

---

## 2) الصفحات السبع المقترحة

### الصفحة 1 — نظرة عامة (KPI Overview)

**الهدف:** صورة سريعة عن أداء المنصة.

| الـ Visual | النوع | الحقل/المقياس | التنسيق |
|---|---|---|---|
| إجمالي المهام | Card (KPI) | `[Total Tasks]` | حجم خط كبير (categoryLabel) |
| المهام المكتملة | Card | `[Completed Tasks]` | لون جيد أخضر |
| المهام المتأخرة | Card | `[Overdue Tasks]` | لون سيئ (تراكوتا) |
| معدل الإنجاز | Card | `[Completion Rate]` | تنسيق نسبة % |
| توزيع الحالات | Donut chart | Legend: `status` · Values: `[Total Tasks]` | الألوان من theme |
| المهام حسب القسم | Clustered column | Axis: `unit_name` · Values: `[Total Tasks]` | — |

### الصفحة 2 — أداء الأقسام

**الهدف:** مقارنة الأقسام (شؤون الملازمين، تسليم الأحكام، القسم النسائي...).

| الـ Visual | النوع | الحقل | التنسيق |
|---|---|---|---|
| ملخص الأقسام | Matrix | Rows: `unit_name` · Values: `[Total Tasks]`, `[Completed Tasks]`, `[Overdue Tasks]`, `[Completion Rate]` | تنسيق % للمعدل |
| المهام الكلية لكل قسم | Bar chart | Axis: `unit_name` · Values: `[Total Tasks]` | ترتيب تنازلي |
| الموظفون لكل قسم | Table | `unit_name`, `employee_count` (من `v_powerbi_units`) | — |

### الصفحة 3 — أداء الموظفين

**الهدف:** تقييم إنجاز كل موظف.

| الـ Visual | النوع | الحقل | التنسيق |
|---|---|---|---|
| جدول أداء الموظفين | Table | Columns: `assignee_name`, `[Total Tasks]`, `[Completed Tasks]`, `[Overdue Tasks]`, `[Avg Completion Days]` | فلترة حسب القسم |
| أفضل 10 موظفين إنجازًا | Bar chart | Axis: `assignee_name` (Top N=10) · Values: `[Completed Tasks]` | Top N filter |
| متوسط أيام الإنجاز | Card | `[Avg Completion Days]` | رقم عشري |

### الصفحة 4 — الحضور

**الهدف:** متابعة انضباط الحضور.

| الـ Visual | النوع | الحقل | التنسيق |
|---|---|---|---|
| نسبة الحضور | Card | `[Attendance Rate]` | تنسيق % |
| أيام الحضور / التأخر | Cards | `[Present Days]`, `[Late Days]` | أخضر / تراكوتا |
| الحضور اليومي | Line chart | Axis: `record_date` · Values: `[Present Days]`, `[Late Days]` | خطان |
| توزيع حالات الحضور | Donut | Legend: `status` · Values: `COUNT(attendance_id)` | — |

### الصفحة 5 — الإجازات

**الهدف:** متابعة طلبات الإجازات والأذونات.

| الـ Visual | النوع | الحقل | التنسيق |
|---|---|---|---|
| سجل الإجازات | Table | `profile_name`, `request_type`, `start_at`, `end_at`, `duration_minutes`, `status` | فلترة حسب الحالة |
| الإجازات حسب الشهر | Stacked column | Axis: `start_at` (شهر) · Legend: `status` · Values: `COUNT(leave_id)` | — |
| الموافقات المعلّقة | Card | `COUNTROWS(FILTER(v_powerbi_leaves, status="pending"))` | — |

### الصفحة 6 — المهام المتأخرة

**الهدف:** متابعة المهام العالقة قبل تفاقمها.

| الـ Visual | النوع | الحقل | التنسيق |
|---|---|---|---|
| جدول المتأخرات | Table | `title`, `assignee_name`, `unit_name`, `due_at`, `overdue_hours` (من `v_powerbi_overdue`) | ترتيب تنازلي بـ `overdue_hours` |
| عدد المتأخرات | Card | `[Overdue Tasks]` | تراكوتا |
| المتأخرات حسب القسم | Bar chart | Axis: `unit_name` · Values: `[Overdue Tasks]` | — |

### الصفحة 7 — التدفق اليومي والتوقعات

**الهدف:** اتجاه النشاط اليومي وتوقع المستقبل.

| الـ Visual | النوع | الحقل | التنسيق |
|---|---|---|---|
| التدفق اليومي | Area chart | Axis: `flow_date` · Values: `tasks_created`, `tasks_completed` | مساحتان |
| التوقع الخطي | Line chart | Axis: `flow_date` · Values: `tasks_completed` + `[Forecast Completed Next 7 Days]` | خط متقطع للتوقع |
| منتقي النطاق | Slicer | `flow_date` (من `Dim_Date`) | Between |

---

## 3) خطوات الترتيب النهائي

1. **طبّق الـ Theme** ثم فعّل **RTL** (راجع القسم 0).
2. **أنشئ العلاقات** (القسم 1) وتأكد من اتجاهها واحد→متعدد.
3. **أنشئ جدول `_Measures`** والصق كل مقاييس DAX فيه.
4. **ابنِ الصفحات السبع** بالترتيب أعلاه.
5. **أضف Slicers مشتركة** (القسم، الفترة) واربطها بكل الصفحات (View → Sync slicers).
6. **راجع الألوان**: تأكد أن الحالات (completed=أخضر، overdue=تراكوتا) متسقة.

---

## 4) ملاحظات تنسيقية مهمة

- **المنطقة الزمنية**: الطوابع UTC. أضف 3 ساعات عند الحاجة للتوقيت السعودي
  (عمود محسوب: `[الحقل] + TIME(3,0,0)`). في `v_powerbi_daily_flow` عمود `flow_date` سعودي بالفعل.
- **خط Tajawal**: ثبّته على الجهاز قبل فتح Power BI، وإلا سيستبدله بخط افتراضي.
- **تنسيق النسب**: اضبط أي measure نسبة على **Percentage** من شريط Measure tools.
- **التحديث**: حدّث البيانات من **Home → Refresh** (اتصال مباشر بالـ DB عبر الـ Views).

---

## 5) المراجع داخل المشروع

| الملف | الوصف |
|---|---|
| `docs/POWER_BI_CONNECT.md` | خطوات الاتصال بـ TiDB + قائمة الـ Views |
| `docs/powerbi-theme-rakiza.json` | Theme هوية رَكيزة |
| `docs/powerbi-measures.dax` | مقاييس DAX جاهزة |
| `scripts/create_powerbi_views.mjs` | إعادة إنشاء الـ Views |


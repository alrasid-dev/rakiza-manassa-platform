# رَكيزة — منصة المحكمة الداخلية

نظام تشغيل داخلي للمحكمة العمالية بالرياض: المهام، الحضور، البريد الداخلي، الاعتمادات، التفويض، المداورة، ومؤشرات القيادة.

## التشغيل المحلي

```bash
pnpm install
pnpm dev
```

افتح `http://localhost:3000` بعد ضبط ملف البيئة على جهاز التشغيل فقط. لا ترفع أسرار الدخول إلى غيث هاب.

## الاستضافة
رَكيزة مشروع مستقل عن AZ Alpha Vision. نفس فكرة الربط (غيث هاب + Vercel) لكن حساباً ومستودعاً ورابطاً خاصاً بها.

- مستودع رَكيزة: https://github.com/alrasid-dev/rakiza-manassa-platform
- رابط رَكيزة النظيف: https://alrasid-dev.github.io/rakiza-manassa-platform/
- رابط التشغيل الحي المجاني (Vercel + HTTPS): https://rakiza-manassa-platform.vercel.app
- مستودع المشروع الأول: https://github.com/alrasid-dev/AZ_Alpha-Vision
- رابط المشروع الأول: https://azalphavision.vercel.app

عند الاستيراد في Vercel اختاري «Create New Project» باسم `rakiza-manassa-platform`، ولا تضيفيه داخل مشروع AZ Alpha Vision.

البناء المحلي: `pnpm build` ثم `pnpm start`. مسار الصحة: `/health`.

صفحات غيث هاب تعرض الواجهة والتثبيت فقط. تسجيل الدخول يعمل على خادم التشغيل (Vercel/Node) لأن طلبات `/api/trpc` تحتاج خادماً وليس ملف HTML.

## الاستضافة المجانية الآمنة (Vercel + HTTPS)

- الرابط الآمن الحالي: https://rakiza-manassa-platform.vercel.app — النطاق الفرعي المجاني مع شهادة HTTPS تلقائية مجددة تلقائياً.
- فحص الجهوزية: https://rakiza-manassa-platform.vercel.app/health (يُظهر جهوزية قاعدة البيانات دون كشف أي سر).
- طلبات `POST` إلى `/api/trpc` محمية بحاجز الأصل (Origin Guard) في الخادم، فتُرفض الطلبات من أصل غير مطابق.
- المجاني هو النطاق الفرعي الرسمي للمنصة (`*.vercel.app` أو `*.netlify.app`). النطاق المخصص باسم الجهة مدفوع سنوياً، وعند ربطه يبقى HTTPS مجانياً وتلقائياً.
- متغيرات البيئة اللازمة في لوحة Vercel (بأسماء فقط، والقيم لا تُحفظ في المستودع): `DATABASE_URL`، `JWT_SECRET`، `PLATFORM_OWNER_EMAIL`، `FIREBASE_SERVICE_ACCOUNT_JSON`، `VITE_FIREBASE_*`، `BREVO_API_KEY`، `BREVO_SENDER_EMAIL`، `VAPID_*`، و`WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` (اختياريان).

## سياسة الدخول المعتمدة

| البند | القاعدة |
|---|---|
| البريد المسموح | `@moj.gov.sa` فقط، مع استثناء وحيد لبريد مالك المنصة `rakizaplatform@gmail.com` (يُضبط بـ `PLATFORM_OWNER_EMAIL`) |
| رمز المرور | يُنشأ أول مرة من 6 أرقام، ثم يُدخله المستخدم في كل دخول دون تحقق إضافي |
| البصمة (مفتاح المرور) | تُسجَّل من بوابة البصمة بعد أول دخول، ويصبح الدخول من الجهاز نفسه بالبصمة أو Face ID دون كشف البصمة للمنصة |
| أيقونة المالك | أسفل شاشة الدخول `/login`، ولا تُقبل إلا بالبريد الرسمي أو بريد المالك |
| البريد الإضافي | من «إعدادات الموظف» ← «إدارة بريد الإشعارات» (`/email-settings`)، مع اختيار قناة الإرسال: الرسمي فقط، أو الإضافي، أو البريدان معاً — ولا تُستخدم القناة الإضافية قبل توثيقها |

قواعد السياسة في الشيفرة: `server/routers/court.ts` (مسار `passcode`) و`client/src/components/PasscodeAuthPanel.tsx` لرمز المرور، و`server/court-service.ts` (`isAllowedLoginEmail` و`getNotificationEmailRecipients`) للبريد وقنوات التنبيه.

## تثبيت المنصة كتطبيق (مجاناً)

صفحة الويب نفسها تطبيق قابل للتثبيت على ويندوز وماك ولينكس وأندرويد وآيفون:

1. افتح [صفحة التثبيت](https://alrasid-dev.github.io/rakiza-manassa-platform/apps).
2. أندرويد: ثبّت من كروم، أو حمّل [ملف APK المجاني](https://github.com/alrasid-dev/rakiza-manassa-platform/releases/download/android-latest/rakiza-manassa.apk).
3. آيفون وآيباد: من سفاري اضغط المشاركة ثم «إضافة إلى الشاشة الرئيسية».
4. اللابتوب: من كروم أو إيدج اختر «تثبيت رَكيزة».

مشروع iOS الجاهز للفتح في Xcode يُبنى تلقائياً عند الدفع إلى `main` (لنشره على آب ستور يلزم حساب مطوّر آبل لاحقاً). تطبيق آيفون المجاني الفوري هو تثبيت صفحة الويب.

## الاستخدام

راجع [دليل-الاستخدام.md](./دليل-الاستخدام.md).

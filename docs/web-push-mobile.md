# إشعارات الجوال في رَكيزة

## النطاق

تستخدم رَكيزة مسارين لتسليم الإشعارات اللحظية إلى الجهاز، ويعملان معاً بلا تعارض:

| المسار | كيف يصل الإشعار | ما يحتاجه في بيئة التشغيل |
| --- | --- | --- |
| **Firebase Cloud Messaging (مستحسن)** | يُسجّل الجهاز رمز FCM عبر مفتاح VAPID العام، ويرسل الخادم عبر FCM بحساب الخدمة | `FIREBASE_SERVICE_ACCOUNT_JSON` و`VITE_FIREBASE_*` |
| **Web Push الأصلي** | يُسجّل الجهاز اشتراك push مباشراً، ويرسل الخادم عبر مكتبة `web-push` بمفاتيح VAPID | `VAPID_SUBJECT` و`VAPID_PUBLIC_KEY` و`VAPID_PRIVATE_KEY` |

**المفتاح العام للإشعارات محفوظ في `shared/push.ts`** لأنه ليس سراً: المتصفح يستلمه في كل اشتراك، ويقبل إجراء `notifications.pushConfig` إرجاعه للواجهة. أما المفتاح الخاص وحساب خدمة Firebase فتبقى أسراراً في بيئة التشغيل فقط ولا تُحفظ في المستودع.

يطلب التطبيق الإذن من خلال زر واضح بعد تسجيل الدخول. هذا مهم لأن المتصفحات الحديثة، وخصوصاً Safari، تشترط أن يكون طلب الإذن نتيجة تفاعل مباشر من المستخدم [1] [2].

## ما تم تنفيذه

| الجزء | التنفيذ |
| --- | --- |
| قاعدة البيانات | جدول `push_subscriptions` يرتبط بـ `profileId` ويحفظ `endpoint` و`p256dh` و`auth` مع منع تكرار endpoint، وجدول `fcm_tokens` لرموز Firebase. |
| الخادم | `notifications.pushConfig` و`subscribe` و`unsubscribe` و`fcmSubscribe` و`fcmUnsubscribe` و`test` و`fcmTest` بإجراءات محمية بالحساب الحالي. |
| الجاهزية | `pushReadiness()` في `server/push-service.ts` تصرّح بمسار التسليم المتاح (`webPushEnabled` و`fcmEnabled` وسبب التعطل) دون كشف أي سر. |
| الإرسال | `server/push-service.ts` يرسل عبر Web Push وFCM معاً، ويحذف الاشتراك عند استجابة 404 أو 410. |
| عامل الخدمة | `client/public/sw.js` يستقبل `push` ويعرض إشعاراً عربياً مع اهتزاز وفتح المهمة عند النقر. |
| الواجهة | بطاقة عربية في لوحة التحكم للتفعيل والإيقاف، تختار مسار التسليم الفعلي (Firebase أولاً ثم Web Push) وتعرض ما ينقص بدقة عند عدم اكتمال الإعداد. |
| المولّد | `scripts/generate-vapid-keys.mjs` يُنتج زوج VAPID صالحاً لمسار Web Push الأصلي بأمر واحد. |

## خطوات الاكتمال في بيئة التشغيل

1. مسار Firebase: أضف `FIREBASE_SERVICE_ACCOUNT_JSON` (من Firebase Console ← Project settings ← Service accounts) و`VITE_FIREBASE_API_KEY` و`VITE_FIREBASE_AUTH_DOMAIN` و`VITE_FIREBASE_PROJECT_ID` و`VITE_FIREBASE_STORAGE_BUCKET` و`VITE_FIREBASE_MESSAGING_SENDER_ID` و`VITE_FIREBASE_APP_ID`. المتغير `VITE_FIREBASE_VAPID_KEY` اختياري لأن القيمة المعتمدة موجودة في الكود.
2. مسار Web Push الأصلي (بديل مستقل): شغّل `node scripts/generate-vapid-keys.mjs` وأضف `VAPID_SUBJECT` و`VAPID_PUBLIC_KEY` و`VAPID_PRIVATE_KEY`.
3. أعد النشر، ثم افتح بطاقة «فعّل تنبيهات المهام على هذا الجهاز» واضغط **تفعيل التنبيهات**، ثم استخدم زر **اختبار Firebase** أو **اختبار Web Push** حسب المسار الجاهز.


## اختبار Android

يُفتح الرابط الرسمي عبر Chrome أو متصفح يدعم Service Worker وPush على جهاز Android. بعد تسجيل الدخول، يضغط المستخدم **تفعيل التنبيهات** ويوافق على الإذن. ثم يُنشئ المسؤول مهمة مسندة إلى ذلك المستخدم، ويغلق تبويب الموقع أو يخرج من التطبيق، مع إبقاء اتصال البيانات أو Wi‑Fi فعالاً. عند وصول الإشعار يجب أن يظهر في مركز إشعارات Android، وعند النقر عليه تُفتح المهمة ذات الصلة.

يمكن التحقق من الإعدادات من **إعدادات الجهاز ← الإشعارات ← Chrome أو رَكيزة**. مستوى الصوت والاهتزاز يخضعان لقنوات الإشعارات ووضع عدم الإزعاج في الجهاز؛ لا يستطيع Web Push فرض صوت يتجاوز إعدادات النظام.

## اختبار iPhone وiPad

يدعم Web Push لتطبيقات الويب المضافة إلى الشاشة الرئيسية ابتداءً من iOS وiPadOS 16.4. لذلك يجب فتح الرابط في Safari، ثم استخدام **مشاركة ← إضافة إلى الشاشة الرئيسية**، وتشغيل رَكيزة من الأيقونة الجديدة، ثم الضغط على **تفعيل التنبيهات** والموافقة على الإذن. بعد ذلك تُنشأ مهمة اختبارية ويُغلق تطبيق رَكيزة. يفترض أن يظهر الإشعار في شاشة القفل أو مركز الإشعارات عند توفر الاتصال [1] [3].

لا ينبغي طلب الإذن قبل التثبيت على الشاشة الرئيسية في iOS، كما لا ينبغي استخدام إشعار صامت؛ يجب على عامل الخدمة عرض الإشعار فور استلام حدث `push` [1]. يمكن ضبط الصوت والتركيز من **الإعدادات ← الإشعارات ← رَكيزة**.

## حدود الاختبار الحالي

تم التحقق آلياً من صحة المفتاح العام المعتمد (65 بايت بترميز base64url ويقبله `web-push`)، ومن منطق اختيار مسار التسليم، ومن إخفاء السر في استجابة `pushConfig`، ومن توليد زوج VAPID بأمر واحد. بقي الاختبار التشغيلي النهائي بحاجة إلى جهاز Android وiPhone فعليين وحسابي اختبار: حساب مستلم له اشتراك مسجل، وحساب مسؤول ينشئ مهمة له. نجاح تسجيل الاشتراك وحده لا يثبت التسليم الفعلي عبر شبكة الدفع حتى يُجرى اختبار الإسناد والجهاز مغلقاً.

## مراجع

[1]: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ "Web Push for Web Apps on iOS and iPadOS — WebKit"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API "Using the Notifications API — MDN"
[3]: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers "Sending web push notifications in web apps and browsers — Apple Developer"

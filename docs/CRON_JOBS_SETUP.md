# جدولة الوظائف عبر GitHub Actions

> بديل عن خدمة Heartbeat (`webdevtoken.v1.WebDevService`) التي لم تكن مهيأة.
> يعتمد هذا المسار على GitHub Actions لاستدعاء مسارات `/api/scheduled/*` كل 5 دقائق،
> مع تحقق أمني عبر هيدر `x-cron-secret`.

## كيف يعمل النظام

```
GitHub Actions (كل 5 دقائق)
        │  POST /api/scheduled/<job>
        │  هيدر: x-cron-secret: <CRON_SECRET>
        ▼
خادم Vercel (server/_core/app.ts)
        │  isValidCronSecret(req) → يطابق CRON_SECRET؟
        ▼
تنفيذ الوظيفة (حضور/تصعيد/إجازات/بريد…) وإعادة JSON
```

1. الـ workflow `.github/workflows/cron-jobs.yml` يعمل كل **5 دقائق** ويستدعي 8 وظائف بالترتيب.
2. كل طلب يحمل هيدر `x-cron-secret`.
3. في الخادم، `server/scheduled/cron-auth.ts` يتحقق أن الهيدر مطابق لـ `CRON_SECRET`
   (مقارنة آمنة ضد هجمات التوقيت)؛ عند التطابق تُنفَّذ الوظيفة مباشرة.
4. عند غياب الهيدر أو عدم تطابقه، يبقى المسار القديم (Heartbeat عبر `taskUid`) كما هو —
   الطريقتان تعملان معاً.

## المتغيرات المطلوبة

| المتغير | الوصف | أين يُضبط |
|---|---|---|
| `RAKIZA_BASE_URL` | رابط تطبيق Vercel بدون `/` في النهاية (مثلاً `https://rakiza.vercel.app`) | GitHub Secrets |
| `RAKIZA_CRON_SECRET` | المفتاح السري للتحقق (نفس قيمة `CRON_SECRET` أدناه) | GitHub Secrets |
| `CRON_SECRET` | نفس المفتاح، يقرؤه الخادم من بيئته | Vercel Environment Variables + `.env.local` (محلياً) |

### توليد المفتاح السري

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ **لا تضع قيمة المفتاح في هذا الملف أو أي ملف مرفوع إلى git.**
> احفظه في GitHub Secrets وVercel فقط، وأبقِ نسخة محلية في `.env.local` (مستثنى من git).

## خطوات الإعداد

### 1) GitHub Secrets

من مستودع GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

- `RAKIZA_BASE_URL` = رابط Vercel (بدون `/` في النهاية).
- `RAKIZA_CRON_SECRET` = المفتاح الذي ولّدته.

### 2) Vercel Environment Variables

من لوحة Vercel للمشروع: **Settings → Environment Variables**:

- `CRON_SECRET` = نفس المفتاح (لبيئات Production وPreview وDevelopment).

### 3) محلياً

أضف إلى `.env.local` (مستثنى من git):

```
CRON_SECRET=<المفتاح>
```

## التشغيل اليدوي (اختبار)

من المستودع: **Actions → Rakiza Cron Jobs → Run workflow → Run workflow**.

أو يدوياً عبر curl:

```bash
curl -X POST "https://<RAKIZA_BASE_URL>/api/scheduled/attendance-confirmation" \
  -H "x-cron-secret: <CRON_SECRET>" \
  -H "Content-Type: application/json"
```

الاستجابة الناجحة تتضمن `"ok": true` و `"via": "cron-secret"`.

لمتابعة النتائج: **Actions → Rakiza Cron Jobs** → افتح أي run → اطّلع على logs خطوة `Trigger Scheduled Jobs`.

## تعديل الجدولة أو الوظائف

- **تغيير التكرار:** عدّل سطر `cron:` في `.github/workflows/cron-jobs.yml`
  (أقل تكرار مدعوم هو كل 5 دقائق: `*/5 * * * *`).
- **إضافة/إزالة وظيفة:** عدّل مصفوفة `JOBS` داخل نفس الملف.
- **إيقاف وظيفة معينة:** احذفها من مصفوفة `JOBS`.

## ملاحظات

- `internal-mail-dispatch` مُصمم أصلاً ليعمل **كل دقيقة**، لكن GitHub Actions يقف عند
  5 دقائق، لذا سيعمل كل 5 دقائق — تأخير مقبول لبريد داخلي مؤجل.
- جدولة GitHub Actions قد تتأخر بضع دقائق تحت الضغط، وتُعطَّل تلقائياً بعد 60 يوماً
  من خمول المستودع (تختفي هذه المشكلة مع أي نشاط على المستودع).

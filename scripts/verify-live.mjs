#!/usr/bin/env node
/**
 * فحص حي للنسخة المنشورة: يتأكد أن الموقع يعمل فعلاً وأن مزايا المنصة منشورة.
 * يُستخدم بعد النشر مع إعادة محاولة تلقائية، ويعيد رمز فشل عند أي خلل.
 */
const BASE = (process.env.RAKIZA_BASE_URL || "https://rakiza-manassa-platform.vercel.app").replace(/\/$/, "");
const ATTEMPTS = Number(process.env.RAKIZA_ATTEMPTS || 5);
const DELAY_MS = Number(process.env.RAKIZA_RETRY_DELAY_MS || 20000);

const checks = [];
function record(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  return { status: response.status, body: await response.text() };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runChecks() {
  const health = await fetchText(`${BASE}/health`);
  let healthJson = null;
  try { healthJson = JSON.parse(health.body); } catch { /* تجاهل */ }
  record("health يعمل ويعيد JSON", health.status === 200 && Boolean(healthJson?.ok), `status=${health.status}`);
  record("قاعدة البيانات مهيّأة", healthJson?.databaseConfigured === true, `databaseConfigured=${healthJson?.databaseConfigured}`);

  const login = await fetchText(`${BASE}/login`);
  record("صفحة الدخول تُخدم من الخادم", login.status === 200 && login.body.includes("/assets/index-"), `status=${login.status}`);

  const assetPath = login.body.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  record("مسار حزمة الواجهة موجود", Boolean(assetPath), assetPath ?? "غير موجود");

  if (assetPath) {
    const bundle = await fetchText(`${BASE}${assetPath}`);
    const js = bundle.body;
    record("حزمة الواجهة تُحمَّل", bundle.status === 200 && js.length > 100000, `len=${js.length}`);
    record("ميزة قناة البريد الإضافي", js.includes("notificationPreference"));
    record("قنوات إرسال التنبيهات الثلاث", js.includes("البريد الرسمي فقط") && js.includes("البريد الإضافي فقط") && js.includes("البريدان معاً"));
    record("رمز المرور من 6 أرقام", js.includes("رمز المرور") && js.includes("6 أرقام"));
    record("رسالة التحقق من رمز المرور", js.includes("أدخل رمز المرور المكوّن من 6 أرقام"));
    record("أيقونة دخول المالك", js.includes("دخول المالك"));
    record("استثناء بريد المالك", js.includes("rakizaplatform@gmail.com"));
    record("قيد النطاق الرسمي", js.includes("moj\\.gov\\.sa"));
    record("إدارة بريد الإشعارات", js.includes("email-settings"));
    record("اسم زر إرسال المساعد (وصول)", js.includes("إرسال الرسالة إلى المساعد"));
    record("اسم موعد الاجتماع (وصول)", js.includes("موعد الاجتماع"));
  }

  const trpcUrl = `${BASE}/api/trpc/system.health?batch=1&input=${encodeURIComponent('{"0":{"json":{"timestamp":1}}}')}`;
  const trpc = await fetchText(trpcUrl);
  record("واجهة tRPC الخادمية تعمل", trpc.status === 200 && trpc.body.includes('"ok":true'), `status=${trpc.status}`);

  return checks.filter(check => !check.ok);
}

async function main() {
  console.log(`فحص حي للنسخة المنشورة: ${BASE}`);
  let failed = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    checks.length = 0;
    try {
      failed = await runChecks();
    } catch (error) {
      failed = [{ name: "اتصال بالموقع", ok: false, detail: error instanceof Error ? error.message : String(error) }];
      console.log(`FAIL | اتصال بالموقع | ${failed[0].detail}`);
    }
    if (failed.length === 0) {
      console.log("النتيجة: النسخة المنشورة سليمة بالكامل.");
      return;
    }
    console.log(`المحاولة ${attempt} من ${ATTEMPTS}: ${failed.length} فحصاً فاشلاً.`);
    if (attempt < ATTEMPTS) await sleep(DELAY_MS);
  }
  console.error(`النتيجة: فشل ${failed.length} فحصاً بعد ${ATTEMPTS} محاولات: ${failed.map(item => item.name).join(", ")}`);
  process.exit(1);
}

main();

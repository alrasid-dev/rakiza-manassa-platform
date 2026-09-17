/**
 * توليد زوج مفاتيح VAPID لتشغيل مسار Web Push الأصلي في رَكيزة.
 *
 * الاستخدام:
 *   node scripts/generate-vapid-keys.mjs
 *
 * ثم تُضاف القيم في بيئة التشغيل (Vercel أو ملف .env المحلي غير المُرفوع):
 *   VAPID_SUBJECT / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 *
 * تنبيه: المفتاح العام آمن للنشر، أما المفتاح الخاص فلا يُرفع إلى المستودع أو أي سجل عام.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const publicBytes = Buffer.from(publicKey, "base64url").byteLength;
const privateBytes = Buffer.from(privateKey, "base64url").byteLength;

if (publicBytes !== 65 || privateBytes !== 32) {
  console.error(`تعذر توليد زوج مفاتيح صالح: العام ${publicBytes} بايت والخاص ${privateBytes} بايت.`);
  process.exit(1);
}

console.log([
  "زوج مفاتيح VAPID جديد لتشغيل إشعارات Web Push في رَكيزة:",
  "",
  `VAPID_SUBJECT=mailto:rakizaplatform@gmail.com`,
  `VAPID_PUBLIC_KEY=${publicKey}`,
  `VAPID_PRIVATE_KEY=${privateKey}`,
  "",
  "أضف الأسطر الثلاثة في متغيرات بيئة التشغيل ثم أعد النشر.",
  "لا تُرفع قيمة VAPID_PRIVATE_KEY إلى المستودع أو إلى أي قناة عامة.",
].join("\n"));

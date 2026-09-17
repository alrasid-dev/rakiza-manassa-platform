import app from "./handler.js";

// تصدير معالج Serverless صريح يفوّض الطلب إلى تطبيق Express، لضمان تشغيل
// الواجهة ومسارات tRPC على Vercel بدل إرجاع محتوى الحزمة الخام.
export default function handler(req: unknown, res: unknown) {
  return (app as (req: unknown, res: unknown) => unknown)(req, res);
}


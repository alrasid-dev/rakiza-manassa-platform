import type { Express, NextFunction, Request, Response } from "express";
import { ENV } from "./env";

/**
 * سياسة الدخول الافتراضية (الإعدادات السحابية الافتراضية).
 * لا تعتمد على أي متغير بيئة، لذا تظل متاحة دائماً حتى عند غياب ملفات
 * متغيرات البيئة المحلية (.env / .env.local) أو متغيرات السحابة.
 */
export const LOGIN_POLICY = {
  /** النطاق الرسمي المقبول لدخول الموظفين (بريد وزارة العدل). */
  officialEmailDomain: "moj.gov.sa",
  /** البريد الاستثنائي الوحيد المسموح خارج النطاق الرسمي (قناة المالك عبر Gmail). */
  ownerEmail: ENV.platformOwnerEmail || "rakizaplatform@gmail.com",
  /** الرمز الدائم (رمز PIN الدائم/التحقق الدائم) مفعّل. */
  permanentCodeEnabled: true,
  /** بصمة الموظفين (WebAuthn/مفتاح المرور) مدعومة. */
  biometricSupported: true,
};

export type LoginConfigStatus = {
  ok: boolean;
  /** true عندما يعمل الوضع البديل بسبب نقص متغيرات البيئة. */
  fallback: boolean;
  policy: typeof LOGIN_POLICY;
  firebaseWebConfigured: boolean;
  firebaseServiceAccountConfigured: boolean;
  databaseConfigured: boolean;
  ownerEmail: string;
  missing: string[];
};

function present(name: string): boolean {
  if (typeof process === "undefined") return false;
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * يجمع إعدادات الدخول بذكاء:
 * - يقرأ متغيرات البيئة المتاحة (محلية كانت أم سحابية).
 * - يتخطى النواقص دون رمي أي خطأ.
 * - يعيد دائماً رداً ناجحاً مع الأسماء الناقصة حتى تتعامل الواجهة بأمان.
 */
export function resolveLoginConfig(): LoginConfigStatus {
  const firebaseWebKeys = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
  ] as const;

  const missing: string[] = firebaseWebKeys.filter(key => !present(key));
  if (!present("FIREBASE_SERVICE_ACCOUNT_JSON")) missing.push("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!present("DATABASE_URL") && !present("VITE_DATABASE_URL")) missing.push("DATABASE_URL");

  const firebaseWebConfigured = firebaseWebKeys.every(key => present(key));
  const firebaseServiceAccountConfigured = present("FIREBASE_SERVICE_ACCOUNT_JSON");
  const databaseConfigured = present("DATABASE_URL") || present("VITE_DATABASE_URL");

  return {
    ok: true,
    fallback: missing.length > 0,
    policy: LOGIN_POLICY,
    firebaseWebConfigured,
    firebaseServiceAccountConfigured,
    databaseConfigured,
    ownerEmail: LOGIN_POLICY.ownerEmail,
    missing,
  };
}

/**
 * مسار الـ API البديل (Fallback Handler):
 * يعيد إعدادات الدخول الافتراضية السحابية دائماً بنجاح، ويتخطى نقص
 * متغيرات البيئة المحلية، لتبقى واجهة تسجيل الدخول متصلة دون خطأ 500.
 */
export function registerLoginConfigRoutes(app: Express) {
  app.get("/api/login-config", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(resolveLoginConfig());
  });

  app.get("/api/login-fallback", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(resolveLoginConfig());
  });
}

/**
 * معالج أخطاء عام يحوّل أي خطأ غير مُعالج (500) إلى رد منظم
 * مع إعدادات الدخول البديلة بدل استجابة 500 خام تكسر الواجهة.
 */
export function loginFallbackErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error("[login-fallback] Unhandled route error:", error);
  res.status(503).json({
    ok: false,
    fallback: true,
    message: "تعذّر إتمام الطلب حالياً، ويُعرض وضع بديل آمن دون قطع الخدمة.",
    config: resolveLoginConfig(),
  });
}

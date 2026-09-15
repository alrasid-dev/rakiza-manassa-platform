function readEnv(...names: string[]) {
  for (const name of names) {
    const value = typeof process !== "undefined" ? process.env[name] : undefined;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** قيم احتياطية لوضع التشغيل المستقل (Mock Mode) عند غياب الأسرار الخارجية. */
const MOCK_APP_ID = "rakiza-mock-app";
const MOCK_COOKIE_SECRET = "rakiza-mock-session-secret-v1-do-not-use-in-prod";

export const ENV = {
  appId: readEnv("VITE_APP_ID") || MOCK_APP_ID,
  cookieSecret: readEnv("JWT_SECRET", "VITE_JWT_SECRET") || MOCK_COOKIE_SECRET,
  databaseUrl: readEnv("DATABASE_URL", "VITE_DATABASE_URL"),
  oAuthServerUrl: readEnv("OAUTH_SERVER_URL"),
  ownerOpenId: readEnv("OWNER_OPEN_ID"),
  platformOwnerEmail: (readEnv("PLATFORM_OWNER_EMAIL") || "rakizaplatform@gmail.com").toLowerCase(),
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: readEnv("BUILT_IN_FORGE_API_URL"),
  forgeApiKey: readEnv("BUILT_IN_FORGE_API_KEY"),
  brevoApiKey: readEnv("BREVO_API_KEY"),
  brevoSenderEmail: readEnv("BREVO_SENDER_EMAIL"),
  vapidSubject: readEnv("VAPID_SUBJECT") || "mailto:rakizaplatform@gmail.com",
  vapidPublicKey: readEnv("VAPID_PUBLIC_KEY"),
  vapidPrivateKey: readEnv("VAPID_PRIVATE_KEY"),
  supabaseUrl: readEnv("VITE_SUPABASE_URL", "SUPABASE_URL"),
  supabaseAnonKey: readEnv("VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"),
};

export function isSupabaseProjectUrl(url = ENV.supabaseUrl) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/i.test(parsed.host);
  } catch {
    return false;
  }
}

export function databaseReady() {
  return Boolean(ENV.databaseUrl);
}

/**
 * وضع التشغيل المستقل (Mock Mode): فعّال عند غياب قاعدة البيانات الخارجية.
 * فيه يعمل النظام بالكامل داخل الذاكرة (مستخدمون + بصمة) دون أي أسرار خارجية.
 */
export function isMockMode() {
  return !databaseReady();
}

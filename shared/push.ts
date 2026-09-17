/**
 * إعدادات الإشعارات اللحظية المشتركة بين الخادم والواجهة.
 *
 * المفتاح العام (VAPID public key) ليس سراً: المتصفح يستلمه أصلاً في كل اشتراك إشعارات،
 * لذلك يُحفظ هنا كقيمة معتمدة للمشروع حتى تعمل تهيئة الجهاز مباشرة.
 * أما المفتاح الخاص (VAPID private key) وحساب خدمة Firebase فيبقيان أسراراً في بيئة التشغيل فقط.
 */

/** مفتاح Firebase Web Push العام (شهادة Web Push) المستخدم في تسجيل رمز الجهاز. */
export const WEB_PUSH_VAPID_PUBLIC_KEY = "BPthTgFRqEALBWzEGI2IkF7BGjJ0GCTweAjp74aLPEiXEF_Oxa0-4SWBZhRWzcp-11I_6AJgz7cTjtwDX5a9Ezw";

/** يفك ترميز base64url بلا اعتماد على Buffer ليعمل في المتصفح والخادم معاً. */
function base64UrlByteLength(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return 0;
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  if (padded.length % 4 !== 0) return 0;
  const padding = (padded.match(/=+$/) ?? [""])[0]!.length;
  return Math.floor((padded.length * 3) / 4) - padding;
}

/** مفتاح VAPID العام الصالح هو مفتاح P-256 غير مضغوط (65 بايت) بترميز base64url. */
export function isUsableVapidPublicKey(value?: string | null) {
  const candidate = String(value ?? "").trim();
  if (!candidate || !/^[A-Za-z0-9_-]+$/.test(candidate)) return false;
  return base64UrlByteLength(candidate) === 65;
}

export function resolveVapidPublicKey(...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    const normalized = String(candidate ?? "").trim();
    if (isUsableVapidPublicKey(normalized)) return normalized;
  }
  return "";
}

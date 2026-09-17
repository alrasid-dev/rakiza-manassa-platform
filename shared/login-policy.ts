/**
 * سياسة بريد الدخول المشتركة بين الواجهة والخادم (مصدر حقيقة واحد).
 *
 * القاعدة: يُقبل البريد الرسمي من نطاق وزارة العدل، ويُقبل معه بريد مالك المنصة المعتمد،
 * ولا يُشترط النطاق الرسمي على حساب يحمل صلاحية المالك (ثابت أو ممنوح في قاعدة البيانات).
 */

export const PLATFORM_OWNER_EMAIL_DEFAULT = "rakizaplatform@gmail.com";
export const OFFICIAL_MOJ_EMAIL_PATTERN = /^[^@\s]+@moj\.gov\.sa$/i;

export function normalizeLoginEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function isOfficialMojEmail(value: string | null | undefined) {
  const email = normalizeLoginEmail(value);
  return Boolean(email) && OFFICIAL_MOJ_EMAIL_PATTERN.test(email);
}

export function isPlatformOwnerEmail(value: string | null | undefined, ownerEmail = PLATFORM_OWNER_EMAIL_DEFAULT) {
  const email = normalizeLoginEmail(value);
  const owner = normalizeLoginEmail(ownerEmail);
  return Boolean(email) && Boolean(owner) && email === owner;
}

/** يقبل البريد الرسمي أو بريد المالك المعتمد، بلا أي اشتراط نطاق على حساب المالك. */
export function isAllowedLoginEmail(value: string | null | undefined, ownerEmail = PLATFORM_OWNER_EMAIL_DEFAULT) {
  return isOfficialMojEmail(value) || isPlatformOwnerEmail(value, ownerEmail);
}

export type LoginAllowanceReason = "empty" | "official" | "owner" | "owner_grant" | "domain";
export type LoginAllowance = { email: string; allowed: boolean; isOwner: boolean; reason: LoginAllowanceReason };

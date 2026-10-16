export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// الحد الأقصى لحجم الملف المرفوع (بايت). Vercel يحدّ جسم الطلب بـ 4.5 م.ب.
// والملف يُرسل base64 داخل JSON فيتضخّم ×4/3. لذلك 3 م.ب. هي الحد الآمن
// (base64 ≈ 4.19 م.ب. < 4.5 م.ب. بهامش أمان).
export const MAX_UPLOAD_SIZE = 3 * 1024 * 1024;
export const MAX_UPLOAD_SIZE_LABEL = "3 م.ب.";
// الحد الأقصى لطول سلسلة base64 المقابلة لـ MAX_UPLOAD_SIZE (تضخّم 4/3).
export const MAX_UPLOAD_BASE64_LENGTH = 4 * 1024 * 1024;

// الحد الإجمالي للمرفقات المتعددة (يبقي payload الـ base64 ≈ 4 MB < حد Vercel 4.5 MB).
export const MAX_TOTAL_UPLOAD_SIZE = 3 * 1024 * 1024;
export const MAX_TOTAL_UPLOAD_SIZE_LABEL = "3 م.ب. إجمالاً";

/** تقدير حجم سلسلة base64 بالأيتات الأصلية (base64 يضخّم 4/3). */
export function base64Bytes(b64: string): number {
  return Math.ceil((b64.length * 3) / 4);
}

// One-time nonce cookie that binds an OAuth login to the browser that started
// it. The `__Host-` prefix forces the cookie host-only (Secure, Path=/, no
// Domain), so a sibling *.manus.space site cannot plant a matching value in a
// victim's browser.
export const OAUTH_STATE_COOKIE = "__Host-oauth_state";

// `state` carries the callback redirect URI (used at token exchange) plus the
// CSRF nonce. Defined here so the client encoder and server decoder never drift.
export type OAuthState = { redirectUri: string; nonce?: string };

export const encodeOAuthState = (state: OAuthState): string =>
  btoa(JSON.stringify(state));

export const decodeOAuthState = (state: string): OAuthState => {
  let decoded: string;
  try {
    decoded = atob(state);
  } catch {
    // Malformed base64 (e.g. attacker-supplied garbage). Return no nonce so the
    // callback's CSRF guard rejects it with 403 — never throw, since the caller
    // runs outside the request handler's try/catch.
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
    // Legacy links: `state` was a bare base64(redirectUri) with no nonce.
  }
  return { redirectUri: decoded };
};

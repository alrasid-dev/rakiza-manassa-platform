import { describe, expect, it } from "vitest";
import { LOGIN_POLICY, resolveLoginConfig } from "./login-fallback";
import { ENV } from "./env";

describe("معالج الدخول البديل (Fallback Handler)", () => {
  it("يعيد دائماً رداً ناجحاً حتى مع غياب متغيرات البيئة", () => {
    const config = resolveLoginConfig();
    expect(config.ok).toBe(true);
    expect(Array.isArray(config.missing)).toBe(true);
    expect(typeof config.fallback).toBe("boolean");
  });

  it("يحمل سياسة الدخول الافتراضية (نطاق الوزارة + الرمز الدائم + البصمة)", () => {
    expect(LOGIN_POLICY.officialEmailDomain).toBe("moj.gov.sa");
    expect(LOGIN_POLICY.permanentCodeEnabled).toBe(true);
    expect(LOGIN_POLICY.biometricSupported).toBe(true);
  });

  it("يعرّف قناة المالك الاستثنائية ببريد Gmail المكوّن", () => {
    expect(resolveLoginConfig().ownerEmail).toBe(ENV.platformOwnerEmail);
    expect(resolveLoginConfig().policy.ownerEmail).toBe(ENV.platformOwnerEmail);
  });

  it("يتخطى نقص إعدادات Firebase ويبلّغ عنها دون رمي خطأ", () => {
    const config = resolveLoginConfig();
    expect(typeof config.firebaseWebConfigured).toBe("boolean");
    expect(typeof config.firebaseServiceAccountConfigured).toBe("boolean");
    // لا يُفصح عن أي قيمة سرية، بل يُبلغ عن الحالة فقط.
    expect(config).not.toHaveProperty("apiKey");
    expect(config).not.toHaveProperty("serviceAccount");
  });
});

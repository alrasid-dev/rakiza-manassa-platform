import { beforeEach, describe, expect, it } from "vitest";
import { mockGetUserByOpenId, mockLinkFirebaseIdentity, resetMockStore } from "./mock-store";
import { verifyFirebaseIdToken } from "./firebase-auth-service";

function makeMockToken(email: string, provider: "google.com" | "password") {
  const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${enc({ alg: "none", typ: "JWT" })}.${enc({
    sub: `mock-uid-${email.replace(/[^a-z0-9]/gi, "")}`,
    email,
    email_verified: true,
    name: email,
    firebase: { sign_in_provider: provider },
  })}.`;
}

describe("وضع التشغيل المستقل (Mock Mode)", () => {
  beforeEach(() => {
    resetMockStore();
    // ضمان مسار الوضع الوهمي بغضّ النظر عن بيئة التشغيل.
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.DATABASE_URL;
    delete process.env.VITE_DATABASE_URL;
  });

  it("يتحقق من رمز Firebase وهمياً ويقبل البريد الرسمي @moj.gov.sa", async () => {
    const identity = await verifyFirebaseIdToken(makeMockToken("employee@moj.gov.sa", "password"));
    expect(identity.email).toBe("employee@moj.gov.sa");
    expect(identity.provider).toBe("password");
  });

  it("يرفض أي بريد خارج النطاق الرسمي في الوضع الوهمي", async () => {
    await expect(verifyFirebaseIdToken(makeMockToken("user@gmail.com", "google.com"))).rejects.toThrow(/بريد رسمي/);
  });

  it("يربط هوية المالك بدور admin ويفتح قناة Gmail", () => {
    const { user } = mockLinkFirebaseIdentity({ uid: "mock-uid-owner", email: "rakizaplatform@gmail.com", name: "المالك", provider: "google.com" });
    expect(user.role).toBe("admin");
    expect(user.openId).toBe("mock:rakizaplatform@gmail.com");
  });

  it("يربط هوية موظف بدور user ويسترجعها من openId (تظل الجلسة صالحة)", () => {
    const { user } = mockLinkFirebaseIdentity({ uid: "mock-uid-emp", email: "employee@moj.gov.sa", name: "موظف", provider: "password" });
    expect(user.role).toBe("user");
    expect(mockGetUserByOpenId(user.openId)?.email).toBe("employee@moj.gov.sa");
  });
});

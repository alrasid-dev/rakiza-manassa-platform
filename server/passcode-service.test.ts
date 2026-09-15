import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: async () => null }));

import { hashPasscode, loginWithPasscode, passcodeConfigured, setupPasscode, verifyPasscode } from "./passcode-service";
import { mockGetUserByEmail, resetMockStore } from "./mock-store";

beforeEach(() => {
  resetMockStore();
});

describe("خدمة رمز المرور (6 أرقام)", () => {
  it("يجزّئ الرمز ويتحقق منه دون حفظه كنص صريح", () => {
    const stored = hashPasscode("123456");
    expect(stored).not.toContain("123456");
    expect(verifyPasscode("123456", stored)).toBe(true);
    expect(verifyPasscode("654321", stored)).toBe(false);
  });

  it("يرفض بريداً خارج النطاق الرسمي عند الإنشاء", async () => {
    await expect(setupPasscode({ officialEmail: "user@gmail.com", passcode: "123456" })).rejects.toThrow(/البريد الرسمي/);
  });

  it("ينشئ رمز المرور أول مرة ويرفض تكرار الإنشاء", async () => {
    const user = await setupPasscode({ officialEmail: "employee@moj.gov.sa", passcode: "123456" });
    expect(user.loginMethod).toBe("passcode");
    expect(mockGetUserByEmail("employee@moj.gov.sa")?.passcodeHash).toBeTruthy();
    await expect(setupPasscode({ officialEmail: "employee@moj.gov.sa", passcode: "654321" })).rejects.toThrow(/مُنشأ مسبقاً/);
  });

  it("يتحقق هل الرمز منشأ مسبقاً", async () => {
    expect((await passcodeConfigured({ officialEmail: "employee@moj.gov.sa" })).configured).toBe(false);
    await setupPasscode({ officialEmail: "employee@moj.gov.sa", passcode: "123456" });
    expect((await passcodeConfigured({ officialEmail: "employee@moj.gov.sa" })).configured).toBe(true);
  });

  it("يرفض الدخول قبل إنشاء الرمز أو برمز خاطئ", async () => {
    await expect(loginWithPasscode({ officialEmail: "employee@moj.gov.sa", passcode: "123456" })).rejects.toThrow(/لا يوجد رمز مرور/);
    await setupPasscode({ officialEmail: "employee@moj.gov.sa", passcode: "123456" });
    await expect(loginWithPasscode({ officialEmail: "employee@moj.gov.sa", passcode: "999999" })).rejects.toThrow(/غير صحيح/);
  });

  it("يدخل بنجاح برمز المرور الصحيح", async () => {
    await setupPasscode({ officialEmail: "employee@moj.gov.sa", passcode: "123456" });
    const user = await loginWithPasscode({ officialEmail: "employee@moj.gov.sa", passcode: "123456" });
    expect(user.email).toBe("employee@moj.gov.sa");
  });
});

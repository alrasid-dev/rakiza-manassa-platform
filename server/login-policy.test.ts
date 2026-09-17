import { describe, expect, it } from "vitest";
import { OFFICIAL_MOJ_EMAIL_PATTERN, PLATFORM_OWNER_EMAIL_DEFAULT, isAllowedLoginEmail, isOfficialMojEmail, isPlatformOwnerEmail, normalizeLoginEmail } from "../shared/login-policy";
import { courtRouter } from "./routers/court";

const caller = () => courtRouter.createCaller({ user: null } as never);

describe("سياسة بريد الدخول الموحدة", () => {
  it("تقبل النطاق الرسمي وتوحّد حالة الأحرف والمسافات", () => {
    expect(isOfficialMojEmail("  Employee@MOJ.gov.SA ")).toBe(true);
    expect(isOfficialMojEmail("employee@example.com")).toBe(false);
    expect(normalizeLoginEmail("  User@Example.COM ")).toBe("user@example.com");
    expect(OFFICIAL_MOJ_EMAIL_PATTERN.test("a.b@moj.gov.sa")).toBe(true);
  });

  it("تعتمد بريد مالك رَكيزة بلا شرط النطاق الرسمي", () => {
    expect(isPlatformOwnerEmail(PLATFORM_OWNER_EMAIL_DEFAULT)).toBe(true);
    expect(isPlatformOwnerEmail(PLATFORM_OWNER_EMAIL_DEFAULT.toUpperCase())).toBe(true);
    expect(isAllowedLoginEmail(PLATFORM_OWNER_EMAIL_DEFAULT)).toBe(true);
    expect(isAllowedLoginEmail("owner@another-domain.com", "owner@another-domain.com")).toBe(true);
    expect(isAllowedLoginEmail("owner@another-domain.com")).toBe(false);
    expect(isAllowedLoginEmail("")).toBe(false);
    expect(isAllowedLoginEmail(null)).toBe(false);
  });
});

describe("إجراء فحص بريد الدخول قبل إنشاء الجلسة", () => {
  it("يعتمد بريد المالك المعتمد ويسمه مالكاً", async () => {
    await expect(caller().loginPolicy.check({ email: PLATFORM_OWNER_EMAIL_DEFAULT })).resolves.toEqual({ allowed: true, isOwner: true, reason: "owner" });
    await expect(caller().loginPolicy.check({ email: ` ${PLATFORM_OWNER_EMAIL_DEFAULT.toUpperCase()} ` })).resolves.toEqual({ allowed: true, isOwner: true, reason: "owner" });
  });

  it("يعتمد البريد الرسمي بلا وسم المالك", async () => {
    await expect(caller().loginPolicy.check({ email: "employee@moj.gov.sa" })).resolves.toEqual({ allowed: true, isOwner: false, reason: "official" });
  });

  it("يرفض النطاق غير الرسمي والبريد الفارغ بلا كشف أي بيانات حساب", async () => {
    await expect(caller().loginPolicy.check({ email: "someone@example.com" })).resolves.toEqual({ allowed: false, isOwner: false, reason: "domain" });
    await expect(caller().loginPolicy.check({ email: "   " })).resolves.toEqual({ allowed: false, isOwner: false, reason: "empty" });
  });
});

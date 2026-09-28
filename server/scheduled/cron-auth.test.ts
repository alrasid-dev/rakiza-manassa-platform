import { describe, expect, it } from "vitest";
import { isValidCronSecret } from "./cron-auth";

describe("التحقق بسر الـ cron (x-cron-secret)", () => {
  const secret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("يقبل هيدر x-cron-secret المطابق", () => {
    const req = { headers: { "x-cron-secret": secret } } as never;
    expect(isValidCronSecret(req, secret)).toBe(true);
  });

  it("يرفض هيدراً غير مطابق", () => {
    const req = { headers: { "x-cron-secret": "wrong-secret" } } as never;
    expect(isValidCronSecret(req, secret)).toBe(false);
  });

  it("يرفض غياب الهيدر أو غياب السر", () => {
    expect(isValidCronSecret({ headers: {} } as never, secret)).toBe(false);
    expect(isValidCronSecret({ headers: { "x-cron-secret": "x" } } as never, "")).toBe(false);
  });

  it("يقبل الهيدر عند تمريره كمصفوفة (توافق Express)", () => {
    const req = { headers: { "x-cron-secret": [secret] } } as never;
    expect(isValidCronSecret(req, secret)).toBe(true);
  });
});

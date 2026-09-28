import { describe, expect, it } from "vitest";
import { calculateComplianceRate, COMPLIANCE_EXEMPTION_THRESHOLD, COMPLIANCE_MANDATORY_THRESHOLD, EXEMPTION_WINDOW_DAYS } from "./attendance-confirmation-policy";

describe("الإعفاء الذكي للحضور", () => {
  it("يحسب نسبة الالتزام بصيغة 0–100", () => {
    expect(calculateComplianceRate(27, 30)).toBe(90);
    expect(calculateComplianceRate(15, 30)).toBe(50);
    expect(calculateComplianceRate(0, 30)).toBe(0);
    expect(calculateComplianceRate(30, 0)).toBe(0);
  });

  it("يثبت العتبات المعتمدة", () => {
    expect(COMPLIANCE_EXEMPTION_THRESHOLD).toBe(90);
    expect(COMPLIANCE_MANDATORY_THRESHOLD).toBe(50);
    expect(EXEMPTION_WINDOW_DAYS).toBe(7);
  });
});

import { describe, it, expect } from "vitest";
import { renderPoliciesHtml } from "./policy-pdf";

describe("مولّد PDF السياسات", () => {
  it("يضمّن خط Noto Sans Arabic كـ base64 (Regular + Bold)", () => {
    const html = renderPoliciesHtml("سياسة التدريب", [{ title: "قسم", content: "نص عربي تجريبي" }]);
    expect(html).toContain("@font-face");
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).toContain("font-weight: 400");
    expect(html).toContain("font-weight: 700");
    expect(html).toContain('font-family: "Noto Sans Arabic"');
    // تأكد أن base64 غير فارغ (الخط مضمّن فعلياً وليس مساراً معطوباً)
    const match = html.match(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/);
    expect(match).toBeTruthy();
    expect(match![1].length).toBeGreaterThan(1000);
  });
});

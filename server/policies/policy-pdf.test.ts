import { describe, it, expect } from "vitest";
import { generatePoliciesPdf } from "./policy-pdf";

describe("مولّد PDF السياسات", () => {
  it("ينتج PDF سليماً بالعربية يبدأ بـ %PDF ويحوي المحتوى", async () => {
    const pdf = await generatePoliciesPdf("سياسة التدريب", [
      { title: "قسم أول", content: "نص عربي تجريبي للسياسات الداخلية." },
      { title: "قسم ثانٍ", content: "نص آخر يغطي قواعد الحضور والانصراف." },
    ]);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});

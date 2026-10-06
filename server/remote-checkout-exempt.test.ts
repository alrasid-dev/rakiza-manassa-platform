import { describe, expect, it } from "vitest";
import { isCheckoutExempt } from "./scheduled/attendance-confirmation";

describe("إعفاء الموظف عن بُعد من عقوبة عدم الانصراف", () => {
  it("الموظف عن بُعد (remote) معفى من عقوبة عدم الانصراف", () => {
    expect(isCheckoutExempt("remote")).toBe(true);
  });

  it("الموظف الحضوري (in_person) معفى", () => {
    expect(isCheckoutExempt("in_person")).toBe(true);
  });

  it("الموظف المختلط (mixed) يبقى خاضعاً للانصراف", () => {
    expect(isCheckoutExempt("mixed")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { RAKIZA_FONTS, RAKIZA_FONT_SIZES, sortCourtStructureUnits } from "./appearance";

describe("مظهر الخط وهيكلة المحكمة", () => {
  it("يوفر سبعة خطوط عربية مجانية وأحجاماً واضحة", () => {
    expect(RAKIZA_FONTS).toHaveLength(7);
    expect(RAKIZA_FONTS.map(font => font.id)).toEqual(["tajawal", "cairo", "noto-naskh", "noto-kufi", "amiri", "alyamama", "ibm-plex"]);
    expect(RAKIZA_FONT_SIZES.map(size => size.id)).toEqual(["sm", "md", "lg", "xl"]);
  });

  it("يرتب أقسام هيكلة المحكمة: رئاسة ثم الملازمون ثم الموارد البشرية ثم الباقي", () => {
    const sorted = sortCourtStructureUnits([
      { name: "قسم الباحثين", code: "researchers" },
      { name: "الموارد البشرية", code: "hr" },
      { name: "شؤون الملازمين", code: "trainee-affairs" },
      { name: "رئاسة المحكمة", code: "court-presidency" },
      { name: "أمانة المحكمة", code: "secretariat" },
    ]);
    expect(sorted.map(unit => unit.name)).toEqual([
      "رئاسة المحكمة",
      "شؤون الملازمين",
      "الموارد البشرية",
      "أمانة المحكمة",
      "قسم الباحثين",
    ]);
  });
});

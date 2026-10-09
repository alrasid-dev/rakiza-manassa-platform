import { describe, expect, it } from "vitest";
import { EVENING_WISDOMS, MORNING_AYAHS, getWelcomeItem } from "./welcome-models";

describe("نماذج الترحيب اليومية", () => {
  it("يحتوي على 30 آية و30 حكمة", () => {
    expect(MORNING_AYAHS).toHaveLength(30);
    expect(EVENING_WISDOMS).toHaveLength(30);
  });

  it("لا تكرار في الآيات", () => {
    const texts = MORNING_AYAHS.map(m => m.ayah);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("لا تكرار في الحكم", () => {
    const texts = EVENING_WISDOMS.map(m => m.wisdom);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("يختار آية في الصباح وحكمة في المساء", () => {
    expect(getWelcomeItem(new Date(2026, 0, 15, 8, 0, 0)).kind).toBe("morning");
    expect(getWelcomeItem(new Date(2026, 0, 15, 20, 0, 0)).kind).toBe("evening");
  });

  it("يتجدد يومياً ويغطي كل الآيات مرة واحدة خلال 30 يوماً", () => {
    const seen = new Set<string>();
    for (let d = 0; d < 30; d++) {
      const item = getWelcomeItem(new Date(2026, 0, 1 + d, 8, 0, 0));
      expect(item.kind).toBe("morning");
      if (item.kind === "morning") seen.add(item.ayah);
    }
    expect(seen.size).toBe(30);
  });
});

import { describe, expect, it } from "vitest";
import {
  RIYADH_OFFSET_MS,
  riyadhDateKey,
  riyadhDateTimeLocal,
  riyadhDayStart,
  riyadhLocalToUtc,
  riyadhTimeKey,
  toRiyadh,
} from "./riyadh-time";

describe("riyadh-time — الإزاحة الموحّدة", () => {
  it("RIYADH_OFFSET_MS يساوي 3 ساعات", () => {
    expect(RIYADH_OFFSET_MS).toBe(3 * 60 * 60 * 1000);
  });

  it("toRiyadh يضيف 3 ساعات", () => {
    expect(toRiyadh(new Date("2026-10-14T06:17:00Z")).toISOString()).toBe("2026-10-14T09:17:00.000Z");
  });
});

describe("riyadhDateKey", () => {
  it("يستخرج التاريخ السعودي من recordDate المخزَّن عند 21:00 UTC", () => {
    // 2026-10-13T21:00Z = منتصف ليل الرياض 14 أكتوبر
    expect(riyadhDateKey(new Date("2026-10-13T21:00:00Z"))).toBe("2026-10-14");
  });

  it("يقبل نصاً ويعيد التاريخ الصحيح", () => {
    expect(riyadhDateKey("2026-10-13T21:00:00.000Z")).toBe("2026-10-14");
  });

  it("يعيد سلسلة فارغة للقيم الفارغة/غير الصالحة", () => {
    expect(riyadhDateKey(null)).toBe("");
    expect(riyadhDateKey(undefined)).toBe("");
    expect(riyadhDateKey("not-a-date")).toBe("");
  });
});

describe("riyadhTimeKey", () => {
  it("يستخرج وقت الرياض HH:MM", () => {
    expect(riyadhTimeKey(new Date("2026-10-14T06:17:00Z"))).toBe("09:17");
  });

  it("يعيد فارغة للقيم الفارغة", () => {
    expect(riyadhTimeKey(null)).toBe("");
  });
});

describe("riyadhDateTimeLocal", () => {
  it("يستخرج YYYY-MM-DDTHH:MM لتغذية datetime-local", () => {
    expect(riyadhDateTimeLocal(new Date("2026-10-14T06:17:00Z"))).toBe("2026-10-14T09:17");
  });

  it("يعيد فارغة للقيم الفارغة", () => {
    expect(riyadhDateTimeLocal(null)).toBe("");
  });
});

describe("riyadhLocalToUtc", () => {
  it("يحوّل وقت الرياض إلى UTC (طرح 3 ساعات)", () => {
    expect(riyadhLocalToUtc("2026-10-14T16:25").toISOString()).toBe("2026-10-14T13:25:00.000Z");
  });

  it("يتعامل مع منتصف الليل (00:00 الرياض = 21:00 UTC اليوم السابق)", () => {
    expect(riyadhLocalToUtc("2026-10-14T00:00").toISOString()).toBe("2026-10-13T21:00:00.000Z");
  });
});

describe("riyadhDayStart", () => {
  it("يعيد بداية اليوم الرياض (21:00 UTC لليوم السابق)", () => {
    expect(riyadhDayStart(new Date("2026-10-14T06:00:00Z")).toISOString()).toBe("2026-10-13T21:00:00.000Z");
  });
});

describe("round-trip", () => {
  it("riyadhLocalToUtc(riyadhDateTimeLocal(x)) يعيد نفس اللحظة بدقة الدقيقة", () => {
    const utc = new Date("2026-10-14T13:25:00Z");
    expect(riyadhLocalToUtc(riyadhDateTimeLocal(utc)).toISOString()).toBe("2026-10-14T13:25:00.000Z");
  });
});

import { describe, expect, it } from "vitest";
import { recomputeBalanceValues, resolveRecordAttendanceMode } from "./court-service";

describe("النمط التاريخي وقت البصمة (resolveRecordAttendanceMode)", () => {
  it("موظف تحوّل من remote إلى in_person: بصمة دخول + تصنيف in_person → كان remote (لا عقوبة)", () => {
    expect(resolveRecordAttendanceMode({ currentMode: "in_person", hasCheckIn: true })).toBe("remote");
  });

  it("موظف remote حالي: remote", () => {
    expect(resolveRecordAttendanceMode({ currentMode: "remote", hasCheckIn: true })).toBe("remote");
  });

  it("موظف mixed حالي مع بصمة: mixed (خاضع للعقوبة)", () => {
    expect(resolveRecordAttendanceMode({ currentMode: "mixed", hasCheckIn: true })).toBe("mixed");
  });

  it("موظف in_person بدون بصمة: in_person", () => {
    expect(resolveRecordAttendanceMode({ currentMode: "in_person", hasCheckIn: false })).toBe("in_person");
  });
});

describe("إعادة حساب الرصيد وفق سياسة الحضور (recomputeBalanceValues)", () => {
  it("الاستئذان يبقى محسوباً للموظف عن بُعد (لا يُبطَل)", () => {
    const r = recomputeBalanceValues({ mode: "remote", positive: 0, negative: 426, penalty: 240, excuse: 240 });
    expect(r.excuse).toBe(240);
    expect(r.net).toBe(240); // 0 − 0 − 0 + 240
  });

  it("عقوبة remote (negative/penalty) مستبعدة", () => {
    const r = recomputeBalanceValues({ mode: "remote", positive: 0, negative: 426, penalty: 240, excuse: 240 });
    expect(r.negative).toBe(0);
    expect(r.penalty).toBe(0);
  });

  it("in_person/mixed يُحسب negative والpenalty", () => {
    const r = recomputeBalanceValues({ mode: "in_person", positive: 0, negative: 90, penalty: 240, excuse: 0 });
    expect(r.negative).toBe(90);
    expect(r.penalty).toBe(240);
    expect(r.net).toBe(-330);
  });

  it("إعادة الحساب idempotent (لا تغيير بعد التصحيح)", () => {
    const first = recomputeBalanceValues({ mode: "remote", positive: 0, negative: 426, penalty: 240, excuse: 240 });
    const second = recomputeBalanceValues({ mode: "remote", positive: first.positive, negative: first.negative, penalty: first.penalty, excuse: first.excuse });
    expect(second).toEqual(first);
  });
});


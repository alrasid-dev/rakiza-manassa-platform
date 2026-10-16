import { describe, expect, it } from "vitest";
import { hasCapability, isDelegationActive, withinScope, type DelegationGrant } from "./delegation";

const DAY = 24 * 60 * 60 * 1000;

describe("isDelegationActive", () => {
  it("نشط داخل المدة", () => {
    const now = new Date();
    expect(isDelegationActive({ startsAt: new Date(now.getTime() - DAY), endsAt: new Date(now.getTime() + DAY) }, now)).toBe(true);
  });
  it("غير نشط قبل البداية", () => {
    const now = new Date();
    expect(isDelegationActive({ startsAt: new Date(now.getTime() + DAY), endsAt: new Date(now.getTime() + 2 * DAY) }, now)).toBe(false);
  });
  it("غير نشط بعد النهاية", () => {
    const now = new Date();
    expect(isDelegationActive({ startsAt: new Date(now.getTime() - 2 * DAY), endsAt: new Date(now.getTime() - DAY) }, now)).toBe(false);
  });
});

describe("withinScope", () => {
  it("global يشمل الجميع", () => {
    expect(withinScope({ kind: "global" }, {})).toBe(true);
  });
  it("unit يطابق unitId فقط", () => {
    expect(withinScope({ kind: "unit", unitId: 5 }, { unitId: 5 })).toBe(true);
    expect(withinScope({ kind: "unit", unitId: 5 }, { unitId: 6 })).toBe(false);
  });
  it("employee يطابق targetUserId فقط", () => {
    expect(withinScope({ kind: "employee", targetUserId: 9 }, { targetUserId: 9 })).toBe(true);
    expect(withinScope({ kind: "employee", targetUserId: 9 }, { targetUserId: 10 })).toBe(false);
  });
});

describe("hasCapability", () => {
  const grant = (over: Partial<DelegationGrant> = {}): DelegationGrant => ({
    grantorUserId: 1,
    delegateUserId: 2,
    sourceRole: "court_secretary",
    capabilities: { mode: "specific", capabilities: ["manage_attendance"] },
    scope: { kind: "global" },
    startsAt: new Date(Date.now() - DAY),
    endsAt: new Date(Date.now() + DAY),
    title: "test",
    ...over,
  });

  it("المالك → true دائماً", () => {
    expect(hasCapability("rakizaplatform@gmail.com", [], [], "manage_attendance")).toBe(true);
  });

  it("قدرة عامة (initiate_asset_request) → true لأي مستخدم", () => {
    expect(hasCapability("x@moj.gov.sa", [], [], "initiate_asset_request")).toBe(true);
  });

  it("دور عنده القدرة → true", () => {
    expect(hasCapability("x@moj.gov.sa", ["court_secretary"], [], "manage_attendance")).toBe(true);
  });

  it("تفويض specific ينطبق → true", () => {
    expect(hasCapability("x@moj.gov.sa", [], [grant()], "manage_attendance")).toBe(true);
  });

  it("تفويض all → true", () => {
    expect(hasCapability("x@moj.gov.sa", [], [grant({ capabilities: { mode: "all" } })], "manage_attendance")).toBe(true);
  });

  it("تفويض خارج النطاق → false", () => {
    expect(hasCapability("x@moj.gov.sa", [], [grant({ scope: { kind: "unit", unitId: 5 } })], "manage_attendance", { unitId: 6 })).toBe(false);
  });

  it("تفويض منتهي → false", () => {
    expect(hasCapability("x@moj.gov.sa", [], [grant({ endsAt: new Date(Date.now() - DAY) })], "manage_attendance")).toBe(false);
  });
});

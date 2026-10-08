import { describe, expect, it } from "vitest";

import { classifyCheckIn, classifyCheckOut } from "./attendance-fingerprint-policy";

describe("classifyCheckIn (الدخول)", () => {
  it("يرفض قبل 07:00", () => {
    expect(classifyCheckIn(419)).toMatchObject({ allowed: false, status: "too_early" });
  });
  it("يمنح +15 عند 07:00 و 0 عند 07:30 (كل دقيقتين +1)", () => {
    expect(classifyCheckIn(420)).toMatchObject({ allowed: true, status: "early_present", points: 15, lateMinutes: 0 });
    expect(classifyCheckIn(435)).toMatchObject({ points: 7 }); // 07:15
    expect(classifyCheckIn(450)).toMatchObject({ allowed: true, status: "early_present", points: 0 });
  });
  it("حاضر عادي بين 07:31 و 08:00", () => {
    expect(classifyCheckIn(451)).toMatchObject({ allowed: true, status: "present", points: 0, lateMinutes: 0 });
    expect(classifyCheckIn(480)).toMatchObject({ allowed: true, status: "present", points: 0 }); // 08:00
  });
  it("متأخر بدون خصم بين 08:01 و 08:15", () => {
    expect(classifyCheckIn(495)).toMatchObject({ allowed: true, status: "late_no_penalty", points: 0, lateMinutes: 0 }); // 08:15
  });
  it("متأخر يُحسب من 07:30 بين 08:16 و 14:59", () => {
    expect(classifyCheckIn(496)).toMatchObject({ allowed: true, status: "late", points: 0, lateMinutes: 46 }); // 08:16
    expect(classifyCheckIn(540)).toMatchObject({ allowed: true, status: "late", points: 0, lateMinutes: 90 }); // 09:00
    expect(classifyCheckIn(840)).toMatchObject({ allowed: true, status: "late", points: 0, lateMinutes: 390 }); // 14:00
    expect(classifyCheckIn(899)).toMatchObject({ allowed: true, status: "late", points: 0, lateMinutes: 449 }); // 14:59
  });
  it("يرفض عند 15:00 أو بعده", () => {
    expect(classifyCheckIn(900)).toMatchObject({ allowed: false, status: "too_late" });
  });
});

describe("classifyCheckOut (الانصراف)", () => {
  it("يرفض قبل 07:00", () => {
    expect(classifyCheckOut(419)).toMatchObject({ allowed: false, status: "too_early" });
  });
  it("انصراف مبكر (سلبي) بين 07:00 و 14:14", () => {
    expect(classifyCheckOut(420)).toMatchObject({ allowed: true, status: "early", points: 0, earlyMinutes: 435 });
    expect(classifyCheckOut(854)).toMatchObject({ allowed: true, status: "early", points: 0, earlyMinutes: 1 });
  });
  it("انصراف عادي (لا نقاط) بين 14:15 و 14:30", () => {
    expect(classifyCheckOut(855)).toMatchObject({ allowed: true, status: "normal", points: 0, earlyMinutes: 0 }); // 14:15
    expect(classifyCheckOut(870)).toMatchObject({ allowed: true, status: "normal", points: 0, earlyMinutes: 0 }); // 14:30
  });
  it("إيجابي كل دقيقتين بين 14:31 و 14:59", () => {
    expect(classifyCheckOut(871)).toMatchObject({ allowed: true, status: "late_present", points: 0, earlyMinutes: 0 }); // 14:31
    expect(classifyCheckOut(875)).toMatchObject({ allowed: true, status: "late_present", points: 2 }); // 14:35
    expect(classifyCheckOut(885)).toMatchObject({ allowed: true, status: "late_present", points: 7 }); // 14:45
    expect(classifyCheckOut(899)).toMatchObject({ allowed: true, status: "late_present", points: 14 }); // 14:59
  });
  it("يرفض عند 15:00 أو بعده", () => {
    expect(classifyCheckOut(900)).toMatchObject({ allowed: false, status: "too_late" });
  });
});

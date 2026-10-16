import { describe, expect, it } from "vitest";
import { canManageAttendance, canManageAttendancePolicy, canViewAttendance } from "./access-control";

describe("canManageAttendancePolicy", () => {
  it("يسمح للرئيس", () => {
    expect(canManageAttendancePolicy(null, ["court_president"])).toBe(true);
  });

  it("يسمح للأمين", () => {
    expect(canManageAttendancePolicy(null, ["court_secretary"])).toBe(true);
  });

  it("يسمح لمدير الموارد البشرية", () => {
    expect(canManageAttendancePolicy(null, ["human_resources_manager"])).toBe(true);
  });

  it("يرفض مدير القسم", () => {
    expect(canManageAttendancePolicy(null, ["department_manager"])).toBe(false);
  });

  it("يسمح للمالك عبر full_control (يشمل منح access_grants)", () => {
    expect(canManageAttendancePolicy("full_control", [])).toBe(true);
  });

  it("يرفض بلا صلاحية ولا دور", () => {
    expect(canManageAttendancePolicy(null, [])).toBe(false);
  });
});

describe("canViewAttendance", () => {
  it("يسمح للرئيس ومساعد الرئيس والأمين وHR", () => {
    expect(canViewAttendance(null, ["court_president"])).toBe(true);
    expect(canViewAttendance(null, ["assistant_president"])).toBe(true);
    expect(canViewAttendance(null, ["court_secretary"])).toBe(true);
    expect(canViewAttendance(null, ["human_resources_manager"])).toBe(true);
  });

  it("يرفض مدير القسم", () => {
    expect(canViewAttendance(null, ["department_manager"])).toBe(false);
  });

  it("يسمح للمالك (full_control)", () => {
    expect(canViewAttendance("full_control", [])).toBe(true);
  });
});

describe("canManageAttendance", () => {
  it("يسمح للأمين", () => {
    expect(canManageAttendance(null, ["court_secretary"])).toBe(true);
  });

  it("يرفض الرئيس", () => {
    expect(canManageAttendance(null, ["court_president"])).toBe(false);
  });

  it("يسمح للمالك (full_control)", () => {
    expect(canManageAttendance("full_control", [])).toBe(true);
  });
});

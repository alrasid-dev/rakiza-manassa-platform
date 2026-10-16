import { describe, expect, it } from "vitest";
import { canManageAttendancePolicy } from "./access-control";

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

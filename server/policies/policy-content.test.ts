import { describe, expect, it } from "vitest";
import { getPoliciesForRole } from "./policy-content";

describe("سياسات الأدوار", () => {
  it("يعرض كل السياسات للمالك (full_control)", () => {
    expect(getPoliciesForRole("court_president", "full_control").length).toBe(11);
  });

  it("يعرض سياسات الإدارة للمدير دون صلاحيات المالك", () => {
    const ids = getPoliciesForRole("department_manager", "employee").map(s => s.id);
    expect(ids).toContain("manage_people");
    expect(ids).toContain("approve_permissions");
    expect(ids).toContain("meetings");
    expect(ids).not.toContain("owner_powers");
    expect(ids).not.toContain("president_powers");
  });

  it("يعرض السياسات العامة فقط للموظف العادي", () => {
    const ids = getPoliciesForRole(null, "employee").map(s => s.id);
    expect(ids).toEqual(["login", "attendance", "leave_permission", "tasks", "scores_accountability"]);
  });

  it("يعرض صلاحيات الأمين للأمين", () => {
    const ids = getPoliciesForRole("court_secretary", "general_view").map(s => s.id);
    expect(ids).toContain("secretary_powers");
    expect(ids).not.toContain("president_powers");
    expect(ids).not.toContain("owner_powers");
  });
});

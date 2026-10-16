import { describe, expect, it } from "vitest";
import { COURT_ROLES, ROLE_CAPABILITIES, hasRoleCapability, isOwner } from "./role-capabilities";

describe("role-capabilities", () => {
  it("يحتوي COURT_ROLES على 13 دوراً", () => {
    expect(COURT_ROLES).toHaveLength(13);
  });

  it("كل دور في ROLE_CAPABILITIES له مفتاح", () => {
    for (const role of COURT_ROLES) {
      expect(ROLE_CAPABILITIES[role]).toBeDefined();
    }
  });

  it("court_secretary يعدّل الحضور", () => {
    expect(hasRoleCapability(["court_secretary"], "manage_attendance")).toBe(true);
  });

  it("court_president لا يعدّل الحضور (view فقط)", () => {
    expect(hasRoleCapability(["court_president"], "manage_attendance")).toBe(false);
    expect(hasRoleCapability(["court_president"], "view_attendance")).toBe(true);
  });

  it("HR يرفع تقارير", () => {
    expect(hasRoleCapability(["human_resources_manager"], "attach_reports")).toBe(true);
  });

  it("assistant_secretary بلا قدرات ذاتية", () => {
    expect(ROLE_CAPABILITIES["assistant_secretary"]).toEqual([]);
  });

  it("department_manager لا يملك manage_operations (القيادة فقط)", () => {
    expect(ROLE_CAPABILITIES.department_manager).not.toContain("manage_operations");
  });

  it("HR يدير طلبات العهد", () => {
    expect(hasRoleCapability(["human_resources_manager"], "manage_asset_requests")).toBe(true);
  });

  it("الأمين يستقبل إشعارات العهد", () => {
    expect(hasRoleCapability(["court_secretary"], "receive_asset_notifications")).toBe(true);
  });

  it("isOwner يحدد المالك بالبريد", () => {
    expect(isOwner("rakizaplatform@gmail.com")).toBe(true);
    expect(isOwner("other@example.com")).toBe(false);
  });
});

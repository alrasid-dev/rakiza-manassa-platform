import { describe, expect, it } from "vitest";
import { buildOwnerSecurityNotification } from "./court-service";

describe("تنبيه أمان مالك المنصة", () => {
  it("يستخدم ملف المالك كمستلم وحيد ويخفي التفاصيل الزائدة", () => {
    const notification = buildOwnerSecurityNotification({ ownerProfileId: 42, actorUserId: 7, actorName: "أماني أحمد", action: "attendance.record_attempt_failed", entityType: "attendance", entityId: 99 });
    expect(notification.profileId).toBe(42);
    expect(notification.category).toBe("security_alert");
    expect(notification.title).toContain("مالك");
    expect(notification.body).toContain("attendance.record_attempt_failed");
    expect(notification.body).toContain("أماني أحمد");
    expect(notification.body).toContain("(7)");
    expect(notification).not.toHaveProperty("recipientProfileIds");
    expect(notification).not.toHaveProperty("details");
  });

  it("يعرض 'غير معروف' عند غياب اسم الموظف", () => {
    const notification = buildOwnerSecurityNotification({ ownerProfileId: 42, actorUserId: 7, action: "court_role.assigned", entityType: "court_role_assignment", entityId: 10 });
    expect(notification.body).toContain("غير معروف (7)");
  });
});

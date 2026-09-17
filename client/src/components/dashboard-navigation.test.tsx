import { describe, expect, it } from "vitest";
import { quickActionCatalog } from "./DynamicQuickActions";
import { isNavigationPathActive, isNavigationSectionAllowed, navigationBadgeForItem, navigationIconTone, navigationSections, normalizeQuickActionIds, oliveIconMotionClass, resolveDepartmentConversationId, resolveNavigationPermission } from "./DashboardLayout";

describe("تحصين لوحة القيادة ضد ردود الخادم غير المتوقعة", () => {
  it("يستخرج محادثة القسم من الرد الصحيح ويتجاهل أي شكل آخر", () => {
    expect(resolveDepartmentConversationId([{ conversation: { id: 42, conversationType: "department" } }])).toBe(42);
    expect(resolveDepartmentConversationId([
      { conversation: { id: 7, conversationType: "task" } },
      { conversation: { id: 51, conversationType: "department" } },
    ])).toBe(51);
    expect(resolveDepartmentConversationId([{ conversation: { id: 7, conversationType: "task" } }])).toBeNull();
    expect(resolveDepartmentConversationId({ rows: [{ conversation: { id: 1, conversationType: "department" } }] })).toBeNull();
    expect(resolveDepartmentConversationId(null)).toBeNull();
    expect(resolveDepartmentConversationId([{ conversation: {} }, {}])).toBeNull();
  });

  it("ينقّي تفضيلات شريط العمل السريع من أي قيم غير معروفة", () => {
    expect(normalizeQuickActionIds(["mail", "notifications"])).toEqual(["mail", "notifications"]);
    expect(normalizeQuickActionIds(["mail", "unknown-action", 5, null])).toEqual(["mail"]);
    expect(normalizeQuickActionIds("mail")).toEqual([]);
    expect(normalizeQuickActionIds(undefined)).toEqual([]);
  });
});


describe("navigation sections", () => {
  it("يستخدم فئة حركة مقيدة للأيقونات الزيتية دون تغيير تعريفات التنقل", () => {
    expect(oliveIconMotionClass).toBe("rakiza-olive-icon");
  });

  it("keeps trainee affairs tools under one section", () => {
    const traineeSections = navigationSections.filter(section => section.items.some(item => item.path === "/trainees"));
    expect(traineeSections).toHaveLength(1);
    expect(traineeSections[0]?.heading).toBe("شؤون الملازمين");
    expect(traineeSections[0]?.items.map(item => item.path)).toEqual([
      "/trainees",
      "/imports",
      "/trainee-correspondence-templates",
    ]);
  });

  it("keeps full control above leadership scope so owner-only navigation remains visible", () => {
    expect(resolveNavigationPermission("full_control", true)).toBe("full_control");
    expect(resolveNavigationPermission("general_view", true)).toBe("general_view");
    expect(resolveNavigationPermission("employee", true)).toBe("general_view");
  });

  it("isolates a court-delivery employee from unrelated navigation sections", () => {
    expect(isNavigationSectionAllowed("رئاسة المحكمة", "employee", "تسليم الأحكام", "judgments_delivery")).toBe(false);
    expect(isNavigationSectionAllowed("شؤون الملازمين", "employee", "تسليم الأحكام", "judgments_delivery")).toBe(false);
    expect(isNavigationSectionAllowed("شؤون الملازمين", "employee", "شؤون الملازمين", "trainee_affairs")).toBe(true);
    expect(isNavigationSectionAllowed("لوحة القيادة", "employee", "تسليم الأحكام", "judgments_delivery")).toBe(true);
  });

  it("exposes owner access management and human resources without duplicate registration navigation", () => {
    const paths = navigationSections.flatMap(section => section.items.map(item => item.path));
    expect(paths).not.toContain("/register");
    expect(paths).toContain("/access-management");
    expect(navigationSections.some(section => section.heading === "الموارد البشرية")).toBe(true);
    expect(navigationSections.some(section => section.heading === "رئاسة المحكمة" && section.items.some(item => item.label === "مكتب رئيس المحكمة"))).toBe(true);
    expect(navigationSections.some(section => section.items.some(item => item.label === "أمانة المحكمة"))).toBe(true);
    expect(paths.filter(path => path === "/trainees")).toHaveLength(1);
    expect(paths.filter(path => path === "/trainee-correspondence-templates")).toHaveLength(1);
  });

  it("يعرض شارات المهام والاعتمادات كعدادات موجزة لا تكشف محتوى الحدث", () => {
    expect(navigationBadgeForItem("مهامي", { mail: 1, chat: 2, taskAttention: 4, pendingApprovals: 3 })).toEqual({ count: 4, accessibleLabel: "4 مهام تتطلب متابعة" });
    expect(navigationBadgeForItem("طلبات الاعتماد", { mail: 1, chat: 2, taskAttention: 4, pendingApprovals: 3 })).toEqual({ count: 3, accessibleLabel: "3 طلبات اعتماد معلقة" });
    expect(navigationSections.flatMap(section => section.items).find(item => item.label === "طلبات الاعتماد")).toMatchObject({ path: "/approvals", audiences: expect.arrayContaining(["employee"]) });
  });

  it("يميز أيقونات الإعدادات والتفويض والتسجيل حتى لا تتشابه على المستخدم", () => {
    const items = navigationSections.flatMap(section => section.items);
    expect(items.find(item => item.label === "إعدادات الموظف")?.icon).not.toBe(items.find(item => item.label === "إعدادات المنصة")?.icon);
    expect(items.find(item => item.label === "تفويض")?.icon).not.toBe(items.find(item => item.label === "طلبات التسجيل وإدارة المستخدمين")?.icon);
    expect(items.find(item => item.label === "مؤشرات القيادة")?.icon).not.toBe(items.find(item => item.label === "شؤون القضاة")?.icon);
  });

  it("يضع الرئيسية ودليل المستخدم ضمن لوحة القيادة بروابط حقيقية", () => {
    const board = navigationSections.find(section => section.heading === "لوحة القيادة");
    expect(board?.items.find(item => item.label === "الرئيسية")).toMatchObject({ path: "/" });
    expect(board?.items.find(item => item.label === "دليل المستخدم")).toMatchObject({ path: "/guide" });
  });

  it("يمنع تكرار أيقونات الميزات: مصدر واحد لكل ميزة في نفس الشاشة", () => {
    // شريط العمل السريع (أعلى الشاشة) هو المصدر الوحيد لهذه الميزات، فلا تُكرَّر في القائمة الجانبية.
    const duplicatedLabels = ["مهامي", "الإشعارات", "الدردشات", "بريد ركيزة", "رفع التقارير"];
    const sidebarLabels = navigationSections.flatMap(section => section.items.map(item => item.label));
    for (const label of duplicatedLabels) expect(sidebarLabels).not.toContain(label);
    expect(quickActionCatalog.map(action => action.label)).toEqual(["مهامي", "الإشعارات", "الدردشات", "البريد", "رفع تقرير"]);
  });

  it("يلوّن آبار الأيقونات حسب العمل والرئاسة والتنبيه ويملأ الصفحة النشطة", () => {
    expect(navigationIconTone("لوحة القيادة", "مهامي")).toBe("olive");
    expect(navigationIconTone("رئاسة المحكمة", "تفويض")).toBe("gold");
    expect(navigationIconTone("لوحة القيادة", "المتعثرات")).toBe("alert");
    expect(navigationIconTone("لوحة القيادة", "الإشعارات")).toBe("alert");
    expect(isNavigationPathActive("/rakiza-mail?focus=inbox", "/rakiza-mail?focus=search")).toBe(true);
    expect(isNavigationPathActive("/tasks", "/")).toBe(false);
  });
});

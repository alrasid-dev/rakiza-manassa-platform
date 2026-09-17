import { describe, expect, it } from "vitest";
import { DASHBOARD_HOME_CARD_IDS, DASHBOARD_NAVIGATION_LABELS, DASHBOARD_QUICK_ACTION_IDS, DASHBOARD_WIDGET_IDS, normalizeDashboardPreferences } from "./court-service";

describe("تفضيلات لوحة القيادة", () => {
  it("يعيد ترتيباً افتراضياً آمناً عند عدم وجود تفضيلات محفوظة", () => {
    expect(normalizeDashboardPreferences(null)).toEqual({ widgetOrder: [...DASHBOARD_WIDGET_IDS], hiddenWidgetIds: [], quickActionOrder: [...DASHBOARD_QUICK_ACTION_IDS], hiddenQuickActionIds: [], navigationOrder: [...DASHBOARD_NAVIGATION_LABELS], hiddenNavigationLabels: [], homeCardOrder: [...DASHBOARD_HOME_CARD_IDS], hiddenHomeCardIds: [] });
  });

  it("يحذف القيم غير المعتمدة والتكرارات ويستعيد الاختصارات المعتمدة المفقودة", () => {
    const preferences = normalizeDashboardPreferences({ widgetOrder: ["tasks", "tasks", "invalid"], hiddenWidgetIds: ["chat", "invalid"], navigationOrder: ["مهامي", "مهامي", "اختصار غير معروف"], hiddenNavigationLabels: ["الدردشات", "اختصار غير معروف"] });
    expect(preferences.widgetOrder).toEqual(["tasks"]);
    expect(preferences.hiddenWidgetIds).toEqual(["chat"]);
    expect(preferences.navigationOrder).toEqual(["مهامي", ...DASHBOARD_NAVIGATION_LABELS.filter(label => label !== "مهامي")]);
    expect(preferences.hiddenNavigationLabels).toEqual(["الدردشات"]);
  });

  it("يحفظ ترتيب شريط العمل السريع وما نُقل منه إلى القائمة الجانبية", () => {
    const defaults = normalizeDashboardPreferences(null);
    expect(defaults.quickActionOrder).toEqual(["my-tasks", "notifications", "chats", "mail", "report-upload"]);
    const preferences = normalizeDashboardPreferences({ quickActionOrder: ["mail", "mail", "غير معروف"], hiddenQuickActionIds: ["chats", "غير معروف"] });
    expect(preferences.quickActionOrder).toEqual(["mail", "my-tasks", "notifications", "chats", "report-upload"]);
    expect(preferences.hiddenQuickActionIds).toEqual(["chats"]);
    expect(preferences.quickActionOrder).toHaveLength(DASHBOARD_QUICK_ACTION_IDS.length);
  });

  it("يحفظ ترتيب بطاقات الشاشة الرئيسية وما أُخفي منها مع استعادة البطاقات المعتمدة المفقودة", () => {
    const preferences = normalizeDashboardPreferences({ homeCardOrder: ["mail", "mail", "غير معروف"], hiddenHomeCardIds: ["chats", "غير معروف"] });
    expect(preferences.homeCardOrder).toEqual(["mail", ...DASHBOARD_HOME_CARD_IDS.filter(id => id !== "mail")]);
    expect(preferences.hiddenHomeCardIds).toEqual(["chats"]);
    expect(preferences.homeCardOrder).toHaveLength(DASHBOARD_HOME_CARD_IDS.length);
  });
});


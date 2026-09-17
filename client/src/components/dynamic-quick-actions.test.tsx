// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DynamicQuickActions, { buildQuickActions, normalizeQuickActionCounts, quickActionCatalog, quickActionsProactiveHint } from "./DynamicQuickActions";

afterEach(() => cleanup());

describe("شريط العمل السريع: خمسة إجراءات حصراً", () => {
  it("يعرض الأزرار الخمسة المعتمدة بترتيبها الافتراضي", () => {
    expect(quickActionCatalog.map(action => action.id)).toEqual(["my-tasks", "notifications", "chats", "mail", "report-upload"]);
    const actions = buildQuickActions({ counts: {} });
    expect(actions.map(action => action.id)).toEqual(["my-tasks", "notifications", "chats", "mail", "report-upload"]);
    expect(actions.map(action => action.path)).toEqual(["/tasks", "/notifications", "/messages", "/rakiza-mail", "/report-upload"]);
  });

  it("يخصص الأعداد السالبة ويعرض العدّاد مع الاسم المقروء", () => {
    expect(normalizeQuickActionCounts({ taskAttention: -3, notifications: Number.NaN, mail: 2.9, chat: 1 })).toEqual({ taskAttention: 0, notifications: 0, chat: 1, mail: 2, urgentMail: 0 });
    const actions = buildQuickActions({ counts: { taskAttention: 3, notifications: 4, mail: 0, chat: 0 } });
    expect(actions.map(action => [action.id, action.count])).toEqual([["my-tasks", 3], ["notifications", 4], ["chats", 0], ["mail", 0], ["report-upload", 0]]);
    expect(actions[0]!.accessibleLabel).toBe("مهامي — 3 عنصر يحتاج متابعة");
    expect(actions[2]!.accessibleLabel).toBe("الدردشات");
  });

  it("يحترم الترتيب المحفوظ وينقل ما أخفاه المستخدم إلى القائمة الجانبية", () => {
    const reordered = buildQuickActions({ quickActionOrder: ["mail", "my-tasks", "chats", "notifications", "report-upload"] });
    expect(reordered.map(action => action.id)).toEqual(["mail", "my-tasks", "chats", "notifications", "report-upload"]);
    const trimmed = buildQuickActions({ hiddenQuickActionIds: ["chats", "report-upload"] });
    expect(trimmed.map(action => action.id)).toEqual(["my-tasks", "notifications", "mail"]);
    expect(buildQuickActions({ hiddenQuickActionIds: ["my-tasks"] }, ).map(action => action.id)).toEqual(["notifications", "chats", "mail", "report-upload"]);
    expect(buildQuickActions({ counts: {}, limit: 2 }).map(action => action.id)).toEqual(["my-tasks", "notifications"]);
  });

  it("يفتح دردشة القسم مباشرة عند توفر معرّف محادثة القسم", () => {
    const withDepartment = buildQuickActions({ departmentConversationId: 42 });
    expect(withDepartment.find(action => action.id === "chats")?.path).toBe("/messages?conversationId=42");
    expect(buildQuickActions({}).find(action => action.id === "chats")?.path).toBe("/messages");
    expect(buildQuickActions({ departmentConversationId: null }).find(action => action.id === "chats")?.path).toBe("/messages");
  });

  it("يبني تنبيهاً استباقياً واحداً يخص أهم متعطل", () => {
    expect(quickActionsProactiveHint({ counts: { urgentMail: 2, notifications: 5 } })).toBe("ابدأ بالبريد العاجل: 2 رسالة عاجلة غير مقروءة تنتظر مراجعتك.");
    expect(quickActionsProactiveHint({ counts: { notifications: 3, taskAttention: 9 } })).toBe("لديك 3 تنبيه غير مقروء في مركز الإشعارات.");
    expect(quickActionsProactiveHint({ counts: { taskAttention: 1 } })).toBe("لديك 1 مهمة قيد التنفيذ تحتاج متابعة قبل موعدها.");
    expect(quickActionsProactiveHint({ counts: { mail: 6 } })).toBe("لديك 6 رسالة غير مقروءة في بريد ركيزة.");
    expect(quickActionsProactiveHint({ counts: { chat: 4 } })).toBe("لديك 4 رسالة دردشة غير مقروءة.");
    expect(quickActionsProactiveHint()).toBe("لا متعطلات عاجلة الآن؛ الأيقونات مرتبة حسب أولوية عملك الحالي.");
  });
});

describe("عرض شريط العمل السريع في الواجهة", () => {
  it("يعرض خمسة أزرار بعدّاداتها وينقل إلى المسار الصحيح", () => {
    const onNavigate = vi.fn();
    render(<DynamicQuickActions counts={{ taskAttention: 3, notifications: 2, chat: 0, mail: 5 }} onNavigate={onNavigate} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
    expect(screen.getByTestId("dynamic-quick-actions").getAttribute("role")).toBe("group");
    expect(screen.getByTestId("quick-action-badge-my-tasks").textContent).toBe("3");
    expect(screen.getByTestId("quick-action-badge-notifications").textContent).toBe("2");
    expect(screen.getByTestId("quick-action-badge-mail").textContent).toBe("5");
    expect(screen.queryByTestId("quick-action-badge-chats")).toBeNull();
    expect(screen.getByTestId("quick-action-badge-notifications").className).toContain("animate-pulse");
    expect(screen.getByTestId("quick-actions-hint").textContent).toBe("لديك 2 تنبيه غير مقروء في مركز الإشعارات.");
    fireEvent.click(screen.getByRole("button", { name: "رفع تقرير" }));
    expect(onNavigate).toHaveBeenCalledWith("/report-upload");
    fireEvent.click(screen.getByRole("button", { name: "مهامي — 3 عنصر يحتاج متابعة" }));
    expect(onNavigate).toHaveBeenCalledWith("/tasks");
  });

  it("يفتح دردشة القسم بالنقر على أيقونة الدردشات عند توفر معرّفها", () => {
    const onNavigate = vi.fn();
    render(<DynamicQuickActions counts={{ chat: 7 }} departmentConversationId={88} onNavigate={onNavigate} />);
    expect(screen.getByTestId("quick-action-badge-chats").textContent).toBe("7");
    fireEvent.click(screen.getByRole("button", { name: "الدردشات — 7 عنصر يحتاج متابعة" }));
    expect(onNavigate).toHaveBeenCalledWith("/messages?conversationId=88");
  });

  it("لا يعرض ما نقله المستخدم إلى القائمة الجانبية", () => {
    render(<DynamicQuickActions counts={{}} hiddenQuickActionIds={["mail", "report-upload"]} onNavigate={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "البريد" })).toBeNull();
    expect(screen.getByRole("button", { name: "الدردشات" })).toBeTruthy();
  });
});


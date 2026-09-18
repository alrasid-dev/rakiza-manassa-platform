// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { saveDraftMutate, updateAssistantPreferencesMutate, saveTemplateMutate, updateEntryMutate, toastError } = vi.hoisted(() => ({ saveDraftMutate: vi.fn(), updateAssistantPreferencesMutate: vi.fn(), saveTemplateMutate: vi.fn(), updateEntryMutate: vi.fn(), toastError: vi.fn() }));

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/RichTextMailEditor", () => ({ default: ({ value = "", onChange }: { value?: string; onChange: (html: string, text: string) => void }) => <textarea aria-label="محتوى الرسالة المنسق" value={value} onChange={event => onChange(`<p>${event.target.value}</p>`, event.target.value)} /> }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ court: { internalMail: { folderCounts: { invalidate: vi.fn() }, list: { invalidate: vi.fn() }, get: { invalidate: vi.fn() } } } }),
    court: {
      internalMail: {
        folderCounts: { useQuery: () => ({ data: { counts: { inbox: 1, sent: 0, drafts: 0, starred: 0, archive: 0, trash: 0 }, unread: 1 } }) },
        list: { useQuery: () => ({ data: [{ entry: { isRead: false, isStarred: false }, message: { id: 81, subject: "متابعة خطاب", body: "يرجى مراجعة الخطاب", importance: "high", sentAt: new Date() }, senderName: "عبدالعزيز الفرض", attachmentCount: 0 }], isLoading: false }) },
        get: { useQuery: () => ({ data: { entry: { isRead: true }, message: { id: 81, senderProfileId: 29, subject: "متابعة خطاب", body: "يرجى مراجعة الخطاب", importance: "high", status: "draft" }, senderName: "عبدالعزيز الفرض", senderJobTitle: "رئيس القسم", recipients: [{ recipientType: "to", fullName: "فريق المتابعة" }], attachments: [] }, isLoading: false }) },
        summarize: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        preferences: { useQuery: () => ({ data: { signature: "مع التحية", signatureImageUrl: null, assistant: { mode: "off", forwardProfileId: null, subjectContains: "", enabledAt: null }, contacts: [], rules: [], templates: [{ id: 51, name: "متابعة رسمية", subject: "محضر متابعة", body: "يرجى مراجعة البنود المرفقة.", bodyHtml: "<p>يرجى مراجعة البنود المرفقة.</p>" }] } }) },
        updatePreferences: { useMutation: () => ({ mutate: vi.fn() }) },
        uploadSignatureImage: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        updateAssistantPreferences: { useMutation: () => ({ mutate: updateAssistantPreferencesMutate, isPending: false }) },
        updateContact: { useMutation: () => ({ mutate: vi.fn() }) },
        saveRule: { useMutation: () => ({ mutate: vi.fn() }) },
        deleteRule: { useMutation: () => ({ mutate: vi.fn() }) },
        saveTemplate: { useMutation: () => ({ mutate: saveTemplateMutate, isPending: false }) },
        assistant: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        schedule: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        recurringSchedules: { useQuery: () => ({ data: [], isLoading: false, refetch: vi.fn() }) },
        scheduleRecurring: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        updateRecurringSchedule: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        saveDraft: { useMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({ messageId: 91 }), mutate: saveDraftMutate, isPending: false }) },
        send: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        updateEntry: { useMutation: () => ({ mutate: updateEntryMutate }) },
      },
      communications: {
        units: { useQuery: () => ({ data: [{ id: 1, name: "وحدة الاختبار" }], isFetching: false }) },
        peopleSearch: { useQuery: () => ({ data: [{ profile: { id: 33, fullName: "موظف الاختبار" }, unitName: "وحدة الاختبار" }], isFetching: false }) },
      },
      people: { self: { useQuery: () => ({ data: { id: 7 } }) } },
    },
  },
}));

import RakizaMailPage from "./RakizaMailPage";

afterEach(() => { cleanup(); saveDraftMutate.mockReset(); updateAssistantPreferencesMutate.mockReset(); saveTemplateMutate.mockReset(); updateEntryMutate.mockReset(); toastError.mockReset(); vi.useRealTimers(); });

describe("بريد ركيزة", () => {
  it("يعرض البريد الوارد ويفتح محرر رسالة داخلية جديدة", () => {
    render(<RakizaMailPage />);
    expect(screen.getByText("بريد ركيزة")).toBeTruthy();
    expect(screen.getAllByText("متابعة خطاب").length).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", { name: "صناديق بريد ركيزة" })).toBeTruthy();
    expect(screen.getByText("تلخيص الرسالة")).toBeTruthy();
    expect(screen.getByLabelText("علامة الرسالة")).toBeTruthy();
    expect(screen.getByTitle("تصدير إلى Outlook")).toBeTruthy();
    expect(screen.getByTitle("جدولة الإرسال")).toBeTruthy();
    fireEvent.click(screen.getByText("إعدادات البريد"));
    expect(screen.getByText("التوقيع الشخصي")).toBeTruthy();
    expect(screen.getByLabelText("مستوى تفويض مساعد البريد")).toBeTruthy();
    fireEvent.click(screen.getAllByText("رسالة جديدة")[0]);
    expect(screen.getByText("رسالة بريد ركيزة جديدة")).toBeTruthy();
    expect(screen.getByPlaceholderText("ابحث بالاسم أو البريد")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "محتوى الرسالة المنسق" })).toBeTruthy();
  });

  it("يعرض حقول البحث المتقدم ويحفظ المسودة تلقائياً بعد التوقف عن الكتابة", () => {
    vi.useFakeTimers();
    render(<RakizaMailPage />);
    fireEvent.click(screen.getByRole("button", { name: "البحث المتقدم" }));
    expect(screen.getByLabelText("تصفية حسب المرسل")).toBeTruthy();
    expect(screen.getByLabelText("تاريخ البداية")).toBeTruthy();
    fireEvent.click(screen.getAllByText("رسالة جديدة")[0]);
    fireEvent.change(screen.getAllByPlaceholderText("الموضوع").at(-1)!, { target: { value: "مسودة تلقائية" } });
    act(() => { vi.advanceTimersByTime(950); });
    expect(saveDraftMutate).toHaveBeenCalled();
  });

  it("يضع البحث داخل القائمة اليمنى ويجعل نافذة الإنشاء أوسع", () => {
    render(<RakizaMailPage />);
    const search = screen.getByPlaceholderText("بحث في البريد");
    expect(search.closest("aside")).toBeTruthy();
    expect(within(search.closest("aside")!).getByRole("button", { name: "البحث المتقدم" })).toBeTruthy();
    expect(screen.getByText("استخدم البحث من القائمة اليمنى")).toBeTruthy();
    fireEvent.click(screen.getAllByText("رسالة جديدة")[0]);
    expect(screen.getByRole("dialog").className).toContain("max-w-5xl");
  });

  it("يوضح متطلبات قالب البريد ولا يعطّل زر الحفظ بصمت", () => {
    render(<RakizaMailPage />);
    fireEvent.click(screen.getAllByText("رسالة جديدة")[0]);
    const templateButton = screen.getByRole("button", { name: "حفظ قالب" }) as HTMLButtonElement;
    expect(templateButton.disabled).toBe(false);
    fireEvent.click(templateButton);
    expect(toastError).toHaveBeenCalledWith("اكتب موضوع الرسالة قبل حفظها قالباً.");
    fireEvent.change(screen.getAllByPlaceholderText("الموضوع").at(-1)!, { target: { value: "محضر متابعة" } });
    fireEvent.change(screen.getByRole("textbox", { name: "محتوى الرسالة المنسق" }), { target: { value: "هذا نص القالب." } });
    fireEvent.click(templateButton);
    expect(saveTemplateMutate).toHaveBeenCalledWith(expect.objectContaining({ name: "محضر متابعة", subject: "محضر متابعة", body: "هذا نص القالب." }));
  });

  it("يطبق القالب الجاهز داخل المسودة من دون حذف المستلم المحدد", () => {
    render(<RakizaMailPage />);
    fireEvent.click(screen.getAllByText("رسالة جديدة")[0]);
    fireEvent.change(screen.getByPlaceholderText("ابحث بالاسم أو البريد"), { target: { value: "موظ" } });
    fireEvent.click(screen.getByText("موظف الاختبار"));
    expect(screen.getByTestId("mail-recipient-chip-33")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("اختيار قالب رسالة"), { target: { value: "51" } });
    expect((screen.getAllByPlaceholderText("الموضوع").at(-1) as HTMLInputElement).value).toBe("محضر متابعة");
    expect((screen.getByRole("textbox", { name: "محتوى الرسالة المنسق" }) as HTMLTextAreaElement).value).toContain("يرجى مراجعة البنود المرفقة.");
    expect(screen.getByTestId("mail-recipient-chip-33")).toBeTruthy();
  });

  it("لا يحفظ الرد التلقائي قبل التأكيد الصريح من صاحب البريد", () => {
    render(<RakizaMailPage />);
    fireEvent.click(screen.getByText("إعدادات البريد"));
    fireEvent.change(screen.getByLabelText("مستوى تفويض مساعد البريد"), { target: { value: "auto_reply" } });
    expect(screen.getByText("أؤكد التفويض الصريح.")).toBeTruthy();
    const replyTone = screen.getByLabelText("نبرة الردود المقترحة") as HTMLSelectElement;
    expect(replyTone.value).toBe("formal");
    fireEvent.change(replyTone, { target: { value: "concise" } });
    const saveButton = screen.getByText("حفظ تفضيلات المساعد") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(saveButton);
    expect(updateAssistantPreferencesMutate).toHaveBeenCalledWith(expect.objectContaining({ mode: "auto_reply", replyTone: "concise", authorizationConfirmed: true }));
  });


  it("يعرض نقطة غير المقروء ومعاينة الرسالة وإجراءات الصف السريعة", () => {
    render(<RakizaMailPage />);
    expect(screen.getByTestId("mail-unread-dot-81")).toBeTruthy();
    expect(screen.getAllByText("عاجل").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "أرشفة رسالة متابعة خطاب" }));
    expect(updateEntryMutate).toHaveBeenCalledWith({ messageId: 81, action: "archive" });
    fireEvent.click(screen.getByRole("button", { name: "حذف رسالة متابعة خطاب" }));
    expect(updateEntryMutate).toHaveBeenCalledWith({ messageId: 81, action: "trash" });
    fireEvent.click(screen.getByRole("button", { name: "إضافة رسالة متابعة خطاب إلى المفضلة" }));
    expect(updateEntryMutate).toHaveBeenCalledWith({ messageId: 81, action: "star" });
    expect(updateEntryMutate).toHaveBeenCalledTimes(3);
  });

  it("يفتح نافذة كتابة مرنة قابلة للتحجيم بدل الحوار الثابت", () => {
    render(<RakizaMailPage />);
    fireEvent.click(screen.getAllByText("رسالة جديدة")[0]);
    const frame = screen.getByTestId("mail-compose-window");
    expect(frame.getAttribute("data-resizable")).toBe("true");
    expect(frame.className).toContain("max-w-5xl");
    expect(screen.getByLabelText("تحجيم نافذة الكتابة")).toBeTruthy();
    expect(screen.getByLabelText("تكبير نافذة الكتابة")).toBeTruthy();
    expect(screen.getByLabelText("تصغير نافذة الكتابة")).toBeTruthy();
    expect(screen.getByLabelText("إغلاق نافذة الكتابة")).toBeTruthy();
  });

  it("يعطّل الإرسال حتى يُضاف مستلم وموضوع ثم يسمح به", () => {
    render(<RakizaMailPage />);
    fireEvent.click(screen.getAllByText("رسالة جديدة")[0]);
    expect((screen.getByRole("button", { name: "إرسال" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("ابحث بالاسم أو البريد"), { target: { value: "موظ" } });
    fireEvent.click(screen.getByText("موظف الاختبار"));
    expect((screen.getByRole("button", { name: "إرسال" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getAllByPlaceholderText("الموضوع").at(-1)!, { target: { value: "طلب متابعة" } });
    expect((screen.getByRole("button", { name: "إرسال" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

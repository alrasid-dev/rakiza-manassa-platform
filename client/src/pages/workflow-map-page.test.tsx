// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  analyzeMutate: vi.fn(),
  distributeMutate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  analyzeOnSuccess: null as ((result: unknown) => void) | null,
  distributeOnSuccess: null as ((result: unknown) => void) | null,
}));

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("sonner", () => ({ toast: { error: harness.toastError, success: harness.toastSuccess } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    court: {
      workflowMap: {
        staff: { useQuery: () => ({ data: [{ id: 1, fullName: "سعد المطيري", unitId: 10, unitName: "قسم شؤون الملازمين", openWorkload: 1 }, { id: 2, fullName: "نورة العتيبي", unitId: 11, unitName: "إدارة الخدمات المشتركة", openWorkload: 0 }] }) },
        analyze: { useMutation: (options: { onSuccess?: (result: unknown) => void }) => { harness.analyzeOnSuccess = options?.onSuccess ?? null; return { mutate: harness.analyzeMutate, isPending: false }; } },
        distribute: { useMutation: (options: { onSuccess?: (result: unknown) => void }) => { harness.distributeOnSuccess = options?.onSuccess ?? null; return { mutate: harness.distributeMutate, isPending: false }; } },
      },
    },
  },
}));

import WorkflowMapPage from "./WorkflowMapPage";

const analysisPayload = {
  map: {
    title: "إجراءات معالجة الطلبات",
    summary: "ملخص الإجراء",
    steps: [
      { order: 1, title: "استلام الطلب وتسجيله", description: "", ownerUnitHint: "", deliverable: "", slaDays: 2, dependsOnOrder: null },
      { order: 2, title: "اعتماد الطلب النهائي", description: "", ownerUnitHint: "", deliverable: "", slaDays: 7, dependsOnOrder: 1 },
    ],
  },
  diagram: {
    width: 500,
    height: 200,
    nodeWidth: 220,
    nodeHeight: 88,
    lanes: 1,
    nodes: [
      { order: 1, title: "استلام الطلب وتسجيله", x: 256, y: 24, width: 220, height: 88, centerX: 366, centerY: 68 },
      { order: 2, title: "اعتماد الطلب النهائي", x: 24, y: 24, width: 220, height: 88, centerX: 134, centerY: 68 },
    ],
    edges: [{ from: 1, to: 2, x1: 256, y1: 68, x2: 244, y2: 68 }],
  },
  extractedText: "١- استلام الطلب",
  method: "ocr",
  model: null,
  documentName: "خطة.txt",
};

function chooseFile(name = "خطة.txt") {
  const file = new File(["١- استلام الطلب وتسجيله"], name, { type: "text/plain" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("١- استلام الطلب وتسجيله").buffer });
  fireEvent.change(screen.getByLabelText(/اختر ملف الإجراءات أو الخطة/), { target: { files: [file] } });
  return file;
}

afterEach(() => { cleanup(); vi.clearAllMocks(); harness.analyzeOnSuccess = null; harness.distributeOnSuccess = null; });

describe("صفحة مخطط سير العمل", () => {
  it("يعطّل التحليل قبل اختيار الملف ثم يرسل المستند إلى الخادم", async () => {
    render(<WorkflowMapPage />);
    const analyzeButton = screen.getByRole("button", { name: /تحليل المستند وبناء المخطط/ }) as HTMLButtonElement;
    expect(analyzeButton.disabled).toBe(true);
    chooseFile();
    expect(analyzeButton.disabled).toBe(false);
    fireEvent.click(analyzeButton);
    await waitFor(() => expect(harness.analyzeMutate).toHaveBeenCalledTimes(1));
    const payload = harness.analyzeMutate.mock.calls[0]![0] as { originalName: string; mimeType: string; contentBase64: string };
    expect(payload.originalName).toBe("خطة.txt");
    expect(payload.mimeType).toBe("text/plain");
    expect(payload.contentBase64.length).toBeGreaterThan(8);
  });

  it("يعرض المخطط وخطواته ويوزّعها آلياً بمطابقة الاسم والوحدة", async () => {
    render(<WorkflowMapPage />);
    chooseFile();
    act(() => { harness.analyzeOnSuccess?.(analysisPayload); });
    expect(screen.getByText("إجراءات معالجة الطلبات")).toBeTruthy();
    expect(screen.getByText("قراءة ذكية بالذكاء الاصطناعي (OCR)")).toBeTruthy();
    expect(screen.getByRole("img", { name: "مخطط سير العمل المتسلسل" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /1\. استلام الطلب وتسجيله/ })).toBeTruthy();
    expect(screen.getByLabelText("أولوية الخطوة 2")).toBeTruthy();
    expect(screen.getByText("سيعتمد النظام الاقتراح الآلي للمنفذين عند الإنشاء.")).toBeTruthy();
    const distributeButton = screen.getByRole("button", { name: /إنشاء المهام وتوزيعها/ }) as HTMLButtonElement;
    expect(distributeButton.disabled).toBe(false);
    fireEvent.click(distributeButton);
    expect(harness.distributeMutate).toHaveBeenCalledWith({
      sourceName: "خطة.txt",
      title: "إجراءات معالجة الطلبات",
      mode: "auto",
      steps: [
        { order: 1, title: "استلام الطلب وتسجيله", description: undefined, assigneeProfileId: 2, priority: "normal", slaDays: 2 },
        { order: 2, title: "اعتماد الطلب النهائي", description: undefined, assigneeProfileId: 1, priority: "normal", slaDays: 7 },
      ],
    });
  });

  it("يشترط إسناداً يدوياً لكل خطوة ثم يعرض المهام المُنشأة", async () => {
    render(<WorkflowMapPage />);
    chooseFile();
    act(() => { harness.analyzeOnSuccess?.(analysisPayload); });
    fireEvent.click(screen.getByRole("button", { name: "توزيع يدوي" }));
    expect(screen.getByText("اختر منفذاً لكل خطوة (0 من 2).")).toBeTruthy();
    expect((screen.getByRole("button", { name: /إنشاء المهام وتوزيعها/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("منفذ الخطوة 1"), { target: { value: "1" } });
    expect(screen.getByText("اختر منفذاً لكل خطوة (1 من 2).")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("منفذ الخطوة 2"), { target: { value: "2" } });
    expect(screen.getByText("سيُسند كل منفذ كما حددته يدوياً.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /إنشاء المهام وتوزيعها/ }));
    expect(harness.distributeMutate).toHaveBeenCalledWith(expect.objectContaining({ mode: "manual", steps: [expect.objectContaining({ order: 1, assigneeProfileId: 1 }), expect.objectContaining({ order: 2, assigneeProfileId: 2 })] }));
    act(() => { harness.distributeOnSuccess?.({ created: [{ order: 1, taskId: 71, assigneeProfileId: 1, title: "استلام الطلب وتسجيله" }] }); });
    expect(screen.getByText("٤. المهام المُنشأة")).toBeTruthy();
    expect(screen.getAllByText(/1\. استلام الطلب وتسجيله/).length).toBeGreaterThan(0);
    expect(screen.getByText("النص المستخرج من المستند (للمراجعة والتدقيق)")).toBeTruthy();
  });
});

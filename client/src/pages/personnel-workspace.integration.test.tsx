// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ permission: "full_control" as "full_control" | "employee", updateCalls: [] as Record<string, unknown>[], listError: null as { message: string } | null }));
const profileData = [{ id: 11, fullName: "موظف مختبر", email: "staff@court.example", employeeNumber: "A-01", personType: "administrative", jobTitle: "باحث", judicialFormation: null, attendanceMode: "in_person", status: "active" }, { id: 12, fullName: "ملازم مختبر", email: "trainee@court.example", employeeNumber: "T-01", personType: "trainee", jobTitle: "ملازم قضائي", judicialFormation: "الدائرة الأولى", attendanceMode: "mixed", status: "active" }, { id: 13, fullName: "قاضٍ منفصل", email: null, employeeNumber: null, personType: "judge", jobTitle: "قاضٍ", judicialFormation: "الدائرة الثانية", attendanceMode: "in_person", status: "active" }];

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>, DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>, DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>, DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>, DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useDialogComposition: () => ({ isComposing: () => false, setComposing: () => undefined, justEndedComposing: () => false, markCompositionEnd: () => undefined }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ court: { people: { list: { invalidate: vi.fn() }, delegations: { invalidate: vi.fn() } } } }),
    court: {
      registration: { myPermission: { useQuery: () => ({ data: state.permission, isLoading: false, error: null }) } },
      myRoles: { useQuery: () => ({ data: [] }) },
      people: {
        list: { useQuery: () => ({ data: profileData, isLoading: false, error: state.listError }) },
        create: { useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }) },
        update: { useMutation: () => ({ isPending: false, error: null, mutate: (input: Record<string, unknown>) => state.updateCalls.push(input) }) },
        deactivate: { useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }) },
        archive: { useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }) },
        delegations: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
        createDelegation: { useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }) },
        updateDelegationStatus: { useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }) },
      },
      tasks: {
        pauseAllForProfile: { useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }) },
        resumeAllForProfile: { useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }) },
      },
    },
  },
}));

import PersonnelWorkspaceContent from "./PersonnelWorkspaceContent";

beforeEach(() => { state.permission = "full_control"; state.updateCalls.length = 0; state.listError = null; });
afterEach(() => cleanup());

describe("إدارة الملفات التشغيلية", () => {
  it("تعرض الموظفين والملازمين فقط وتستدعي تعديل الملف من الواجهة", () => {
    render(<PersonnelWorkspaceContent />);
    fireEvent.click(screen.getByRole("button", { name: /غير مصنف في قسم/ }));
    expect(screen.getByText("موظف مختبر")).toBeTruthy();
    expect(screen.getByText("ملازم مختبر")).toBeTruthy();
    expect(screen.getByText("حضوري")).toBeTruthy();
    expect(screen.getByText("هجين")).toBeTruthy();
    expect(screen.getByLabelText("رفع تقرير لـ موظف مختبر")).toBeTruthy();
    expect(screen.getByLabelText("رفع تقرير لـ ملازم مختبر")).toBeTruthy();
    expect(screen.queryByText("قاضٍ منفصل")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "تعديل" })[0]!);
    expect(screen.getByLabelText("المدير المباشر")).toBeTruthy();
    const jobTitles = screen.getAllByPlaceholderText("المسمى الوظيفي");
    fireEvent.change(jobTitles[jobTitles.length - 1]!, { target: { value: "باحث أول" } });
    fireEvent.submit(jobTitles[jobTitles.length - 1]!.closest("form")!);
    expect(state.updateCalls).toEqual([expect.objectContaining({ profileId: 11, jobTitle: "باحث أول" })]);
  });

  it("يحجب الإضافة والتعديل والإيقاف عن صلاحية الموظف", () => {
    state.permission = "employee";
    render(<PersonnelWorkspaceContent />);
    fireEvent.click(screen.getByRole("button", { name: /غير مصنف في قسم/ }));
    expect(screen.getByText("موظف مختبر")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "تعديل" })).toBeNull();
    expect(screen.queryByRole("button", { name: "إيقاف" })).toBeNull();
  });

  it("يعرض رسالة خطأ عربية عند تعذر تحميل قائمة الملفات", () => {
    state.listError = { message: "تعذر تحميل الملفات التشغيلية" };
    render(<PersonnelWorkspaceContent />);
    expect(screen.getByRole("alert").textContent).toContain("تعذر تحميل الملفات التشغيلية");
  });
});

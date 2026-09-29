// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ permission: "full_control" as "full_control" | "employee", createCalls: [] as Record<string, unknown>[], updateCalls: [] as Record<string, unknown>[], archiveCalls: [] as Record<string, unknown>[] }));
const mutation = (calls: Record<string, unknown>[]) => ({ isPending: false, error: null, mutate: (input: Record<string, unknown>) => calls.push(input) });

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ court: { judges: { list: { invalidate: vi.fn() } } } }),
    court: {
      judges: {
        list: { useQuery: () => ({ data: [{ id: 300, fullName: "القاضي المختبَر", email: "judge@court.example", employeeNumber: "J-01", personType: "judge", status: "active", jobTitle: "قاضٍ", judicialFormation: "الدائرة الأولى", attendanceMode: "in_person" }], isLoading: false, error: null }) },
        withoutEmail: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
        create: { useMutation: () => mutation(state.createCalls) },
        update: { useMutation: () => mutation(state.updateCalls) },
        archive: { useMutation: () => mutation(state.archiveCalls) },
      },
      registration: { myPermission: { useQuery: () => ({ data: state.permission, isLoading: false, error: null }) } },
    },
  },
}));

import { JudgesPage } from "./JudgesPage";

beforeEach(() => { state.permission = "full_control"; state.createCalls.length = 0; state.updateCalls.length = 0; state.archiveCalls.length = 0; });
afterEach(() => cleanup());

describe("واجهة شؤون القضاة", () => {
  it("تعرض الملف وتمكّن الصلاحية الكاملة من إنشاء ملف قاضٍ", () => {
    render(<JudgesPage />);
    expect(screen.getByText("القاضي المختبَر")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("الاسم الكامل"), { target: { value: "قاضٍ جديد" } });
    fireEvent.submit(screen.getByPlaceholderText("الاسم الكامل").closest("form")!);
    expect(state.createCalls).toEqual([expect.objectContaining({ fullName: "قاضٍ جديد", status: "active" })]);
  });

  it("يحمل الملف في النموذج ويستدعي تعديل الملف من داخل القسم", () => {
    render(<JudgesPage />);
    fireEvent.click(screen.getByRole("button", { name: "تعديل" }));
    expect((screen.getByPlaceholderText("الاسم الكامل") as HTMLInputElement).value).toBe("القاضي المختبَر");
    fireEvent.change(screen.getByPlaceholderText("التشكيل القضائي"), { target: { value: "الدائرة الثانية" } });
    fireEvent.submit(screen.getByPlaceholderText("الاسم الكامل").closest("form")!);
    expect(state.updateCalls).toEqual([expect.objectContaining({ judgeId: 300, judicialFormation: "الدائرة الثانية" })]);
  });

  it("يحجب نماذج الإضافة والتعديل عن صلاحية الموظف", () => {
    state.permission = "employee";
    render(<JudgesPage />);
    expect(screen.getByText("القاضي المختبَر")).toBeTruthy();
    expect(screen.queryByPlaceholderText("الاسم الكامل")).toBeNull();
    expect(screen.queryByRole("button", { name: "تعديل" })).toBeNull();
  });
});

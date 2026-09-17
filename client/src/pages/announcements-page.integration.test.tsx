// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ permission: "full_control" as "full_control" | "employee", isOwner: true, createCalls: [] as Record<string, unknown>[] }));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { role: state.isOwner ? "admin" : "user" } }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ court: { announcements: { list: { invalidate: vi.fn() } } } }),
    court: {
      registration: { myPermission: { useQuery: () => ({ data: state.permission }) } },
      announcements: { list: { useQuery: () => ({ data: [], isLoading: false, error: null }) }, create: { useMutation: () => ({ isPending: false, error: null, mutate: (input: Record<string, unknown>) => state.createCalls.push(input) }) }, update: { useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }) }, delete: { useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }) } },
      units: { list: { useQuery: () => ({ data: [{ id: 4, name: "شؤون الملازمين" }] }) } },
    },
  },
}));

import { AnnouncementsPage } from "./AnnouncementsPage";

beforeEach(() => { state.permission = "full_control"; state.isOwner = true; state.createCalls.length = 0; });
afterEach(() => cleanup());

describe("مركز الإعلانات الداخلية", () => {
  it("يمكّن مالك الصلاحية الكاملة من نشر إعلان عام", () => {
    render(<AnnouncementsPage />);
    fireEvent.change(screen.getByPlaceholderText("عنوان الإعلان"), { target: { value: "تنبيه تشغيلي" } });
    fireEvent.change(screen.getByPlaceholderText("نص الإعلان"), { target: { value: "سيتم تحديث النماذج مساء اليوم" } });
    fireEvent.click(screen.getByRole("button", { name: "نشر الإعلان" }));
    expect(state.createCalls).toEqual([expect.objectContaining({ title: "تنبيه تشغيلي", body: "سيتم تحديث النماذج مساء اليوم", visibility: "all" })]);
  });

  it("يحجب نموذج النشر عن صلاحية الموظف مع بقاء قائمة الإعلانات", () => {
    state.permission = "employee";
    render(<AnnouncementsPage />);
    expect(screen.getByText("الإعلانات الظاهرة لك")).toBeTruthy();
    expect(screen.queryByText("نشر إعلان")).toBeNull();
    expect(screen.queryByRole("button", { name: "نشر الإعلان" })).toBeNull();
  });

  it("يحجب نموذج النشر عن مستخدم تحكم كامل لا يملك المنصة", () => {
    state.isOwner = false;
    render(<AnnouncementsPage />);
    expect(screen.getByText("الإعلانات الظاهرة لك")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "نشر الإعلان" })).toBeNull();
  });
});

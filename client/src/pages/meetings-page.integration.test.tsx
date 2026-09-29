// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ court: { meetings: { list: { invalidate: vi.fn() } } } }),
    court: {
      registration: { myPermission: { useQuery: () => ({ data: "general_view" }) } },
      myRoles: { useQuery: () => ({ data: ["court_president"] }) },
      people: {
        list: { useQuery: () => ({ data: [{ id: 7, fullName: "موظف تجريبي" }] }) },
        listDepartmentManagers: { useQuery: () => ({ data: [] }) },
      },
      units: { list: { useQuery: () => ({ data: [] }) } },
      meetings: {
        list: { useQuery: () => ({ data: [{ id: 1, title: "اجتماع تجريبي", scheduledAt: new Date("2026-08-20T07:00:00Z"), location: "قاعة المحكمة", status: "scheduled", agenda: "مراجعة الأداء", minutes: null, recommendations: null }], isLoading: false }) },
        create: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        invite: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        minutes: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        attendees: { useQuery: () => ({ data: [] }) },
        addTask: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      },
    },
  },
}));

import { MeetingsPage } from "./MeetingsPage";
afterEach(() => cleanup());
describe("صفحة الاجتماعات", () => {
  it("تعرض الموعد ومحاور الاجتماع وأداة المحضر", () => {
    render(<MeetingsPage />);
    expect(screen.getByText("الاجتماعات والمحاضر")).toBeTruthy();
    expect(screen.getByText("اجتماع تجريبي")).toBeTruthy();
    expect(screen.getByText("مراجعة الأداء")).toBeTruthy();
    expect(screen.getByRole("button", { name: "حفظ المحضر" })).toBeTruthy();
  });
});

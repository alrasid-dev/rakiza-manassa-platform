// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DashboardData = { templates?: number; openDelays?: number; overdueDelays?: number; profiles?: number; dueTasks?: number; openTasks?: number; overdueTasks?: number; unreadNotifications?: number };

const state = vi.hoisted(() => ({
  permission: "full_control" as "full_control" | "employee" | "trainee",
  roles: ["court_president"] as string[],
  dashboard: { templates: 7, openDelays: 2, overdueDelays: 1, profiles: 16, dueTasks: 4 } as DashboardData,
  taskStatus: "new",
}));

vi.mock("@/components/DashboardLayout", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/DashboardLayout")>();
  return { ...actual, default: ({ children }: { children: ReactNode }) => <main>{children}</main> };
});
vi.mock("@/lib/trpc", () => ({
  trpc: {
    court: {
      registration: { myPermission: { useQuery: () => ({ data: state.permission, isLoading: false, error: null }) } },
      myRoles: { useQuery: () => ({ data: state.roles, isLoading: false, error: null }) },
      dashboard: { useQuery: () => ({ data: state.dashboard, isLoading: false, error: null }) },
      tasks: { list: { useQuery: () => ({ data: [{ id: 17, title: "متابعة خطاب تجريبي", status: state.taskStatus, dueAt: "2027-08-26T11:00:00.000Z", scheduledAt: "2027-08-26T08:00:00.000Z", assigneeProfileId: 17, unitName: "وحدة الاختبار" }], isLoading: false, error: null }) } },
      communications: { conversations: { unreadCount: { useQuery: () => ({ data: 2, isLoading: false, error: null }) } } },
      people: { list: { useQuery: () => ({ data: [], isLoading: false, error: null }) }, self: { useQuery: () => ({ data: { id: 17 }, isLoading: false, error: null }) } },
      units: { list: { useQuery: () => ({ data: [], isLoading: false, error: null }) } },
      reports: { operational: { useQuery: () => ({ data: undefined, isLoading: false, error: null }) } },
      attendance: { remoteReport: { useQuery: () => ({ data: [], isLoading: false, error: null }) } },
    },
  },
}));

import Home from "./Home";

beforeEach(() => { state.permission = "full_control"; state.roles = ["court_president"]; state.dashboard = { templates: 7, openDelays: 2, overdueDelays: 1, profiles: 16, dueTasks: 4 }; state.taskStatus = "new"; });
afterEach(() => cleanup());

describe("لوحة القيادة المدمجة حسب الدور", () => {
  it("تعرض الشبكة الرئيسية الملوّنة للقيادة بعدّاداتها الحية", () => {
    render(<Home />);
    expect(screen.getByText("لوحة القيادة المدمجة")).toBeTruthy();
    expect(screen.getByRole("region", { name: "الشبكة الرئيسية" })).toBeTruthy();
    for (const label of ["مهام قيد التنفيذ", "قرب موعدها", "متأخرة", "تمت المعالجة", "الإشعارات", "الدردشات", "بريد ركيزة", "رفع تقرير", "هيكل المحكمة", "المداورة", "المتعثرات", "AI ركيزة", "الإعلانات"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/قيد التنفيذ/)).toBeTruthy();
    expect(screen.getByText(/قرب موعدها/)).toBeTruthy();
    expect(screen.getByText(/متأخرة/)).toBeTruthy();
  });

  it("يحجب الشبكة عن الموظف ويعرض مهامه الشخصية وعدّاداتها", () => {
    state.permission = "employee";
    state.roles = [];
    state.dashboard = { openTasks: 3, overdueTasks: 1, openDelays: 2, unreadNotifications: 4 };
    render(<Home />);
    expect(screen.getByText("مساحتي اليومية")).toBeTruthy();
    expect(screen.getByRole("region", { name: "الشبكة الرئيسية" })).toBeTruthy();
    expect(screen.getByText("4 مهمة مفتوحة")).toBeTruthy();
    expect(screen.getByText("1 متأخر")).toBeTruthy();
    expect(screen.getByText("4 تنبيه جديد")).toBeTruthy();
    expect(screen.getAllByText("مهام قيد التنفيذ").length).toBeGreaterThan(0);
    expect(screen.getAllByText("قرب موعدها").length).toBeGreaterThan(0);
    expect(screen.getAllByText("متأخرة").length).toBeGreaterThan(0);
    expect(screen.getAllByText("تمت المعالجة").length).toBeGreaterThan(0);
    expect(screen.getByText("رفع تقرير")).toBeTruthy();
    // بطاقات القيادة محجوبة تماماً عن الموظف
    expect(screen.queryByText("المداورة")).toBeNull();
    expect(screen.queryByText("هيكل المحكمة")).toBeNull();
    expect(screen.queryByText("إعدادات المنصة")).toBeNull();
  });
});

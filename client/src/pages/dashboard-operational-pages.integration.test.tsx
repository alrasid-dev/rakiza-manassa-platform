// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const query = <T,>(data: T) => ({ data, isLoading: false, error: null });
const mutation = { isPending: false, error: null, mutate: vi.fn(), mutateAsync: vi.fn(async () => undefined) };
const leader = { id: 1, role: "admin" as const, name: "رئيس المحكمة", email: "president@court.example", openId: "president" };

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      auth: { me: { setData: vi.fn(), invalidate: vi.fn() } },
      court: { people: { list: { invalidate: vi.fn() }, delegations: { invalidate: vi.fn() } }, trainees: { overview: { invalidate: vi.fn() } }, notifications: { listMine: { invalidate: vi.fn() } } },
    }),
    auth: { me: { useQuery: () => query(leader) }, logout: { useMutation: () => mutation } },
    court: {
      registration: { myPermission: { useQuery: () => query("full_control") } },
      myRoles: { useQuery: () => query(["court_president"]) },
      management: { list: { useQuery: () => query([]) }, assign: { useMutation: () => mutation }, end: { useMutation: () => mutation } },
      dashboard: { useQuery: () => query({ profiles: 12, openTasks: 4, overdueTasks: 1, openDelays: 2, overdueDelays: 0, dueTasks: 1, unreadNotifications: 0 }) },
      notifications: { listMine: { useQuery: () => query([]) }, markRead: { useMutation: () => mutation } },
      attendance: { remoteReport: { useQuery: () => query([]) } },
      people: { self: { useQuery: () => query({ id: 10, fullName: "موظف ضمن الجلسة", personType: "administrative", status: "active", jobTitle: "موظف إداري", judicialFormation: null, unitId: 1, unitName: "شؤون الملازمين", unitCode: "trainee_affairs" }) }, list: { useQuery: () => query([{ id: 10, fullName: "موظف ضمن الجلسة", personType: "administrative", status: "active", jobTitle: "موظف إداري", judicialFormation: null, unitId: 1 }]) }, create: { useMutation: () => mutation }, delegations: { useQuery: () => query([]) }, createDelegation: { useMutation: () => mutation }, updateDelegationStatus: { useMutation: () => mutation } },
      trainees: { overview: { useQuery: () => query([{ profile: { id: 22, fullName: "ملازم ضمن الجلسة", judicialFormation: "الدائرة الأولى" }, transferState: "ready", points: 8, openDelayCount: 0, incompleteTaskCount: 0, transferReasons: [] }]) }, templates: { useQuery: () => query([{ id: 31, title: "قالب الملازمين", frequency: "daily", dueHourLocal: 13 }]) }, setDuration: { useMutation: () => mutation }, renew: { useMutation: () => mutation } },
      units: { list: { useQuery: () => query([{ id: 1, name: "شؤون الملازمين" }]) } },
      reports: { operational: { useQuery: () => query({ period: "daily", tasks: { total: 2, completed: 1, overdue: 0 }, delays: { total: 0, open: 0, overdue: 0 }, scores: { positive: 2, negative: 0 }, transfers: { ready: 1, notReady: 0 }, ranking: [] }) } },
      dashboardDepartmentPerformance: { useQuery: () => query([{ unitId: 1, unitName: "شؤون الملازمين", total: 4, completed: 3, overdue: 1, open: 0, completionRate: 75, overdueRate: 25 }]) },
      dashboardDepartmentPerformanceDetails: { useQuery: () => query([]) },
      dashboardDepartmentPerformanceComparison: { useQuery: () => query({ current: [[], []], previous: [[], []] }) },
      sendPerformanceRecommendation: { useMutation: () => mutation },
      scoring: { list: { useQuery: () => query([]) } },
    },
  },
}));

import Home from "./Home";
import { PeoplePage, ReportsDashboardPage, TraineeManagementPage } from "./FunctionalPages";
import DashboardLayout from "@/components/DashboardLayout";

afterEach(() => cleanup());

Object.defineProperty(globalThis, "ResizeObserver", { writable: true, value: class { observe() {} unobserve() {} disconnect() {} } });

describe("الصفحات التشغيلية داخل جلسة قيادية", () => {
  it("يعرض تخطيط لوحة التحكم والبيانات النهائية للأفراد بعد auth.me", () => {
    render(<PeoplePage />);
    expect(screen.getByText("رئيس المحكمة")).toBeTruthy();
    expect(screen.getByText("موظف ضمن الجلسة")).toBeTruthy();
    expect(screen.queryByText(/بوابة الإدارة الداخلية/)).toBeNull();
  });

  it("يعرض دورة الملازم ضمن الجلسة القيادية دون حالة تحميل أو خطأ", () => {
    render(<TraineeManagementPage />);
    expect(screen.getByText("ملازم ضمن الجلسة")).toBeTruthy();
    expect(screen.getByText("جاهز للنقل")).toBeTruthy();
    expect(screen.queryByText(/جارٍ تحميل ملفات الملازمين/)).toBeNull();
  });

  it("يعرض مؤشرات التقرير بعد auth.me ضمن التخطيط الفعلي", () => {
    render(<ReportsDashboardPage />);
    expect(screen.getAllByText("التقارير المنفصلة").length).toBeGreaterThan(0);
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.queryByText(/جارٍ احتساب التقرير/)).toBeNull();
  });

  it("يعرض لوحة القيادة المدمجة بشبكة بطاقاتها الملوّنة", () => {
    render(<Home />);
    expect(screen.getByText("لوحة القيادة المدمجة")).toBeTruthy();
    expect(screen.getByRole("region", { name: "الشبكة الرئيسية" })).toBeTruthy();
    expect(screen.getAllByText("المداورة").length).toBeGreaterThan(0);
    expect(screen.getAllByText("هيكل المحكمة").length).toBeGreaterThan(0);
    expect(screen.getByText(/قيد التنفيذ/)).toBeTruthy();
    expect(screen.queryByLabelText("نوع المهمة")).toBeNull();
    expect(screen.queryByText("PDF")).toBeNull();
    expect(screen.queryByText("صورة")).toBeNull();
  });

  it("يحتوي مساحة المحتوى على الجوال ولا يترك امتداداً أفقياً في التخطيط", () => {
    const { container } = render(<DashboardLayout><div>محتوى جوال تجريبي</div></DashboardLayout>);
    expect(container.firstElementChild?.classList.contains("overflow-x-hidden")).toBe(true);
    const main = screen.getByText("محتوى جوال تجريبي").closest("main");
    expect(main?.classList.contains("w-full")).toBe(true);
    expect(main?.classList.contains("min-w-0")).toBe(true);
  });
});

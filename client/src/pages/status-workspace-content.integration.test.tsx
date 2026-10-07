// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const people = [
  { id: 1, fullName: "موظف عن بعد", personType: "administrative", attendanceMode: "remote", status: "active" },
  { id: 2, fullName: "قاضٍ مختبر", personType: "judge", attendanceMode: "in_person", status: "active" },
  { id: 3, fullName: "ملازم غير مشمول", personType: "trainee", attendanceMode: "in_person", status: "active" },
];

vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ court: { attendance: { list: { invalidate: vi.fn() } }, leave: { list: { invalidate: vi.fn() } } } }), court: { registration: { myPermission: { useQuery: () => ({ data: "employee" }) } }, myRoles: { useQuery: () => ({ data: ["court_president"] }) }, notificationPreferences: { get: { useQuery: () => ({ data: null }) }, set: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } }, units: { list: { useQuery: () => ({ data: [] }) } }, people: { list: { useQuery: () => ({ data: people }) } }, achievements: { mine: { useQuery: () => ({ data: { summary: { positive: 8, negative: 2, balance: 6 } }, error: null }) } }, disciplinary: { mine: { useQuery: () => ({ data: [{ id: 5, status: "pending", requestNote: "متابعة آلية", sourceLabel: "مهمة مختبرة" }], error: null }) } }, attendance: { confirmationConfig: { useQuery: () => ({ data: { isActive: false, cronExpression: "0 0 4-12 * * 0-4" }, isLoading: false }) }, updateConfirmationConfig: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) }, self: { useQuery: () => ({ data: people[0] }) }, serverClock: { useQuery: () => ({ data: { now: new Date("2026-08-14T07:00:00Z") } }) }, list: { useQuery: () => ({ data: [] }) }, remoteReport: { useQuery: () => ({ data: [{ attendance: { id: 91, recordDate: new Date("2026-08-14T07:00:00Z"), status: "present" }, profileName: "موظف عن بعد", attendanceMode: "remote", unitId: 44 }], error: null }) }, confirmationTargetCount: { useQuery: () => ({ data: 2 }) }, record: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) }, checkout: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) }, pendingAssignment: { useQuery: () => ({ data: { id: 1, scheduledAt: new Date("2026-08-14T07:00:00Z") } }) }, confirmAttendance: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } }, balances: { myAvailableMonths: { useQuery: () => ({ data: [] }) }, myMonthlyBalance: { useQuery: () => ({ data: null }) }, myCumulativeBalance: { useQuery: () => ({ data: { positiveMinutes: 0, negativeMinutes: 0, excuseMinutes: 0, netMinutes: 0 } }) } }, leave: { list: { useQuery: () => ({ data: [] }) }, substitutes: { useQuery: () => ({ data: [{ id: 4, fullName: "بديل مختبر" }], isLoading: false, error: null }) }, submit: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } } } } }));

import StatusWorkspaceContent from "./StatusWorkspaceContent";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("مساحة الحالة اليومية", () => {
  it("تمكّن الموظف العامل عن بعد من تسجيل حضوره في ملفه فقط", () => {
    render(<StatusWorkspaceContent />);
    const attendanceForm = screen.getByText("حضور وانصراف العاملين عن بعد").closest("form");
    expect(attendanceForm).toBeTruthy();
    expect(within(attendanceForm!).getByRole("option", { name: /موظف عن بعد/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /تسجيل الانصراف/ })).toBeTruthy();
    expect(within(attendanceForm!).queryByRole("option", { name: /قاضٍ مختبر/ })).toBeNull();
    expect(within(attendanceForm!).queryByRole("option", { name: /ملازم غير مشمول/ })).toBeNull();
    expect(screen.getByText("رصيد الإنجاز الشخصي")).toBeTruthy();
    expect(screen.getByText("المساءلات المرتبطة بملفك")).toBeTruthy();
    expect(screen.getByText("مهمة مختبرة")).toBeTruthy();
    expect(screen.getByText("تقرير حضور العاملين عن بُعد")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("إرسال الحضور: متوقف");
    expect(screen.getAllByText("موظف عن بعد").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("عدد المستهدفين: 2 موظف")).toBeTruthy();
  });

  it("يعرض مودال تأكيد الحضور الآلي عند وجود pending", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-08-14T07:00:00Z").getTime());
    render(<StatusWorkspaceContent />);
    expect(screen.getByRole("heading", { name: "تأكيد الحضور" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "تأكيد الحضور الآن" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "إغلاق" })).toBeTruthy();
  });
});

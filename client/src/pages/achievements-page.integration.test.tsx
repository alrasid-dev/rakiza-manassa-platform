// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/trpc", () => ({ trpc: { court: { registration: { myPermission: { useQuery: () => ({ data: "trainee", isLoading: false, error: null }) } }, myRoles: { useQuery: () => ({ data: [], isLoading: false, error: null }) }, achievements: { mine: { useQuery: () => ({ data: { profile: { id: 12, fullName: "ملازم مختبر", personType: "trainee" }, summary: { positive: 8, negative: 3, balance: 5 }, performance: { tier: "steady", label: "أداء مستقر", description: "يعكس المؤشر توازناً إيجابياً في الحركات المسجلة خلال الفترة الحالية." }, events: [{ event: { id: 1, points: 8, reason: "إنجاز مهمة", createdAt: new Date("2026-08-14T06:00:00Z") }, createdByName: "النظام" }, { event: { id: 2, points: -3, reason: "تأخر معتمد", createdAt: new Date("2026-08-13T06:00:00Z") }, createdByName: "مدير القسم" }], reports: [{ id: 7, title: "تقرير إنجاز مختبر", originalName: "المصنف 1.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", summary: "ملف Excel", createdAt: new Date("2026-08-14T07:00:00Z"), linkedTaskId: 22, url: "https://storage.example/report.xlsx" }] }, isLoading: false, error: null }) }, departments: { useQuery: () => ({ data: undefined, isLoading: false, error: null }) }, compareDepartments: { useQuery: () => ({ data: [], isLoading: false, error: null }) } } } } }));

import { AchievementsPage } from "./AchievementsPage";

afterEach(() => cleanup());

describe("واجهة سجل الإنجازات", () => {
  it("تعرض ملخص النقاط وحركات الملف الذاتي وملف التقرير", () => {
    render(<AchievementsPage />);
    expect(screen.getByText("ملازم مختبر")).toBeTruthy();
    expect(screen.getByText("إنجاز مهمة")).toBeTruthy();
    expect(screen.getByText("تأخر معتمد")).toBeTruthy();
    expect(screen.getAllByText("+8").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-3").length).toBeGreaterThan(0);
    expect(screen.getByText("أداء مستقر")).toBeTruthy();
    expect(screen.getByText(/مؤشر متابعة مستخرج من حركات النقاط/)).toBeTruthy();
  });
});

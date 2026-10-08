// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTrpcMock, DEFAULT_TRPC_OVERRIDES, installBrowserStubs } from "@/test/ui-harness";

const mocks = vi.hoisted(() => ({ teamCases: [] as any[] }));

vi.mock("@/lib/trpc", () =>
  createTrpcMock({
    ...DEFAULT_TRPC_OVERRIDES,
    "court.units.list": [],
    "court.people.list": [],
    "court.disciplinary.mine": [],
    "court.disciplinary.teamLog": [],
    "court.disciplinary.myTeam": mocks.teamCases,
  }),
);

vi.mock("@/components/DashboardLayout", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/DashboardLayout")>();
  return {
    ...actual,
    default: ({ children }: { children: React.ReactNode }) => <main data-testid="rakiza-shell">{children}</main>,
  };
});

import DisciplinaryPage from "./DisciplinaryPage";

beforeEach(() => {
  installBrowserStubs();
  mocks.teamCases.length = 0;
});
afterEach(() => {
  cleanup();
});

const actionableCase = {
  id: 1,
  status: "under_review",
  source: "task",
  sourceLabel: "مساءلة مهمة",
  employeeName: "موظفة اختبار",
  requestNote: "تأخر في إنجاز المهمة المكلفة بها",
  createdAt: new Date("2026-10-08T08:00:00Z"),
};

describe("صفحة المساءلات — أزرار القرار", () => {
  it("تعرض أزرار الاعتماد والرفض والعودة للمساءلة القابلة للبت", () => {
    mocks.teamCases.push(actionableCase);
    render(<DisciplinaryPage />);

    expect(screen.getByRole("button", { name: /اعتماد/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /رفض/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /عودة للتصحيح/ })).toBeTruthy();
  });

  it("تعطّل أزرار القرار للمساءلة المنتهية", () => {
    mocks.teamCases.push({ ...actionableCase, id: 2, status: "approved" });
    render(<DisciplinaryPage />);

    const approveBtn = screen.getByRole("button", { name: /اعتماد/ }) as HTMLButtonElement;
    const rejectBtn = screen.getByRole("button", { name: /رفض/ }) as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(true);
    expect(rejectBtn.disabled).toBe(true);
  });

  it("لا تعرض أزرار القرار عند غياب مساءلات الفريق", () => {
    render(<DisciplinaryPage />);
    expect(screen.queryByRole("button", { name: /اعتماد/ })).toBeNull();
  });
});

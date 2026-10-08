// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTrpcMock, DEFAULT_TRPC_OVERRIDES, installBrowserStubs } from "@/test/ui-harness";

const mocks = vi.hoisted(() => ({
  tasks: [] as any[],
  records: { records: [] as any[], total: 0 },
  person: {
    id: 100,
    fullName: "موظفة اختبار",
    personType: "administrative",
    status: "active",
    attendanceMode: "remote",
    unitId: 5,
  },
}));

vi.mock("@/lib/trpc", () =>
  createTrpcMock({
    ...DEFAULT_TRPC_OVERRIDES,
    "court.people.list": [mocks.person],
    "court.units.list": [],
    "court.tasks.list": mocks.tasks,
    "court.tasks.listRecords": mocks.records,
  }),
);

import TasksWorkspaceContent from "./TasksWorkspaceContent";

beforeEach(() => {
  installBrowserStubs();
  mocks.tasks.length = 0;
  mocks.records.records.length = 0;
  mocks.records.total = 0;
});
afterEach(() => {
  cleanup();
});

const taskRow = {
  id: 101,
  title: "مهمة اختبار الواجهة",
  assigneeProfileId: 100,
  status: "in_progress",
  scheduledFor: new Date("2026-10-08T08:00:00Z"),
  dueAt: new Date("2026-10-08T14:00:00Z"),
  isOpen: false,
  taskNotes: "",
  priority: "normal",
  taskType: "permanent",
};

describe("مساحة المهام — جدول المهام المسجلة", () => {
  it("يعرض صف المهمة في جدول المهام المسجلة", () => {
    mocks.tasks.push(taskRow);
    render(<TasksWorkspaceContent />);

    expect(screen.getByText("مهمة اختبار الواجهة")).toBeTruthy();
  });
});

describe("مساحة المهام — مودال إلغاء المهمة", () => {
  it("يفتح مودال الإلغاء ويتطلب سبباً من 10 أحرف", () => {
    mocks.records.records.push({
      id: 202,
      title: "مهمة سجل قابلة للإلغاء",
      status: "new",
      scheduledFor: new Date("2026-10-08T08:00:00Z"),
      dueAt: new Date("2026-10-08T14:00:00Z"),
      isOpen: false,
      archivedAt: null,
    });
    mocks.records.total = 1;

    render(<TasksWorkspaceContent />);

    fireEvent.click(screen.getByRole("button", { name: /السجلات/ }));

    const cancelButton = screen.getByRole("button", { name: "إلغاء" });
    fireEvent.click(cancelButton);

    expect(screen.getByRole("heading", { name: "إلغاء المهمة" })).toBeTruthy();

    const confirmButton = screen.getByRole("button", { name: "تأكيد الإلغاء" }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
  });
});

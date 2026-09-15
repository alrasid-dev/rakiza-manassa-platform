// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskStateBadge } from "./TasksWorkspaceContent";

afterEach(() => { cleanup(); });

describe("أيقونة حالة المهمة التفاعلية", () => {
  it("تعرض أيقونة التنبيه العاجل للمهمة المتأخرة مع تلميح", () => {
    render(<TaskStateBadge state="overdue" statusLabel="متأخرة" stateText="بدأ التأخير" />);
    expect(screen.getByRole("button", { name: "تأخير عاجل" })).toBeTruthy();
    expect(screen.getByTitle("تأخير عاجل")).toBeTruthy();
  });

  it("تعرض أيقونة البدء للمهمة الجديدة القريبة", () => {
    render(<TaskStateBadge state="starting" statusLabel="جديدة" stateText="مهمة جديدة تبدأ الآن" />);
    expect(screen.getByRole("button", { name: "بدء المهمة" })).toBeTruthy();
  });

  it("تعرض أيقونة التحذير لقرب الاستحقاق", () => {
    render(<TaskStateBadge state="due_soon" statusLabel="قيد التنفيذ" stateText="قريب الاستحقاق" />);
    expect(screen.getByRole("button", { name: "قرب الاستحقاق" })).toBeTruthy();
  });

  it("تستدعي إجراء التنفيذ عند الضغط على الأيقونة", () => {
    const onActivate = vi.fn();
    render(<TaskStateBadge state="starting" statusLabel="جديدة" stateText="مهمة جديدة تبدأ الآن" onActivate={onActivate} />);
    fireEvent.click(screen.getByRole("button", { name: "بدء المهمة" }));
    expect(onActivate).toHaveBeenCalled();
  });

  it("تعطّل زر الأيقونة عند غياب إجراء تنفيذي", () => {
    render(<TaskStateBadge state="completed" statusLabel="مكتملة" stateText="منجز" />);
    const button = screen.getByRole("button", { name: "منجزة" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { recordMutate, checkoutMutate, recordOptions, checkoutOptions, toastError } = vi.hoisted(() => ({
  recordMutate: vi.fn(),
  checkoutMutate: vi.fn(),
  recordOptions: { current: null as { onSuccess?: () => void; onError?: (error: { message: string }) => void } | null },
  checkoutOptions: { current: null as { onSuccess?: () => void; onError?: (error: { message: string }) => void } | null },
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ court: { attendance: { list: { invalidate: vi.fn() }, currentWindow: { invalidate: vi.fn() } } } }),
    court: {
      attendance: {
        self: { useQuery: () => ({ data: { id: 12, attendanceMode: "remote" } }) },
        list: { useQuery: () => ({ data: [], isLoading: false }) },
        currentWindow: { useQuery: () => ({ data: { kind: "check_in", shiftName: "الوردية الأساسية" } }) },
        record: { useMutation: (options: typeof recordOptions.current) => { recordOptions.current = options; return { mutate: recordMutate, isPending: false }; } },
        checkout: { useMutation: (options: typeof checkoutOptions.current) => { checkoutOptions.current = options; return { mutate: checkoutMutate, isPending: false }; } },
      },
    },
  },
}));

import AttendanceFirstGate from "./AttendanceFirstGate";

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); recordMutate.mockReset(); checkoutMutate.mockReset(); toastError.mockReset(); recordOptions.current = null; checkoutOptions.current = null; });

describe("نافذة الحضور الأولى", () => {
  it("تعرض تسجيل الحضور داخل نافذة الوردية وتستدعي المسار الذاتي المرتبط بالملف", async () => {
    render(<AttendanceFirstGate onComplete={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "تسجيل الحضور" }));
    expect(recordMutate).toHaveBeenCalledWith(expect.objectContaining({ profileId: 12, status: "present", note: "تأكيد حضور ضمن نافذة الوردية عبر ركيزة" }));
  });

  it("يعرض خطأ المسار للمستخدم بدلاً من تجاهل النقرة", () => {
    render(<AttendanceFirstGate onComplete={vi.fn()} />);
    recordOptions.current?.onError?.({ message: "نافذة الحضور مغلقة الآن." });
    expect(toastError).toHaveBeenCalledWith("نافذة الحضور مغلقة الآن.");
  });
  it("يعرض تأكيداً إلزامياً بعد تسجيل الحضور", async () => {
    render(<AttendanceFirstGate onComplete={vi.fn()} />);
    act(() => { recordOptions.current?.onSuccess?.(); });
    expect(await screen.findByRole("button", { name: "تأكيد وإغلاق" })).toBeTruthy();
  });
  it("يحفظ التخطي عند تجاهل اليوم", () => {
    render(<AttendanceFirstGate onComplete={vi.fn()} />);
    const key = `rakiza:attendance:skip:${new Date().toLocaleDateString("en-CA")}`;
    fireEvent.click(screen.getByRole("button", { name: "تجاهل اليوم" }));
    expect(localStorage.getItem(key)).toBe("true");
  });
});

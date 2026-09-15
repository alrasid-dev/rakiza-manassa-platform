// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loginMutate = vi.fn();
const setupMutate = vi.fn();
const isConfigured = vi.fn();
const locationAssign = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    court: {
      passcode: {
        isConfigured: { useQuery: (...args: unknown[]) => isConfigured(...args) },
        login: { useMutation: () => ({ mutateAsync: loginMutate, isPending: false }) },
        setup: { useMutation: () => ({ mutateAsync: setupMutate, isPending: false }) },
      },
    },
  },
}));

vi.mock("@/lib/pwa", () => ({ platformBasePath: () => "/" }));

import { PasscodeAuthPanel } from "./PasscodeAuthPanel";

const passcodeField = () => screen.getByLabelText(/^رمز المرور/);
const confirmField = () => screen.getByLabelText("تأكيد رمز المرور");

beforeEach(() => {
  // jsdom لا ينفّذ التنقل الحقيقي؛ نعوّضه لتجنّب خطأ "Not implemented".
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { assign: locationAssign, href: "http://localhost/" },
  });
  isConfigured.mockReturnValue({ data: { configured: true } });
});

afterEach(() => {
  cleanup();
  loginMutate.mockReset();
  setupMutate.mockReset();
  isConfigured.mockReset();
  locationAssign.mockReset();
});

describe("رمز المرور (6 أرقام)", () => {
  it("يفتح وضع الإنشاء تلقائياً عند أول دخول", () => {
    isConfigured.mockReturnValue({ data: { configured: false } });
    render(<PasscodeAuthPanel officialEmail="user@moj.gov.sa" validOfficialEmail />);
    expect(screen.getByText("أنشئ رمز المرور الخاص بك")).toBeTruthy();
    expect(screen.getByRole("button", { name: /حفظ الرمز ومتابعة الدخول/ })).toBeTruthy();
  });

  it("يرفض رمزاً غير مكوّن من 6 أرقام", () => {
    isConfigured.mockReturnValue({ data: { configured: false } });
    render(<PasscodeAuthPanel officialEmail="user@moj.gov.sa" validOfficialEmail />);
    fireEvent.change(passcodeField(), { target: { value: "123" } });
    fireEvent.change(confirmField(), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: /حفظ الرمز ومتابعة الدخول/ }));
    expect(screen.getByRole("status").textContent).toContain("6 أرقام");
    expect(setupMutate).not.toHaveBeenCalled();
  });

  it("يرفض تأكيداً غير مطابق للرمز", () => {
    isConfigured.mockReturnValue({ data: { configured: false } });
    render(<PasscodeAuthPanel officialEmail="user@moj.gov.sa" validOfficialEmail />);
    fireEvent.change(passcodeField(), { target: { value: "123456" } });
    fireEvent.change(confirmField(), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /حفظ الرمز ومتابعة الدخول/ }));
    expect(screen.getByRole("status").textContent).toContain("غير مطابق");
    expect(setupMutate).not.toHaveBeenCalled();
  });

  it("يحفظ الرمز ويبدأ الجلسة عند نجاح أول دخول", async () => {
    isConfigured.mockReturnValue({ data: { configured: false } });
    setupMutate.mockResolvedValue({ verified: true, configured: true });
    render(<PasscodeAuthPanel officialEmail="user@moj.gov.sa" validOfficialEmail />);
    fireEvent.change(passcodeField(), { target: { value: "123456" } });
    fireEvent.change(confirmField(), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /حفظ الرمز ومتابعة الدخول/ }));
    await waitFor(() => expect(setupMutate).toHaveBeenCalledWith({ officialEmail: "user@moj.gov.sa", passcode: "123456" }));
    expect(locationAssign).toHaveBeenCalledWith("/");
  });

  it("يدخل برمز المرور ويبدأ الجلسة عند النجاح", async () => {
    loginMutate.mockResolvedValue({ verified: true });
    render(<PasscodeAuthPanel officialEmail="user@moj.gov.sa" validOfficialEmail />);
    fireEvent.change(passcodeField(), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "دخول" }));
    await waitFor(() => expect(loginMutate).toHaveBeenCalledWith({ officialEmail: "user@moj.gov.sa", passcode: "123456" }));
    expect(locationAssign).toHaveBeenCalledWith("/");
  });

  it("يعرض رسالة الخطأ عند رفض رمز المرور", async () => {
    loginMutate.mockRejectedValue(new Error("رمز المرور غير صحيح."));
    render(<PasscodeAuthPanel officialEmail="user@moj.gov.sa" validOfficialEmail />);
    fireEvent.change(passcodeField(), { target: { value: "999999" } });
    fireEvent.click(screen.getByRole("button", { name: "دخول" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("رمز المرور غير صحيح"));
  });
});

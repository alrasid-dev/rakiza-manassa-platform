// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
const signInEmail = vi.fn();
const exchangeMutate = vi.fn();
const completeSetupMutate = vi.fn();

vi.mock("@/lib/firebase", () => ({
  authCreateUserWithEmailAndPassword: (email: string, password: string) => createUser(email, password),
  authSignInWithEmailAndPassword: (email: string, password: string) => signInEmail(email, password),
  authSendEmailVerification: async () => undefined,
  authSignOut: async () => undefined,
  authUpdatePassword: async () => undefined,
}));
vi.mock("@/lib/pwa", () => ({ platformBasePath: () => "/" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    court: {
      firebaseAuth: {
        exchange: { useMutation: () => ({ mutateAsync: exchangeMutate, isPending: false, error: null }) },
        completePasswordSetup: { useMutation: () => ({ mutateAsync: completeSetupMutate, isPending: false }) },
      },
    },
  },
}));

import { FirebaseAuthPanel } from "./FirebaseAuthPanel";

const passwordField = () => screen.getByPlaceholderText("8 خانات على الأقل");
const confirmField = () => screen.getByPlaceholderText("أعد كتابة كلمة المرور");
const activationProps = { officialEmail: "user@moj.gov.sa", validOfficialEmail: true, activationToken: "a".repeat(24) } as const;

afterEach(() => {
  cleanup();
  createUser.mockReset();
  signInEmail.mockReset();
  exchangeMutate.mockReset();
  completeSetupMutate.mockReset();
});

describe("سياسة كلمة المرور في لوحة الدخول", () => {
  it("توضح القاعدة للمستخدم في شاشة تعيين كلمة المرور", () => {
    render(<FirebaseAuthPanel {...activationProps} />);
    expect(screen.getByText(/8 خانات على الأقل، وتشمل حرفاً ورقماً معاً/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /حفظ كلمة المرور ومتابعة الدخول/ })).toBeTruthy();
  });

  it("ترفض كلمة مرور من أرقام فقط ولا تنشئ الحساب", () => {
    render(<FirebaseAuthPanel {...activationProps} />);
    fireEvent.change(passwordField(), { target: { value: "12345678" } });
    fireEvent.change(confirmField(), { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: /حفظ كلمة المرور ومتابعة الدخول/ }));
    expect(screen.getByRole("status").textContent).toContain("أضف حرفاً واحداً على الأقل");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("ترفض كلمة مرور من أحرف فقط ولا تنشئ الحساب", () => {
    render(<FirebaseAuthPanel {...activationProps} />);
    fireEvent.change(passwordField(), { target: { value: "abcdefgh" } });
    fireEvent.change(confirmField(), { target: { value: "abcdefgh" } });
    fireEvent.click(screen.getByRole("button", { name: /حفظ كلمة المرور ومتابعة الدخول/ }));
    expect(screen.getByRole("status").textContent).toContain("أضف رقماً واحداً على الأقل");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("ترفض كلمة المرور الأقصر من ثماني خانات", () => {
    render(<FirebaseAuthPanel {...activationProps} />);
    fireEvent.change(passwordField(), { target: { value: "rkz2026" } });
    fireEvent.change(confirmField(), { target: { value: "rkz2026" } });
    fireEvent.click(screen.getByRole("button", { name: /حفظ كلمة المرور ومتابعة الدخول/ }));
    expect(screen.getByRole("status").textContent).toContain("8 خانات على الأقل");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("يقبل كلمة مرور من أحرف وأرقام ويكمل إنشاء الحساب وربط الجلسة", async () => {
    createUser.mockResolvedValue({ user: { getIdToken: async () => "id-token" } });
    exchangeMutate.mockResolvedValue({ verified: true, provider: "password", mustChangePassword: true });
    const onPasswordSetupComplete = vi.fn();
    render(<FirebaseAuthPanel {...activationProps} onPasswordSetupComplete={onPasswordSetupComplete} />);
    fireEvent.change(passwordField(), { target: { value: "rakiza2026" } });
    fireEvent.change(confirmField(), { target: { value: "rakiza2026" } });
    fireEvent.click(screen.getByRole("button", { name: /حفظ كلمة المرور ومتابعة الدخول/ }));
    await waitFor(() => expect(createUser).toHaveBeenCalledWith("user@moj.gov.sa", "rakiza2026"));
    await waitFor(() => expect(exchangeMutate).toHaveBeenCalledWith({ idToken: "id-token", activationToken: "a".repeat(24), completePasswordSetup: true }));
    await waitFor(() => expect(onPasswordSetupComplete).toHaveBeenCalled());
    expect(screen.getByRole("status").textContent).toContain("يلزم تعيين كلمة مرور جديدة");
    expect(screen.getByRole("status").textContent).not.toContain("أضف");
  });

  it("لا تفرض التحقق بالبريد ولا التعقيد الجديد عند الدخول حتى لا يُحجب حساب قديم", async () => {
    signInEmail.mockResolvedValue({ user: { emailVerified: false, getIdToken: async () => "token" } });
    exchangeMutate.mockResolvedValue({ verified: true, provider: "password", mustChangePassword: true });
    render(<FirebaseAuthPanel officialEmail="user@moj.gov.sa" validOfficialEmail />);
    fireEvent.change(passwordField(), { target: { value: "abcdefgh" } });
    fireEvent.click(screen.getByRole("button", { name: "دخول" }));
    await waitFor(() => expect(signInEmail).toHaveBeenCalledWith("user@moj.gov.sa", "abcdefgh"));
    await waitFor(() => expect(exchangeMutate).toHaveBeenCalled());
  });

  it("تمنع الدخول بكلمة مرور أقصر من الحد الأدنى", () => {
    render(<FirebaseAuthPanel officialEmail="user@moj.gov.sa" validOfficialEmail />);
    fireEvent.change(passwordField(), { target: { value: "rk2026" } });
    fireEvent.click(screen.getByRole("button", { name: "دخول" }));
    expect(screen.getByRole("status").textContent).toContain("8 خانات على الأقل");
    expect(signInEmail).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const signOutMock = vi.fn(async () => undefined);
const signInWithPopupMock = vi.fn();
const exchangeMutate = vi.fn();

vi.mock("@/lib/firebase", () => ({
  authSignInWithPopup: () => signInWithPopupMock(),
  authSignInWithRedirect: async () => undefined,
  authGetRedirectResult: async () => null,
  authSignOut: () => signOutMock(),
}));
vi.mock("@/lib/pwa", () => ({ platformBasePath: () => "/" }));
vi.mock("@/lib/trpc", () => ({ trpc: { court: { firebaseAuth: { exchange: { useMutation: () => ({ mutateAsync: exchangeMutate, isPending: false }) } } } } }));
vi.mock("./ui/button", () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));

import { OwnerGoogleLogin } from "./OwnerGoogleLogin";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("دخول المالك عبر Google", () => {
  it("يرفض أي حساب غير بريد المالك ويغلق جلسته فوراً", async () => {
    signInWithPopupMock.mockResolvedValue({ user: { email: "employee@moj.gov.sa", getIdToken: async () => "token" } });
    render(<OwnerGoogleLogin />);
    fireEvent.click(screen.getByRole("button", { name: "الدخول عبر Google بحساب مالك المنصة" }));
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(exchangeMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("مخصص لبريد مالك المنصة");
  });

  it("يقبل بريد المالك ويربط جلسته بخادم رَكيزة", async () => {
    signInWithPopupMock.mockResolvedValue({ user: { email: "rakizaplatform@gmail.com", getIdToken: async () => "owner-token" } });
    exchangeMutate.mockResolvedValue({ verified: true, provider: "google.com", mustChangePassword: false });
    render(<OwnerGoogleLogin />);
    fireEvent.click(screen.getByRole("button", { name: "الدخول عبر Google بحساب مالك المنصة" }));
    await waitFor(() => expect(exchangeMutate).toHaveBeenCalledWith({ idToken: "owner-token" }));
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("يوضح أن المسار مخصص للبريد الاستثنائي وحده", () => {
    render(<OwnerGoogleLogin />);
    expect(screen.getByText("rakizaplatform@gmail.com")).toBeTruthy();
    expect(screen.getByText(/دون كلمة مرور تقليدية/)).toBeTruthy();
  });
});

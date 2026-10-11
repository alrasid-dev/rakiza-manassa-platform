// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    court: {
      workPreferences: {
        mine: { useQuery: () => ({ data: undefined }) },
        update: { useMutation: () => ({ mutate: vi.fn() }) },
      },
    },
  },
}));

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return <button type="button" onClick={toggleTheme} aria-label="تبديل الثيم">{theme}</button>;
}

describe("ThemeProvider", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), clear: () => store.clear() } });
  });

  it("يبدل الثيم ويحفظه للمستخدم", () => {
    render(<ThemeProvider switchable><Probe /></ThemeProvider>);
    const button = screen.getByRole("button", { name: "تبديل الثيم" });
    expect(button.textContent).toBe("light");
    fireEvent.click(button);
    expect(button.textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem("rakiza:theme:1")).toBe("dark");
    fireEvent.click(button);
    expect(button.textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});

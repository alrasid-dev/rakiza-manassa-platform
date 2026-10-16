// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupportPage } from "./SupportPage";

const { mockState } = vi.hoisted(() => ({ mockState: { capabilities: [] as string[] } }));

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/usePermissionsSnapshot", () => ({
  usePermissionsSnapshot: () => ({
    permission: null,
    roles: [],
    isReady: true,
    capabilities: mockState.capabilities,
    can: (capability: string) => mockState.capabilities.includes(capability),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ court: { support: { list: { invalidate: vi.fn() } } } }),
    court: {
      support: {
        list: { useQuery: () => ({ data: [] }) },
        detail: { useQuery: () => ({ data: undefined }) },
        create: { useMutation: () => ({ isPending: false }) },
        comment: { useMutation: () => ({ isPending: false }) },
        resolve: { useMutation: () => ({ isPending: false }) },
      },
    },
  },
}));

let queryClient: QueryClient;
beforeEach(() => {
  queryClient = new QueryClient();
  mockState.capabilities = [];
});
afterEach(() => cleanup());

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("SupportPage — قدرة support", () => {
  it("يعرض «تذاكر نطاق الدعم» عند امتلاك support", () => {
    mockState.capabilities = ["support"];
    render(<SupportPage />, { wrapper });
    expect(screen.getByText("تذاكر نطاق الدعم")).toBeTruthy();
  });

  it("يعرض «تذاكرك المسجلة» عند عدم امتلاك support", () => {
    render(<SupportPage />, { wrapper });
    expect(screen.getByText("تذاكرك المسجلة")).toBeTruthy();
  });
});

// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveChatWidget } from "./LiveChatWidget";

// قدرات مقلّدة قابلة للتعديل في كل اختبار (تحاكي myCapabilities).
const { mockState } = vi.hoisted(() => ({ mockState: { capabilities: [] as string[] } }));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
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
    court: {
      people: { self: { useQuery: () => ({ data: { id: 1 } }) } },
      communications: {
        conversations: {
          createSupport: { useMutation: () => ({ mutateAsync: vi.fn(async () => 1) }) },
          get: { useQuery: () => ({ data: { messages: [] } }) },
          unreadCount: { useQuery: () => ({ data: 0 }) },
          send: { useMutation: () => ({ isPending: false }) },
        },
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

describe("LiveChatWidget — قدرة support", () => {
  it("يُخفى عن موظف الدعم (capabilities تتضمن support)", () => {
    mockState.capabilities = ["support"];
    render(<LiveChatWidget />, { wrapper });
    expect(screen.queryByRole("button", { name: "محادثة الدعم" })).toBeNull();
  });

  it("يظهر للمستخدم بلا قدرات (capabilities فارغة)", () => {
    render(<LiveChatWidget />, { wrapper });
    expect(screen.queryByRole("button", { name: "محادثة الدعم" })).not.toBeNull();
  });

  it("يظهر عند قدرة أخرى غير support", () => {
    mockState.capabilities = ["manage_tasks"];
    render(<LiveChatWidget />, { wrapper });
    expect(screen.queryByRole("button", { name: "محادثة الدعم" })).not.toBeNull();
  });

  it("يُخفى عن المالك (كل القدرات تتضمن support)", () => {
    mockState.capabilities = ["support", "manage_tasks", "manage_hr", "manage_operations", "view_whole_platform"];
    render(<LiveChatWidget />, { wrapper });
    expect(screen.queryByRole("button", { name: "محادثة الدعم" })).toBeNull();
  });
});

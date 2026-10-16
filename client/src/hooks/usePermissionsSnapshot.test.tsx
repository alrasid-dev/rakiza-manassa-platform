// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePermissionsSnapshot } from "./usePermissionsSnapshot";

// مقلّد لدوال tRPC الفعلية التي يستدعيها الـ hook: myPermission و myRoles.
const { mockPermissionUseQuery, mockRolesUseQuery } = vi.hoisted(() => ({
  mockPermissionUseQuery: vi.fn(),
  mockRolesUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    court: {
      registration: { myPermission: { useQuery: mockPermissionUseQuery } },
      myRoles: { useQuery: mockRolesUseQuery },
    },
  },
}));

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("usePermissionsSnapshot", () => {
  it("يعيد snapshot ثابت لا يتغير مرجعه بين الرندرات عند نفس البيانات", () => {
    const rolesData = ["court_president"];
    mockPermissionUseQuery.mockReturnValue({ isSuccess: true, data: "full_control", isLoading: false });
    mockRolesUseQuery.mockReturnValue({ isSuccess: true, data: rolesData, isLoading: false });

    const { result, rerender } = renderHook(() => usePermissionsSnapshot(), { wrapper });

    expect(result.current.permission).toBe("full_control");
    expect(result.current.isReady).toBe(true);
    const firstRoles = result.current.roles;
    expect(firstRoles).toEqual(["court_president"]);

    rerender();

    // نفس المرجع — لم تُنشأ مصفوفة جديدة عند نفس البيانات.
    expect(result.current.roles).toBe(firstRoles);
    expect(result.current.permission).toBe("full_control");
  });

  it("يعيد قيم افتراضية آمنة قبل اكتمال التحميل", () => {
    // استعلامان معلّقان إلى الأبد (لا يصلان إلى isSuccess).
    mockPermissionUseQuery.mockReturnValue({ isSuccess: false, data: undefined, isLoading: true });
    mockRolesUseQuery.mockReturnValue({ isSuccess: false, data: undefined, isLoading: true });

    const { result } = renderHook(() => usePermissionsSnapshot(), { wrapper });

    expect(result.current.permission).toBe(null);
    expect(result.current.roles).toEqual([]);
    expect(result.current.isReady).toBe(false);
  });

  it("يعكس البيانات الجديدة بعد اكتمال التحميل", async () => {
    mockPermissionUseQuery.mockReturnValue({ isSuccess: true, data: "employee", isLoading: false });
    mockRolesUseQuery.mockReturnValue({ isSuccess: true, data: ["human_resources_manager"], isLoading: false });

    const { result } = renderHook(() => usePermissionsSnapshot(), { wrapper });

    await waitFor(() => expect(result.current.permission).toBe("employee"));
    expect(result.current.roles).toEqual(["human_resources_manager"]);
    expect(result.current.isReady).toBe(true);
  });
});

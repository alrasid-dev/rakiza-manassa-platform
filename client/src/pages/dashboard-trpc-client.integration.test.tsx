// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React, { type ReactNode } from "react";
import superjson from "superjson";
import { afterEach, describe, expect, it, vi } from "vitest";
import { trpc } from "@/lib/trpc";
import { PeoplePage, ReportsDashboardPage, TraineeManagementPage } from "./FunctionalPages";

const leader = { id: 1, role: "admin" as const, name: "رئيس المحكمة", email: "president@court.example", openId: "president" };
const responses: Record<string, unknown> = {
  "auth.me": leader,
  "court.registration.myPermission": "full_control",
  "court.myRoles": ["court_president"],
  "court.notifications.listMine": [],
  "court.people.list": [{ id: 10, fullName: "موظف من خدمة tRPC", personType: "administrative", status: "active", jobTitle: "موظف إداري", judicialFormation: null, unitId: 1 }],
  "court.people.delegations": [],
  "court.trainees.overview": [{ profile: { id: 22, fullName: "ملازم من خدمة tRPC", judicialFormation: "الدائرة الأولى" }, transferState: "ready", points: 8, openDelayCount: 0, incompleteTaskCount: 0, transferReasons: [] }],
  "court.units.list": [{ id: 1, name: "شؤون الملازمين" }],
  "court.reports.operational": { period: "daily", startAt: "2026-08-14T00:00:00.000Z", tasks: { total: 2, completed: 1, overdue: 0 }, delays: { total: 0, open: 0, overdue: 0 }, scores: { positive: 2, negative: 0 }, transfers: { ready: 1, notReady: 0 } },
  "court.scoring.list": [],
};

function responseForRequest(input: RequestInfo | URL) {
  const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
  const procedures = url.pathname.split("/").at(-1)?.split(",") ?? [];
  return new Response(JSON.stringify(procedures.map(procedure => ({ result: { data: { json: responses[procedure] ?? null } } }))), { status: 200, headers: { "content-type": "application/json" } });
}

function renderWithRealTrpc(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => responseForRequest(input));
  const client = trpc.createClient({ links: [httpBatchLink({ url: "http://localhost/api/trpc", transformer: superjson, fetch: fetchMock as typeof fetch })] });
  return { fetchMock, ...render(<trpc.Provider client={client} queryClient={queryClient}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></trpc.Provider>) };
}

afterEach(() => cleanup());

describe("تدفق الجلسة والصفحات التشغيلية عبر عميل tRPC", () => {
  it("ينفذ auth.me ثم يظهر صفحة الأفراد بعد استعلاماتها الحقيقية", async () => {
    const { fetchMock } = renderWithRealTrpc(<PeoplePage />);
    // مهلة صريحة: هذا الاختبار يركّب تخطيط التطبيق الحقيقي مع عميل tRPC فعلي،
    // ويشتد الحمل عليه عند تشغيله مع بقية الحزمة بالتوازي فيتأخر ظهور الجدول.
    await waitFor(() => expect(screen.getByText("موظف من خدمة tRPC")).toBeTruthy(), { timeout: 15_000 });
    expect(screen.getByText("رئيس المحكمة")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("auth.me"))).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("court.people.list"))).toBe(true);
  });

  it("يظهر صفحة الملازمين ومؤشرات التقرير بعد اكتمال استعلامات العميل", async () => {
    const trainees = renderWithRealTrpc(<TraineeManagementPage />);
    await waitFor(() => expect(screen.getByText("ملازم من خدمة tRPC")).toBeTruthy(), { timeout: 15_000 });
    expect(trainees.fetchMock.mock.calls.some(([input]) => String(input).includes("court.trainees.overview"))).toBe(true);
    cleanup();

    const reports = renderWithRealTrpc(<ReportsDashboardPage />);
    await waitFor(() => expect(screen.getAllByText("2").length).toBeGreaterThan(0), { timeout: 15_000 });
    expect(reports.fetchMock.mock.calls.some(([input]) => String(input).includes("court.reports.operational"))).toBe(true);
    expect(screen.queryByText(/جارٍ احتساب التقرير/)).toBeNull();
  });
});

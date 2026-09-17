import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ inserts: 0, updates: 0 }));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => [{ id: 9, sourceType: "trainee_excel", isActive: true, storageKey: "sources/trainees.xlsx", lastFingerprint: null, createdByUserId: 1 }]) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => { state.updates += 1; }) })) })),
    insert: vi.fn(() => { state.inserts += 1; return { values: vi.fn(async () => [{ insertId: state.inserts }]) }; }),
  })),
}));

vi.mock("./storage", () => ({ storageGetSignedUrl: vi.fn(async () => "https://storage.example/trainees.xlsx"), storagePut: vi.fn() }));

import { scanLinkedTraineeExcelSource } from "./court-service";

function nonTraineeWorkbook() {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["تصنيف التعثر", "تاريخ نشوء التعثر", "حالة المعالجة", "اسم الملازم القضائي"],
    ["إجراء إداري داخلي", "2026-08-14", "تحت المتابعة", ""],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "المصدر");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("خدمة فحص مصدر Excel المرتبط", () => {
  afterEach(() => { vi.unstubAllGlobals(); state.inserts = 0; state.updates = 0; });

  it("تتوقف قبل إنشاء import batch أو مهمة عندما لا يحتوي الملف على صف ملازم قضائي", async () => {
    const content = nonTraineeWorkbook();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(content as any, { status: 200 })));

    const result = await scanLinkedTraineeExcelSource();

    expect(result).toMatchObject({ skipped: "no-trainee-rows", createdTasks: 0, createdChanges: 0, skippedRows: 1 });
    expect(state.inserts).toBe(0);
    expect(state.updates).toBe(1);
  });
});

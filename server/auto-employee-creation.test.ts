import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessGrants, notifications, personProfiles, registrationRequests, users } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));

import { reviewRegistrationRequest } from "./court-service";

const pendingRequest = {
  id: 81,
  fullName: "فهد عبدالله محمد القحطاني",
  officialEmail: "fahad@court.example",
  notificationEmail: "fahad.notify@court.example",
  status: "pending",
};

function createFakeDb() {
  let currentTable: unknown = null;
  let insertId = 0;
  const state = { inserts: [] as Array<{ table: unknown; values: any }>, updates: [] as any[] };

  const selectChain = {
    from: (table: unknown) => {
      currentTable = table;
      return selectChain;
    },
    where: () => selectChain,
    limit: async () => (currentTable === registrationRequests ? [pendingRequest] : []),
  };

  const insertResult = (table: unknown, values: any) => {
    state.inserts.push({ table, values });
    insertId += 1;
    const thenable: any = {
      then: (resolve: (v: unknown) => void) => resolve([{ insertId }]),
      onDuplicateKeyUpdate: () => ({ then: (resolve: (v: unknown) => void) => resolve([{ insertId }]) }),
    };
    return thenable;
  };

  return {
    select: () => selectChain,
    update: () => ({ set: (v: any) => ({ where: async () => { state.updates.push(v); } }) }),
    insert: (table: unknown) => ({ values: (values: any) => insertResult(table, values) }),
    state,
  };
}

describe("إنشاء الموظف تلقائياً عند قبول التسجيل", () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
  });

  it("ينشئ مستخدماً وملف موظف ومنح وصول وإشعار ترحيب", async () => {
    const db = createFakeDb();
    mocks.getDb.mockResolvedValue(db);

    await reviewRegistrationRequest({ requestId: 81, decision: "approved", permission: "employee", reviewedByUserId: 7 });

    const userInsert = db.state.inserts.find((e) => e.table === users);
    expect(userInsert?.values).toMatchObject({ openId: "seed:fahad@court.example", email: "fahad@court.example", role: "user" });

    const profileInsert = db.state.inserts.find((e) => e.table === personProfiles);
    expect(profileInsert?.values).toMatchObject({ fullName: pendingRequest.fullName, personType: "administrative", status: "active" });

    const grantInsert = db.state.inserts.find((e) => e.table === accessGrants);
    expect(grantInsert?.values).toMatchObject({ permission: "employee", officialEmail: pendingRequest.officialEmail });

    const welcome = db.state.inserts.find((e) => e.table === notifications);
    expect(welcome?.values).toMatchObject({ title: "مرحباً بك في منصة ركيزة" });
  });
});

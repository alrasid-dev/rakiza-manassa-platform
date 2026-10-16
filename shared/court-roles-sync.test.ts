// shared/court-roles-sync.test.ts
// يضمن تطابق قائمة الأدوار المشتركة (COURT_ROLES) مع enum قاعدة البيانات (drizzle/schema.ts).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COURT_ROLES } from "./role-capabilities";

const schemaPath = fileURLToPath(new URL("../drizzle/schema.ts", import.meta.url));
const schemaSource = readFileSync(schemaPath, "utf8");

// استخرج قيم enum الدور من كل تعريف `role: mysqlEnum("role", [...])`.
// يوجد تعريفان: court_role_assignments.role و permission_delegations.role.
const roleEnumValues: string[][] = [...schemaSource.matchAll(/role:\s*mysqlEnum\("role",\s*\[([^\]]*)\]/g)]
  .map((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]))
  .filter((values) => values.includes("court_president")); // استبعد enum الأدوار العامة (user/admin)

describe("court-roles-sync", () => {
  it("COURT_ROLES يحتوي على 13 دوراً", () => {
    expect(COURT_ROLES).toHaveLength(13);
  });

  it("assistant_secretary في نهاية COURT_ROLES (فهرس 12)", () => {
    expect(COURT_ROLES[12]).toBe("assistant_secretary");
  });

  it("يوجد تعريفان لـ role enum في schema (جدولا الأدوار والتفويضات)", () => {
    expect(roleEnumValues).toHaveLength(2);
  });

  it("enum قاعدة البيانات يطابق COURT_ROLES (نفس القيم والترتيب)", () => {
    for (const values of roleEnumValues) {
      expect(values).toEqual([...COURT_ROLES]);
    }
  });

  it("assistant_secretary في نهاية enum قاعدة البيانات (فهرس 12)", () => {
    for (const values of roleEnumValues) {
      expect(values[12]).toBe("assistant_secretary");
    }
  });
});
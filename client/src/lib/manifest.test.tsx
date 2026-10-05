import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("manifest.webmanifest", () => {
  it("is valid JSON with required fields", () => {
    const raw = readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8");
    const m = JSON.parse(raw) as { name?: string; short_name?: string; display?: string; icons?: unknown[]; start_url?: string };
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBeTruthy();
    expect(Array.isArray(m.icons)).toBe(true);
    expect((m.icons ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

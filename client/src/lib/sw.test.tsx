import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("service worker push handler", () => {
  it("registers with vibrate + requireInteraction", () => {
    const raw = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
    expect(raw).toContain("vibrate");
    expect(raw).toContain("requireInteraction");
    expect(raw).toContain("silent");
    expect(raw).toContain("showNotification");
  });
});
